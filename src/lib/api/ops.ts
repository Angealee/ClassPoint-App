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
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tableName: r.table_name as string,
    lastSnapshot: (r.last_snapshot as string | null) ?? null,
    rowCount: Number(r.row_count ?? 0),
    snapshotDays: Number(r.snapshot_days ?? 0),
  }))
}

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
