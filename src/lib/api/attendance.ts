import { supabase } from '@/lib/supabase'
import { oneEmbed, rpc, withAuthRetry, fetchAllPages } from './_internal'
import type {
  Achievement,
  AchievementProgress,
  AchievementState,
  AttendanceAnalytics,
  AttendanceRosterRow,
  AttendanceStatus,
  ClassSession,
  MyAttendanceEntry,
  OfflineScanOutcome,
  ScanResult,
  SessionConfig,
  SessionSummary,
  UnlockedAchievement,
} from '@/lib/types'

// ============================================================================
// Attendance — QR class sessions (migration 0014)
// ============================================================================

/** Shape of a raw class_sessions row (snake_case) as read from the DB. */

interface SessionRow {
  id: string
  section_id: string
  subject_id: string | null
  /** Embedded via the subjects FK — see oneEmbed above. */
  subjects: { code: string; name: string } | { code: string; name: string }[] | null
  topic: string | null
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
  late_after_min: number
  absent_after_min: number
  late_penalty: number
  absent_penalty: number
  apply_penalties: boolean
  penalties_committed: boolean
}

const SESSION_COLS =
  'id, section_id, subject_id, subjects(code, name), topic, status, started_at, ended_at, late_after_min, absent_after_min, late_penalty, absent_penalty, apply_penalties, penalties_committed'

function mapSession(r: SessionRow, qrSecret?: string): ClassSession {
  const subject = oneEmbed<{ code: string; name: string }>(r.subjects)
  return {
    id: r.id,
    sectionId: r.section_id,
    subjectId: r.subject_id,
    subjectCode: subject?.code ?? null,
    subjectName: subject?.name ?? null,
    topic: r.topic,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    lateAfterMin: r.late_after_min,
    absentAfterMin: r.absent_after_min,
    latePenalty: r.late_penalty,
    absentPenalty: r.absent_penalty,
    applyPenalties: r.apply_penalties,
    penaltiesCommitted: r.penalties_committed,
    ...(qrSecret ? { qrSecret } : {}),
  }
}

/** Instructor-only: read the rotating-QR secret for a session (RLS-gated). */
async function getSessionSecret(sessionId: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('class_session_secrets')
    .select('qr_secret')
    .eq('session_id', sessionId)
    .maybeSingle<{ qr_secret: string }>()
  if (error) throw error
  return data?.qr_secret ?? undefined
}


/**
 * Start (or resume) a class session for a section. Returns the session with its
 * rotating-QR secret so the instructor's browser can render the live QR code.
 *
 * Resilient by design: the RPC's INSERT commits server-side before it returns, so
 * even if we can't read its id back — a stale deployed function whose OUT columns
 * are named differently, or a transient auth blip on the follow-up read — we fall
 * back to the section's now-active session. That's why a manual reload always
 * "fixed" a failed Start: it just resumed the session the RPC had already created.
 */
export async function startClassSession(config: SessionConfig): Promise<ClassSession> {
  return withAuthRetry(async () => {
    const { data, error } = await supabase
      .rpc('start_class_session', {
        p_section_id: config.sectionId,
        p_subject_id: config.subjectId,
        p_topic: config.topic.trim() || null,
        p_late_after_min: config.lateAfterMin,
        p_absent_after_min: config.absentAfterMin,
        p_late_penalty: config.latePenalty,
        p_absent_penalty: config.absentPenalty,
        p_apply_penalties: config.applyPenalties,
      })
      .maybeSingle<Record<string, string>>()
    if (error) throw error

    // Tolerate either column naming (out_session_id / session_id / id).
    const sessionId = data?.out_session_id ?? data?.session_id ?? data?.id
    const secret = data?.out_qr_secret ?? data?.qr_secret
    if (sessionId) {
      const row = await supabase
        .from('class_sessions')
        .select(SESSION_COLS)
        .eq('id', sessionId)
        .maybeSingle<SessionRow>()
      if (!row.error && row.data) {
        return mapSession(row.data, secret ?? (await getSessionSecret(sessionId)))
      }
    }

    // Couldn't read the id back — resume the session the RPC just created/resumed.
    const active = await getActiveSession(config.sectionId)
    if (active) return active
    throw new Error('Could not start the class. Try again.')
  })
}

/** One session by id (no QR secret). Used to re-open a session for finalising. */
export async function getSession(id: string): Promise<ClassSession | null> {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(SESSION_COLS)
    .eq('id', id)
    .maybeSingle<SessionRow>()
  if (error) throw error
  return data ? mapSession(data) : null
}

/** The section's currently-active session (with its QR secret), or null. */
export async function getActiveSession(sectionId: string): Promise<ClassSession | null> {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(SESSION_COLS)
    .eq('section_id', sectionId)
    .eq('status', 'active')
    .maybeSingle<SessionRow>()
  if (error) throw error
  if (!data) return null
  const secret = await getSessionSecret(data.id)
  return mapSession(data, secret)
}

/**
 * The section's active session as a STUDENT sees it (0033).
 *
 * Deliberately not `getActiveSession`: that one also reads
 * `class_session_secrets` for the rotating QR, which RLS hides from students —
 * so it would fire a guaranteed-empty query on every student app open. A
 * student never needs the secret; they scan the code off the projector.
 *
 * `class_sessions` is readable by any authenticated user (0014) and joined the
 * realtime publication in 0033, which is what lets the live banner appear the
 * moment the instructor starts class.
 */
export async function getActiveSessionForStudent(
  sectionId: string,
): Promise<ClassSession | null> {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(SESSION_COLS)
    .eq('section_id', sectionId)
    .eq('status', 'active')
    .maybeSingle<SessionRow>()
  if (error) throw error
  return data ? mapSession(data) : null
}

/**
 * This student's own status in one session, or null if they have no record yet
 * (0033). Used by the live-class banner to stop saying "Scan now" at someone
 * who already scanned — a whole section seeing a stale prompt every class is
 * exactly the kind of small lie that teaches people to ignore banners.
 */
export async function getMySessionStatus(
  sessionId: string,
  studentId: string,
): Promise<AttendanceStatus | null> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('status')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle<{ status: AttendanceStatus }>()
  if (error) throw error
  return data?.status ?? null
}

/** A zeroed tally — one counter per status, plus roster total + late-sync count. */
function emptyTally(): Record<AttendanceStatus, number> & { total: number; syncedLate: number } {
  return { present: 0, late: 0, absent: 0, excused: 0, irregular: 0, total: 0, syncedLate: 0 }
}

/** Past + present sessions for a section, tallied by status. */
export async function listSessions(sectionId: string): Promise<SessionSummary[]> {
  const { data: sessions, error } = await supabase
    .from('class_sessions')
    .select('id, subject_id, subjects(code), topic, started_at, ended_at, status, penalties_committed')
    .eq('section_id', sectionId)
    .order('started_at', { ascending: false })
  if (error) throw error
  const rows = sessions ?? []
  if (rows.length === 0) return []

  // Tallied in SQL (0031): the old `.in(session_ids)` record fetch hit
  // PostgREST's silent 1000-row cap around week 12 of a two-subject semester,
  // making late sessions read "0 present". One row per session, never grows.
  const { data: tallies, error: recErr } = await supabase.rpc('get_section_session_tallies', {
    p_section_id: sectionId,
  })
  if (recErr) throw recErr

  const tally = new Map<string, ReturnType<typeof emptyTally>>()
  for (const r of (tallies ?? []) as Array<{
    session_id: string
    present: number
    late: number
    absent: number
    excused: number
    irregular: number
    total: number
    synced_late: number
  }>) {
    tally.set(r.session_id, {
      present: r.present,
      late: r.late,
      absent: r.absent,
      excused: r.excused,
      irregular: r.irregular,
      total: r.total,
      syncedLate: r.synced_late,
    })
  }

  return rows.map((s) => {
    const t = tally.get(s.id as string) ?? emptyTally()
    const subject = oneEmbed<{ code: string }>(s.subjects)
    return {
      id: s.id as string,
      subjectId: (s.subject_id as string | null) ?? null,
      subjectCode: subject?.code ?? null,
      topic: (s.topic as string | null) ?? null,
      startedAt: s.started_at as string,
      endedAt: (s.ended_at as string | null) ?? null,
      status: s.status as 'active' | 'ended',
      penaltiesCommitted: s.penalties_committed as boolean,
      ...t,
    }
  })
}

/**
 * The roster for one session: every student in the section merged with their
 * attendance record (status / scan time), if any. Powers the live roster and the
 * end-of-class review.
 */
export async function listSessionAttendance(
  sessionId: string,
  sectionId: string,
): Promise<AttendanceRosterRow[]> {
  const [students, records] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, avatar_url, archived_at')
      .eq('section_id', sectionId),
    supabase
      .from('attendance_records')
      .select('id, student_id, status, scanned_at, committed, synced_late')
      .eq('session_id', sessionId),
  ])
  if (students.error) throw students.error
  if (records.error) throw records.error

  const byStudent = new Map(records.data?.map((r) => [r.student_id as string, r]) ?? [])
  return (students.data ?? [])
    .map((s) => {
      const rec = byStudent.get(s.id as string)
      return {
        studentId: s.id as string,
        fullName: s.full_name as string,
        avatarUrl: (s.avatar_url as string | null) ?? null,
        archived: (s.archived_at as string | null) != null,
        recordId: (rec?.id as string) ?? null,
        status: (rec?.status as AttendanceStatus) ?? null,
        scannedAt: (rec?.scanned_at as string | null) ?? null,
        committed: (rec?.committed as boolean) ?? false,
        syncedLate: (rec?.synced_late as boolean) ?? false,
      }
    })
    // History stays truthful, live rosters stay clean: an archived student
    // appears only when they actually have a record in this session.
    .filter((r) => !r.archived || r.recordId !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/**
 * Change a student's status — the ONE path for it (review step, session detail,
 * any post-hoc edit).
 *
 * Goes through the RPC rather than a direct update because the RPC reconciles
 * the points ledger: if the session's penalties were already committed, it
 * removes the old penalty event and writes the one the new status deserves.
 * A direct `.update({ status })` would silently leave a stale −5 behind.
 */
export async function updateAttendanceStatus(
  recordId: string,
  status: AttendanceStatus,
): Promise<void> {
  await rpc('set_attendance_status', { p_record_id: recordId, p_status: status })
}

/**
 * Delete one attendance record (reset a check-in). Removes the linked penalty
 * event first, so resetting a committed record gives the points back instead of
 * orphaning the deduction.
 */
export async function deleteAttendanceRecord(recordId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_attendance_record', {
    p_record_id: recordId,
  })
  if (error) throw error
}

/**
 * Instructor manually checks a student in during a live class — for students
 * with no internet to scan. Upserts the record (overriding a prior scan if any)
 * and stamps scanned_at so they count as checked in. RLS lets the instructor
 * write attendance_records directly, so no RPC is needed.
 *
 * LIVE SESSIONS ONLY: penalties aren't committed yet, so there's nothing to
 * reconcile. For any edit after finalising, use updateAttendanceStatus().
 */
export async function markAttendanceManually(
  sessionId: string,
  studentId: string,
  status: AttendanceStatus,
): Promise<void> {
  const { error } = await supabase.from('attendance_records').upsert(
    {
      session_id: sessionId,
      student_id: studentId,
      status,
      scanned_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,student_id' },
  )
  if (error) throw error
}

/**
 * Create a missing attendance record on a session that already happened.
 *
 * Needed when `end_class_session`'s `on conflict do nothing` skipped someone, or
 * a student joined the section after the class ran — until now their register
 * cell stayed blank forever with no in-app way to fill it.
 *
 * Two steps ON PURPOSE. The row is inserted as 'excused', the one status that
 * can never carry a penalty, and the real status is then applied through
 * `set_attendance_status` — the single path that reconciles the points ledger
 * (0018/0024). Inserting the final status directly would record the attendance
 * but silently skip the deduction every other student in that session took.
 *
 * If the second step fails, the student is left visibly 'excused' rather than in
 * a half-written state, and the instructor can simply pick again.
 */
export async function createAttendanceRecord(
  sessionId: string,
  studentId: string,
  status: AttendanceStatus,
): Promise<void> {
  const { data, error } = await supabase
    .from('attendance_records')
    .insert({ session_id: sessionId, student_id: studentId, status: 'excused' })
    .select('id')
    .single()
  if (error) throw error
  if (status !== 'excused') {
    await updateAttendanceStatus(data.id as string, status)
  }
}

/** Mark many students at once (e.g. "mark all waiting" present/absent). Upserts
 * one row per student, stamping scanned_at so they all count as checked in. */
export async function markAttendanceBulk(
  sessionId: string,
  entries: { studentId: string; status: AttendanceStatus }[],
): Promise<void> {
  if (entries.length === 0) return
  const nowIso = new Date().toISOString()
  const rows = entries.map((e) => ({
    session_id: sessionId,
    student_id: e.studentId,
    status: e.status,
    scanned_at: nowIso,
  }))
  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'session_id,student_id' })
  if (error) throw error
}

/** Undo a check-in (manual or scanned) — removes the record so the student is
 * "waiting" again. Used by the live roster's reset action. */
export async function resetAttendance(sessionId: string, studentId: string): Promise<void> {
  const { error } = await supabase
    .from('attendance_records')
    .delete()
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
  if (error) throw error
}

/**
 * Section-wide attendance analytics for the history page: each student's
 * per-status counts + show-up rate, and the penalty damage across all sessions.
 *
 * The rate excludes excused/irregular from the denominator — those sessions
 * don't count for that student at all, so they can't drag a rate down.
 */
/**
 * Section-wide attendance stats. Pass `subjectId` to scope them to one subject
 * (0030) — a roster that meets you under two labels has two different attendance
 * stories, and averaging them hides the one that needs attention.
 */
export async function getAttendanceAnalytics(
  sectionId: string,
  subjectId?: string,
): Promise<AttendanceAnalytics> {
  // Aggregated in SQL (0031). The old three-query client version fetched every
  // attendance record `.in(session_ids)` — silently truncated at PostgREST's
  // 1000-row cap around week 12 — plus a full penalty-event scan. One row per
  // active student now, penalties folded in via the penalty_event_id join.
  const { data, error } = await supabase.rpc('get_section_attendance_stats', {
    p_section_id: sectionId,
    p_subject_id: subjectId ?? null,
  })
  if (error) throw error

  const rows = (data ?? []) as Array<{
    student_id: string
    full_name: string
    avatar_url: string | null
    present: number
    late: number
    absent: number
    excused: number
    irregular: number
    counted: number
    penalty_points: number
  }>

  let penaltyPoints = 0
  let penalizedStudents = 0
  const students = rows.map((r) => {
    penaltyPoints += r.penalty_points
    if (r.penalty_points > 0) penalizedStudents += 1
    return {
      studentId: r.student_id,
      fullName: r.full_name,
      avatarUrl: r.avatar_url ?? null,
      present: r.present,
      late: r.late,
      absent: r.absent,
      excused: r.excused,
      irregular: r.irregular,
      counted: r.counted,
      rate: r.counted > 0 ? (r.present + r.late) / r.counted : null,
    }
  })

  return { students, penaltyPoints, penalizedStudents }
}

/** Edit a session's saved topic (instructor tweak from the history sheet). */
/**
 * Re-tag a session's subject (0028). Direct update under instructor RLS, same
 * shape as updateSessionTopic — the picker only ever offers subjects assigned to
 * that session's section, so there's no server-side validation to duplicate.
 *
 * Pass null to untag. This is how sessions that predate subjects get sorted out.
 */
export async function updateSessionSubject(
  sessionId: string,
  subjectId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('class_sessions')
    .update({ subject_id: subjectId })
    .eq('id', sessionId)
  if (error) throw error
}

export async function updateSessionTopic(sessionId: string, topic: string): Promise<void> {
  const { error } = await supabase
    .from('class_sessions')
    .update({ topic: topic.trim() || null })
    .eq('id', sessionId)
  if (error) throw error
}

/**
 * Delete a session outright (instructor testing tool). Reverses any committed
 * penalties first — deletes the point_events the session created so the
 * leaderboard recomputes cleanly — then removes the session, which cascades its
 * attendance_records and QR secret.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const { data: recs, error: recErr } = await supabase
    .from('attendance_records')
    .select('penalty_event_id')
    .eq('session_id', sessionId)
  if (recErr) throw recErr

  const eventIds = (recs ?? [])
    .map((r) => (r as { penalty_event_id: string | null }).penalty_event_id)
    .filter((id): id is string => !!id)
  if (eventIds.length) {
    const { error: delErr } = await supabase.from('point_events').delete().in('id', eventIds)
    if (delErr) throw delErr
  }

  const { error } = await supabase.from('class_sessions').delete().eq('id', sessionId)
  if (error) throw error
}

/** End a session and auto-mark every non-scanner Absent. */
export async function endClassSession(sessionId: string): Promise<void> {
  await rpc('end_class_session', { p_session_id: sessionId })
}

/** Finalise a session — writes the late/absent penalties into point_events. */
export async function commitAttendancePenalties(
  sessionId: string,
): Promise<{ applied: number; deducted: number }> {
  const data = await withAuthRetry(async () => {
    const res = await supabase
      .rpc('commit_attendance_penalties', { p_session_id: sessionId })
      .single<{ applied: number; deducted: number }>()
    if (res.error) throw res.error
    return res.data
  })
  return { applied: data.applied, deducted: data.deducted }
}

/** Toggle whether a session's penalties will be deducted (used before commit). */
export async function setSessionApplyPenalties(
  sessionId: string,
  apply: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('class_sessions')
    .update({ apply_penalties: apply })
    .eq('id', sessionId)
  if (error) throw error
}

/** Student check-in: validate the scanned rotating code and log attendance. */
export async function scanAttendance(
  sessionId: string,
  windowIndex: number,
  code: string,
): Promise<ScanResult> {
  const { data, error } = await supabase
    .rpc('scan_attendance', {
      p_session_id: sessionId,
      p_window: windowIndex,
      p_code: code,
    })
    .single<{ status: AttendanceStatus; already: boolean; topic: string | null; marked_at: string | null }>()
  if (error) throw error
  return { status: data.status, already: data.already, topic: data.topic, markedAt: data.marked_at }
}

/**
 * Submit a captured-offline scan proof. Returns a structured outcome (never
 * throws for classifiable rejections) so the queue can decide keep/resolve/fail.
 */
export async function submitOfflineScan(
  sessionId: string,
  windowIndex: number,
  code: string,
): Promise<{
  outcome: OfflineScanOutcome
  status: AttendanceStatus | null
  topic: string | null
  markedAt: string | null
}> {
  const { data, error } = await supabase
    .rpc('submit_offline_scan', {
      p_session_id: sessionId,
      p_window: windowIndex,
      p_code: code,
    })
    .single<{
      outcome: OfflineScanOutcome
      status: AttendanceStatus | null
      topic: string | null
      marked_at: string | null
    }>()
  if (error) throw error
  return { outcome: data.outcome, status: data.status, topic: data.topic, markedAt: data.marked_at }
}

/** A student's own attendance history (newest first). */
export async function listMyAttendance(studentId: string): Promise<MyAttendanceEntry[]> {
  type Row = {
    id: string
    session_id: string
    status: AttendanceStatus
    scanned_at: string | null
    synced_late: boolean
    class_sessions: {
      topic: string | null
      started_at: string
      subject_id: string | null
      subjects: { code: string } | { code: string }[] | null
    } | null
  }
  // Grows across semesters and feeds the PRINTABLE report — pages past the
  // 1000-row cap (0031). `id` breaks created_at ties for stable pagination.
  const data = await fetchAllPages<Row>((from, to) =>
    supabase
      .from('attendance_records')
      .select(
        'id, session_id, status, scanned_at, synced_late, class_sessions(topic, started_at, subject_id, subjects(code))',
      )
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to) as unknown as PromiseLike<{
      data: Row[] | null
      error: { message: string } | null
    }>,
  )
  return data.map((r) => ({
    recordId: r.id,
    sessionId: r.session_id,
    subjectId: r.class_sessions?.subject_id ?? null,
    subjectCode: oneEmbed<{ code: string }>(r.class_sessions?.subjects)?.code ?? null,
    topic: r.class_sessions?.topic ?? null,
    startedAt: r.class_sessions?.started_at ?? '',
    status: r.status,
    scannedAt: r.scanned_at,
    syncedLate: r.synced_late,
  }))
}

type AchievementRow = {
  code: string
  category: Achievement['category']
  name: string
  description: string
  secret: boolean
  granted_by: 'system' | 'instructor'
  title_text: string | null
  metric: Achievement['metric']
  threshold: number | null
  sort_order: number
}

const ACHIEVEMENT_COLS =
  'code, category, name, description, secret, granted_by, title_text, metric, threshold, sort_order'

function mapAchievement(r: AchievementRow): Achievement {
  return {
    code: r.code,
    category: r.category,
    name: r.name,
    description: r.description,
    secret: r.secret,
    grantedBy: r.granted_by,
    titleText: r.title_text,
    metric: r.metric,
    threshold: r.threshold,
    sortOrder: r.sort_order,
  }
}

/** The full 30-achievement catalog (locked + unlocked; no per-student state). */
export async function listAchievements(): Promise<Achievement[]> {
  const { data, error } = await supabase
    .from('achievements')
    .select(ACHIEVEMENT_COLS)
    .order('sort_order')
  if (error) throw error
  return ((data ?? []) as AchievementRow[]).map(mapAchievement)
}

/** The catalog merged with one student's unlock timestamps (null = still locked). */
export async function getMyAchievements(studentId: string): Promise<AchievementState[]> {
  const [catalog, unlocked] = await Promise.all([
    supabase.from('achievements').select(ACHIEVEMENT_COLS).order('sort_order'),
    supabase
      .from('student_achievements')
      .select('achievement_code, unlocked_at')
      .eq('student_id', studentId),
  ])
  if (catalog.error) throw catalog.error
  if (unlocked.error) throw unlocked.error
  const unlockedAt = new Map(
    (unlocked.data ?? []).map((r) => [r.achievement_code as string, r.unlocked_at as string]),
  )
  return ((catalog.data ?? []) as AchievementRow[]).map((r) => ({
    ...mapAchievement(r),
    unlockedAt: unlockedAt.get(r.code) ?? null,
  }))
}

/** The raw numbers behind locked achievements' "7/10"-style progress bars. */
export async function getAchievementProgress(studentId: string): Promise<AchievementProgress> {
  const { data, error } = await supabase
    .rpc('get_achievement_progress', { p_student_id: studentId })
    .single<Record<string, number | null>>()
  if (error) throw error
  return {
    points: data.points,
    recitations: data.recitations,
    present_count: data.present_count,
    attended_count: data.attended_count,
    streak: data.streak,
    early_streak: data.early_streak,
    level: data.level,
    rank: data.rank,
    views_received: data.views_received,
    views_given: data.views_given,
    unlocked_count: data.unlocked_count,
    banner_count: data.banner_count,
    points_spent: data.points_spent,
    redemptions_approved: data.redemptions_approved,
  }
}

/**
 * Re-evaluate a student's auto-computed achievements against their current
 * stats. Safe to call often — the RPC re-derives everything server-side and is
 * idempotent (already-unlocked achievements are skipped). Returns only the
 * ones newly unlocked by this call, so the caller can trigger a celebration.
 */
export async function syncAchievements(studentId: string): Promise<UnlockedAchievement[]> {
  const { data, error } = await supabase.rpc('sync_achievements', { p_student_id: studentId })
  if (error) throw error
  return ((data ?? []) as Array<{ code: string; name: string; title_text: string | null }>).map(
    (r) => ({ code: r.code, name: r.name, titleText: r.title_text }),
  )
}

/** Equip (or clear, with null) a display title. Must be one the student has unlocked. */
export async function setDisplayTitle(studentId: string, title: string | null): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ display_title: title })
    .eq('id', studentId)
  if (error) throw error
}

/** Choose up to 3 unlocked achievements to feature first on the profile. */
export async function setPinnedAchievements(studentId: string, codes: string[]): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ pinned_achievements: codes.length ? codes : null })
    .eq('id', studentId)
  if (error) throw error
}

/** Instructor-only: manually award one of the 'recognition' achievements. */
export async function grantAchievement(studentId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc('grant_achievement', {
    p_student_id: studentId,
    p_code: code,
  })
  if (error) throw error
}

