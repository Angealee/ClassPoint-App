import { supabase } from '@/lib/supabase'
import type {
  Achievement,
  AchievementProgress,
  AchievementState,
  AppNotification,
  AttendanceRosterRow,
  AttendanceStatus,
  AwardRecord,
  ClassSession,
  LeaderboardEntry,
  LeaderboardRow,
  LeaderboardSnapshot,
  MyAttendanceEntry,
  PointCategory,
  PointEvent,
  ProfileViews,
  PublicPointEvent,
  PublicProfile,
  ScanResult,
  Section,
  SectionStudent,
  SessionConfig,
  SessionSummary,
  StudentSelf,
  UnlockedAchievement,
} from '@/lib/types'

export async function listSections(): Promise<Section[]> {
  const { data, error } = await supabase
    .from('sections')
    .select('id, name')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createSection(name: string): Promise<Section> {
  const { data, error } = await supabase
    .from('sections')
    .insert({ name: name.trim() })
    .select('id, name')
    .single<Section>()
  if (error) throw error
  return data
}

/** Rename a section (instructor-only via RLS). */
export async function renameSection(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('sections').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

export async function deleteSection(id: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', id)
  if (countError) throw countError
  if ((count ?? 0) > 0) {
    throw new Error('Section is not empty — move or remove its students first.')
  }
  const { error } = await supabase.from('sections').delete().eq('id', id)
  if (error) throw error
}

export async function getSectionCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('students').select('section_id')
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = row.section_id as string
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

export interface SectionStat {
  total: number
  claimed: number
}

/** Per-section roster stats (total students + how many have claimed). */
export async function getSectionStats(): Promise<Record<string, SectionStat>> {
  const [students, secrets] = await Promise.all([
    supabase.from('students').select('id, section_id'),
    supabase.from('student_secrets').select('student_id, claimed_at'),
  ])
  if (students.error) throw students.error
  if (secrets.error) throw secrets.error

  const claimedById = new Map(
    (secrets.data ?? []).map((s) => [s.student_id as string, !!s.claimed_at]),
  )
  const stats: Record<string, SectionStat> = {}
  for (const row of students.data ?? []) {
    const id = row.section_id as string
    const stat = (stats[id] ??= { total: 0, claimed: 0 })
    stat.total += 1
    if (claimedById.get(row.id as string)) stat.claimed += 1
  }
  return stats
}

/** Students in a section: profiles merged with their secret/token info. */
export async function listStudents(sectionId: string): Promise<SectionStudent[]> {
  const [students, secrets] = await Promise.all([
    supabase
      .from('students')
      .select('id, section_id, full_name, display_name, avatar_url, lifetime_points, user_id')
      .eq('section_id', sectionId),
    supabase.from('student_secrets').select('student_id, claim_token, username, claimed_at'),
  ])
  if (students.error) throw students.error
  if (secrets.error) throw secrets.error

  const byId = new Map(secrets.data?.map((s) => [s.student_id, s]) ?? [])
  return (students.data ?? [])
    .map((s) => {
      const secret = byId.get(s.id)
      return {
        ...s,
        claim_token: secret?.claim_token ?? '',
        username: secret?.username ?? null,
        claimed_at: secret?.claimed_at ?? null,
      } as SectionStudent
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
}

/** Add a student to a section; returns the generated one-time claim token. */
export async function createStudent(
  sectionId: string,
  fullName: string,
): Promise<{ studentId: string; claimToken: string }> {
  const { data, error } = await supabase
    .rpc('create_student', { p_section_id: sectionId, p_full_name: fullName })
    .single<{ student_id: string; claim_token: string }>()
  if (error) throw error
  return { studentId: data.student_id, claimToken: data.claim_token }
}

/**
 * Bulk-add students to a section (e.g. from an Excel/CSV import) in one call.
 * Returns each created student with their fresh one-time claim token.
 */
export async function createStudentsBulk(
  sectionId: string,
  fullNames: string[],
): Promise<{ fullName: string; claimToken: string }[]> {
  const names = fullNames.map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) return []
  const { data, error } = await supabase.rpc('create_students', {
    p_section_id: sectionId,
    p_full_names: names,
  })
  if (error) throw error
  const rows = (data ?? []) as { full_name: string; claim_token: string }[]
  return rows.map((r) => ({ fullName: r.full_name, claimToken: r.claim_token }))
}

export async function deleteStudent(studentId: string): Promise<void> {
  const { error } = await supabase.from('students').delete().eq('id', studentId)
  if (error) throw error
}

/**
 * Instructor: issue a one-time, expiring reset code for a student who forgot
 * their PIN. The student redeems it on the /reset page (via the `reset-pin` Edge
 * Function). Only works once the student has claimed their account.
 * Returns the code to hand out + when it expires.
 */
export async function resetStudentPin(
  studentId: string,
): Promise<{ token: string; expiresAt: string }> {
  const { data, error } = await supabase
    .rpc('reset_student_pin', { p_student_id: studentId })
    .single<{ reset_token: string; reset_expires_at: string }>()
  if (error) throw error
  return { token: data.reset_token, expiresAt: data.reset_expires_at }
}

/** Award the same points to one or more students in a single batch. */
export async function awardPoints(args: {
  studentIds: string[]
  points: number
  category: PointCategory
  note?: string
}): Promise<void> {
  const rows = args.studentIds.map((student_id) => ({
    student_id,
    points: args.points,
    category: args.category,
    note: args.note?.trim() || null,
  }))
  const { error } = await supabase.from('point_events').insert(rows)
  if (error) throw error
}

/** All students ranked by lifetime points (live; used by instructor tools). */
export async function listLeaderboard(): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, display_name, full_name, section_id, lifetime_points')
    .order('lifetime_points', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Recent point awards across all students (instructor review / undo). */
export async function listRecentAwards(limit = 30): Promise<AwardRecord[]> {
  const { data, error } = await supabase
    .from('point_events')
    .select('id, student_id, points, category, note, created_at, students(full_name, section_id)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  type Row = Omit<AwardRecord, 'student_name' | 'section_id'> & {
    students: { full_name: string; section_id: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    student_id: r.student_id,
    student_name: r.students?.full_name ?? 'Unknown',
    section_id: r.students?.section_id ?? '',
    points: r.points,
    category: r.category,
    note: r.note,
    created_at: r.created_at,
  }))
}

/** Delete a single point event (instructor undo). Totals auto-recompute. */
export async function deletePointEvent(id: string): Promise<void> {
  const { error } = await supabase.from('point_events').delete().eq('id', id)
  if (error) throw error
}

/**
 * The frozen leaderboard snapshot + when it was captured.
 * Refreshed twice daily (7:30 AM / 7:30 PM PHT) by a pg_cron job, so the
 * ranking only "settles" twice a day even though dashboards are live.
 */
export async function getLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
  const [snap, meta, avatars] = await Promise.all([
    supabase
      .from('leaderboard_snapshot')
      .select('student_id, display_name, section_id, lifetime_points, rank')
      .order('rank'),
    supabase.from('leaderboard_meta').select('captured_at').maybeSingle(),
    // Avatars aren't part of the frozen ranking — merge the current ones in so a
    // newly-set picture shows immediately without waiting for the next snapshot.
    supabase.from('students').select('id, avatar_url'),
  ])
  if (snap.error) throw snap.error
  const avatarById = new Map(
    (avatars.data ?? []).map((a) => [a.id as string, (a.avatar_url as string | null) ?? null]),
  )
  const entries: LeaderboardEntry[] = (
    (snap.data as Omit<LeaderboardEntry, 'avatar_url'>[]) ?? []
  ).map((e) => ({ ...e, avatar_url: avatarById.get(e.student_id) ?? null }))
  return { entries, capturedAt: meta.data?.captured_at ?? null }
}

/** The signed-in student's own row, located by their auth user id. */
export async function getMyStudent(userId: string): Promise<StudentSelf | null> {
  const { data, error } = await supabase
    .from('students')
    .select(
      'id, section_id, full_name, display_name, avatar_url, bio, interests, banner_urls, display_title, pinned_achievements, lifetime_points',
    )
    .eq('user_id', userId)
    .maybeSingle<StudentSelf>()
  if (error) throw error
  return data ?? null
}

/**
 * Student updates the public-facing fields on their own row in one write:
 * display name, bio, and interests. Empty bio/interests are stored as NULL.
 * (Column access is guarded by trg_guard_student_update; lengths by CHECKs.)
 */
export async function updateProfileFields(
  studentId: string,
  fields: { display_name: string; bio: string | null; interests: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({
      display_name: fields.display_name,
      bio: fields.bio,
      interests: fields.interests,
    })
    .eq('id', studentId)
  if (error) throw error
}

/**
 * A classmate's public-safe profile for the leaderboard tap-preview: their
 * roster-public columns plus a few recent point events (via the SECURITY
 * DEFINER `public_point_events` RPC, since RLS hides other students' history).
 */
export async function getPublicProfile(
  studentId: string,
  eventLimit = 5,
): Promise<PublicProfile> {
  const [studentRes, eventsRes] = await Promise.all([
    supabase
      .from('students')
      .select(
        'id, display_name, section_id, avatar_url, bio, interests, banner_urls, display_title, pinned_achievements, lifetime_points, created_at',
      )
      .eq('id', studentId)
      .maybeSingle(),
    supabase.rpc('public_point_events', { p_student_id: studentId, p_limit: eventLimit }),
  ])
  if (studentRes.error) throw studentRes.error
  if (eventsRes.error) throw eventsRes.error
  const s = studentRes.data
  if (!s) throw new Error('Student not found.')
  return {
    id: s.id as string,
    display_name: s.display_name as string,
    section_id: s.section_id as string,
    avatar_url: (s.avatar_url as string | null) ?? null,
    bio: (s.bio as string | null) ?? null,
    interests: (s.interests as string | null) ?? null,
    banner_urls: (s.banner_urls as string[] | null) ?? null,
    display_title: (s.display_title as string | null) ?? null,
    pinned_achievements: (s.pinned_achievements as string[] | null) ?? null,
    lifetime_points: s.lifetime_points as number,
    created_at: (s.created_at as string | null) ?? null,
    events: (eventsRes.data ?? []) as PublicPointEvent[],
  }
}

/**
 * Upload a student's profile picture to the `avatars` bucket and save the public
 * URL on their row. The file must live under the user's own uid folder (Storage
 * RLS enforces this). Returns the new public URL.
 *
 * Size/type are validated in the UI; the bucket also caps at 5 MB server-side.
 */
export async function updateAvatar(
  studentId: string,
  userId: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  // Cache-busting filename so the CDN/browser always shows the latest upload.
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
  if (upErr) throw upErr

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = data.publicUrl

  const { error: saveErr } = await supabase
    .from('students')
    .update({ avatar_url: url })
    .eq('id', studentId)
  if (saveErr) throw saveErr
  return url
}

/** Remove a student's profile picture (clears the column). */
export async function removeAvatar(studentId: string): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ avatar_url: null })
    .eq('id', studentId)
  if (error) throw error
}

/**
 * Upload one showcase banner photo to the shared `avatars` bucket (its RLS
 * already scopes writes to <auth.uid()>/…) and return the public URL. The caller
 * then persists the new banner_urls array via `setBannerUrls`.
 */
export async function uploadBannerPhoto(userId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${userId}/banner-${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
  if (upErr) throw upErr
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

/** Save the student's showcase banner photo URLs (0–3). */
export async function setBannerUrls(studentId: string, urls: string[]): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ banner_urls: urls.length ? urls : null })
    .eq('id', studentId)
  if (error) throw error
}

/** Record that the signed-in student viewed another student's profile. The DB
 * resolves the viewer from auth.uid() and ignores self-views / non-students. */
export async function recordProfileView(viewedId: string): Promise<void> {
  const { error } = await supabase.rpc('record_profile_view', { p_viewed_id: viewedId })
  if (error) throw error
}

/** The signed-in student's own view stats + recent visitors. Only returns data
 * for your own profile (the RPC guards against reading anyone else's). */
export async function getProfileViews(studentId: string): Promise<ProfileViews> {
  const { data, error } = await supabase
    .rpc('get_profile_views', { p_student_id: studentId, p_limit: 8 })
    .single<{
      total_views: number
      visitor_count: number
      recent: Array<{ display_name: string; avatar_url: string | null; last_viewed_at: string }>
    }>()
  if (error) throw error
  return {
    total: Number(data.total_views) || 0,
    visitors: Number(data.visitor_count) || 0,
    recent: (data.recent ?? []).map((r) => ({
      displayName: r.display_name,
      avatarUrl: r.avatar_url ?? null,
      lastViewedAt: r.last_viewed_at,
    })),
  }
}

/** The student's current rank from the frozen snapshot, or null if not ranked. */
export async function getMyRank(studentId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('leaderboard_snapshot')
    .select('rank')
    .eq('student_id', studentId)
    .maybeSingle<{ rank: number }>()
  if (error) throw error
  return data?.rank ?? null
}

/** Recent point events for a student (their feed / instructor review). */
export async function listStudentEvents(studentId: string, limit = 20): Promise<PointEvent[]> {
  const { data, error } = await supabase
    .from('point_events')
    .select('id, student_id, points, category, note, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// ============================================================================
// Attendance — QR class sessions (migration 0014)
// ============================================================================

/** Shape of a raw class_sessions row (snake_case) as read from the DB. */
interface SessionRow {
  id: string
  section_id: string
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
  'id, section_id, topic, status, started_at, ended_at, late_after_min, absent_after_min, late_penalty, absent_penalty, apply_penalties, penalties_committed'

function mapSession(r: SessionRow, qrSecret?: string): ClassSession {
  return {
    id: r.id,
    sectionId: r.section_id,
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
 * Retry a Supabase call once behind a forced session refresh. Guards against the
 * transient "Invalid Refresh Token / JWT expired" 400 that supabase-js can throw
 * when a request races its own background token refresh — the hiccup a manual
 * page reload used to clear.
 */
async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const err = e as { status?: number; code?: string; message?: string } | null
    const msg = (err?.message ?? '').toLowerCase()
    const isAuthBlip =
      err?.status === 401 ||
      err?.code === 'PGRST301' ||
      msg.includes('jwt') ||
      msg.includes('token is expired') ||
      msg.includes('refresh token')
    if (!isAuthBlip) throw e
    await supabase.auth.getSession() // refreshes if the access token is stale
    return fn()
  }
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

/** Past + present sessions for a section, with present/late/absent tallies. */
export async function listSessions(sectionId: string): Promise<SessionSummary[]> {
  const { data: sessions, error } = await supabase
    .from('class_sessions')
    .select('id, topic, started_at, ended_at, status, penalties_committed')
    .eq('section_id', sectionId)
    .order('started_at', { ascending: false })
  if (error) throw error
  const rows = sessions ?? []
  if (rows.length === 0) return []

  const ids = rows.map((s) => s.id as string)
  const { data: records, error: recErr } = await supabase
    .from('attendance_records')
    .select('session_id, status')
    .in('session_id', ids)
  if (recErr) throw recErr

  const tally = new Map<string, { present: number; late: number; absent: number; total: number }>()
  for (const r of records ?? []) {
    const t = tally.get(r.session_id as string) ?? { present: 0, late: 0, absent: 0, total: 0 }
    t[r.status as AttendanceStatus] += 1
    t.total += 1
    tally.set(r.session_id as string, t)
  }

  return rows.map((s) => {
    const t = tally.get(s.id as string) ?? { present: 0, late: 0, absent: 0, total: 0 }
    return {
      id: s.id as string,
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
      .select('id, full_name, avatar_url')
      .eq('section_id', sectionId),
    supabase
      .from('attendance_records')
      .select('id, student_id, status, scanned_at, committed')
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
        recordId: (rec?.id as string) ?? null,
        status: (rec?.status as AttendanceStatus) ?? null,
        scannedAt: (rec?.scanned_at as string | null) ?? null,
        committed: (rec?.committed as boolean) ?? false,
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/** Instructor override of a student's status during the review step. */
export async function updateAttendanceStatus(
  recordId: string,
  status: AttendanceStatus,
): Promise<void> {
  const { error } = await supabase
    .from('attendance_records')
    .update({ status })
    .eq('id', recordId)
  if (error) throw error
}

/**
 * Instructor manually checks a student in during a live class — for students
 * with no internet to scan. Upserts the record (overriding a prior scan if any)
 * and stamps scanned_at so they count as checked in. RLS lets the instructor
 * write attendance_records directly, so no RPC is needed.
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

/** Edit a session's saved topic (instructor tweak from the history sheet). */
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
  const { error } = await supabase.rpc('end_class_session', { p_session_id: sessionId })
  if (error) throw error
}

/** Finalise a session — writes the late/absent penalties into point_events. */
export async function commitAttendancePenalties(
  sessionId: string,
): Promise<{ applied: number; deducted: number }> {
  const { data, error } = await supabase
    .rpc('commit_attendance_penalties', { p_session_id: sessionId })
    .single<{ applied: number; deducted: number }>()
  if (error) throw error
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

/** A student's own attendance history (newest first). */
export async function listMyAttendance(studentId: string): Promise<MyAttendanceEntry[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, session_id, status, scanned_at, class_sessions(topic, started_at)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  type Row = {
    id: string
    session_id: string
    status: AttendanceStatus
    scanned_at: string | null
    class_sessions: { topic: string | null; started_at: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    recordId: r.id,
    sessionId: r.session_id,
    topic: r.class_sessions?.topic ?? null,
    startedAt: r.class_sessions?.started_at ?? '',
    status: r.status,
    scannedAt: r.scanned_at,
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

// ============================================================================
// Notifications — the outbox-backed bell (migration 0017)
// ============================================================================

/**
 * A page of the student's notification history, newest first. Keyset-paginated:
 * pass the oldest row's `createdAt` as `before` to load the next page.
 */
export async function listNotifications(
  studentId: string,
  opts?: { before?: string; limit?: number },
): Promise<AppNotification[]> {
  let query = supabase
    .from('notifications')
    .select('id, type, title, body, url, created_at, read_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 30)
  if (opts?.before) query = query.lt('created_at', opts.before)
  const { data, error } = await query
  if (error) throw error
  return (
    (data ?? []) as Array<{
      id: string
      type: string
      title: string
      body: string
      url: string
      created_at: string
      read_at: string | null
    }>
  ).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    url: r.url,
    createdAt: r.created_at,
    readAt: r.read_at,
  }))
}

/** How many notifications the student hasn't read — drives the bell badge. */
export async function getUnreadNotificationCount(studentId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

/** Mark all of my notifications read (up to now). */
export async function markNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read')
  if (error) throw error
}

/** Fire a real end-to-end test push to this student's devices. */
export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.rpc('send_test_push')
  if (error) throw error
}
