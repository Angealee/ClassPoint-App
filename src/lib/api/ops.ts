/**
 * Instructor ops (0034).
 *
 * The read side for four systems that already ran in the database and had no
 * surface in the app: the nightly backup, the audit log, the auth-event trail,
 * and the on-demand leaderboard refresh. Plus broadcast, the risk overview and
 * the per-term attendance workbook.
 */
import { supabase } from '@/lib/supabase'
import { rpc } from './_internal'
import type {
  AbsenceRisk,
  AuditEntry,
  AuthEvent,
  BackupHealth,
  SectionOverview,
  TermAttendanceRow,
  TermKey,
} from '@/lib/types'

/** Freshness of every backed-up table. Instructor-gated in SQL. */
export async function getBackupHealth(): Promise<BackupHealth[]> {
  const { data, error } = await supabase.rpc('get_backup_health')
  if (error) throw error
  // RPC returns are typed `unknown` on purpose (see database.types.ts SCOPE) —
  // cast the array once, the same way the attendance module does.
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tableName: r.table_name as string,
    lastSnapshot: (r.last_snapshot as string | null) ?? null,
    rowCount: Number(r.row_count ?? 0),
    snapshotDays: Number(r.snapshot_days ?? 0),
  }))
}

/**
 * The destructive-action trail, newest first. Offset paging is fine here (and
 * keyset is not worth it): rows are only ever appended by deletes the
 * instructor themselves just performed, so a page boundary can't shift under a
 * reader the way a live student feed would.
 */
export async function listAuditLog(limit = 30, offset = 0): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, at, actor, action, table_name, row_id, student_id, summary, row_data')
    .order('at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    at: r.at,
    actor: r.actor,
    action: r.action,
    tableName: r.table_name,
    rowId: r.row_id,
    studentId: r.student_id,
    summary: r.summary,
    rowData: (r.row_data ?? {}) as Record<string, unknown>,
  }))
}

/** Recent claim / PIN-reset attempts (0026). Instructor-select only by RLS. */
export async function listAuthEvents(limit = 30): Promise<AuthEvent[]> {
  const { data, error } = await supabase
    .from('auth_events')
    .select('id, at, kind, success, ip, user_agent, student_id, detail')
    .order('at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    at: r.at,
    kind: r.kind,
    success: r.success,
    ip: r.ip,
    userAgent: r.user_agent,
    studentId: r.student_id,
    detail: r.detail,
  }))
}

/** Rebuild the frozen leaderboard now instead of waiting for the cron. */
export async function forceLeaderboardRefresh(): Promise<void> {
  await rpc('force_leaderboard_refresh')
}

/** Per-section "what needs finishing" signals. */
export async function getSectionOverview(): Promise<SectionOverview[]> {
  const { data, error } = await supabase.rpc('get_section_overview')
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    sectionId: r.section_id as string,
    lastSessionAt: (r.last_session_at as string | null) ?? null,
    activeSession: Boolean(r.active_session),
    unfinalized: Number(r.unfinalized ?? 0),
  }))
}

/**
 * Students with unexcused absences across every section this semester, with
 * `actionable` counting the ones still inside the 7-day excuse window.
 */
export async function getAbsenceRisk(): Promise<AbsenceRisk[]> {
  const { data, error } = await supabase.rpc('get_absence_risk')
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    studentId: r.student_id as string,
    displayName: r.display_name as string,
    fullName: r.full_name as string,
    sectionId: r.section_id as string,
    sectionName: r.section_name as string,
    unexcused: Number(r.unexcused ?? 0),
    actionable: Number(r.actionable ?? 0),
    nextDeadline: (r.next_deadline as string | null) ?? null,
    lastAbsenceAt: (r.last_absence_at as string | null) ?? null,
  }))
}

/**
 * One section's attendance across one term. Attendance only — points never
 * feed a grade, so the workbook deliberately has no points column.
 */
export async function getTermAttendance(
  sectionId: string,
  term: TermKey,
): Promise<TermAttendanceRow[]> {
  const { data, error } = await supabase.rpc('get_term_attendance', {
    p_section_id: sectionId,
    p_term: term,
  })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    studentId: r.student_id as string,
    fullName: r.full_name as string,
    displayName: r.display_name as string,
    present: Number(r.present ?? 0),
    late: Number(r.late ?? 0),
    absent: Number(r.absent ?? 0),
    excused: Number(r.excused ?? 0),
    irregular: Number(r.irregular ?? 0),
    counted: Number(r.counted ?? 0),
    showUpRate: Number(r.show_up_rate ?? 0),
  }))
}

/**
 * Active students per section id.
 *
 * Deliberately not `getSectionStats`, which also fetches every student's claim
 * token in chunks to compute a claimed-count. The broadcast composer needs a
 * headcount and nothing else, and it should not be pulling secrets over the
 * wire to get one.
 */
export async function getSectionHeadcounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('students')
    .select('section_id')
    .is('archived_at', null)
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const r of data ?? []) {
    const id = r.section_id as string
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

/**
 * Send an announcement to one section, or to every section this semester when
 * `sectionId` is null. Returns how many students it actually reached.
 *
 * The SQL refuses an empty target rather than reporting a cheerful zero — an
 * empty send always means the wrong thing was picked.
 */
export async function sendBroadcast(input: {
  title: string
  body: string
  url?: string
  sectionId: string | null
}): Promise<number> {
  const n = await rpc<number>('send_broadcast', {
    p_title: input.title,
    p_body: input.body,
    p_url: input.url?.trim() || '/app',
    p_section_id: input.sectionId,
  })
  return Number(n ?? 0)
}
