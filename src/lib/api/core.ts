import { supabase } from '@/lib/supabase'
import { AVATAR_MAX_PX, BANNER_MAX_PX, downscaleImage } from '@/lib/images'
import type { Database } from '@/lib/database.types'
import { configureTermCalendar } from '@/lib/term'
import { oneEmbed, rpc, withAuthRetry, fetchAllPages } from './_internal'
import type {
  Semester,
  Subject,
  TermKey,
  AchievementRarity,
  ArchivedStudent,
  InstructorStudentDetail,
  SectionRegister,
  AttendanceStatus,
  AwardRecord,
  LeaderboardEntry,
  LeaderboardSnapshot,
  PointCategory,
  PointEvent,
  ProfileViews,
  ProfileVisitorPage,
  PublicPointEvent,
  PublicProfile,
  Section,
  SectionStudent,
  StudentSelf,
} from '@/lib/types'

// ── Semesters, terms & subjects (0027) ───────────────────────────────────────

const SEMESTER_COLS = 'id, name, starts_on, is_active, semester_terms(term, starts_on, ends_on)'

/** Six weeks per term: prelim weeks 1–6, midterm 7–12, finals 13–18. */
const TERM_OFFSETS: Array<{ term: TermKey; from: number; to: number }> = [
  { term: 'prelim', from: 0, to: 41 },
  { term: 'midterm', from: 42, to: 83 },
  { term: 'finals', from: 84, to: 125 },
]

/** Shift a 'YYYY-MM-DD' date by whole days, staying in local time. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function mapSemester(row: Record<string, unknown>): Semester {
  const terms = ((row.semester_terms as Array<Record<string, unknown>>) ?? []).map((t) => ({
    term: t.term as TermKey,
    startsOn: t.starts_on as string,
    endsOn: t.ends_on as string,
  }))
  terms.sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  return {
    id: row.id as string,
    name: row.name as string,
    startsOn: row.starts_on as string,
    isActive: !!row.is_active,
    terms,
  }
}

export async function getActiveSemester(): Promise<Semester | null> {
  const { data, error } = await supabase
    .from('semesters')
    .select(SEMESTER_COLS)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data ? mapSemester(data) : null
}

/** RESERVED: the rollover wizard (Era 5.0 Phase I) — no caller until then. */
export async function listSemesters(): Promise<Semester[]> {
  const { data, error } = await supabase
    .from('semesters')
    .select(SEMESTER_COLS)
    .order('starts_on', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapSemester)
}

/**
 * Create a semester with its three terms pre-filled to the six-week defaults.
 * The instructor edits any of the six dates afterwards — holidays move things.
 *
 * RESERVED: the rollover wizard (Era 5.0 Phase I) — no caller until then.
 */
export async function createSemester(name: string, startsOn: string): Promise<Semester> {
  const { data, error } = await supabase
    .from('semesters')
    .insert({ name: name.trim(), starts_on: startsOn })
    .select('id')
    .single()
  if (error) throw error
  const semesterId = data.id as string

  const { error: termsError } = await supabase.from('semester_terms').insert(
    TERM_OFFSETS.map((t) => ({
      semester_id: semesterId,
      term: t.term,
      starts_on: addDays(startsOn, t.from),
      ends_on: addDays(startsOn, t.to),
    })),
  )
  if (termsError) throw termsError

  return {
    id: semesterId,
    name: name.trim(),
    startsOn,
    isActive: false,
    terms: TERM_OFFSETS.map((t) => ({
      term: t.term,
      startsOn: addDays(startsOn, t.from),
      endsOn: addDays(startsOn, t.to),
    })),
  }
}

/** RESERVED: the rollover wizard (Era 5.0 Phase I) — no caller until then. */
export async function renameSemester(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('semesters').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

/** Move one term's boundaries. Week numbering still derives from the semester start. */
export async function updateSemesterTerm(
  semesterId: string,
  term: TermKey,
  startsOn: string,
  endsOn: string,
): Promise<void> {
  const { error } = await supabase
    .from('semester_terms')
    .update({ starts_on: startsOn, ends_on: endsOn })
    .eq('semester_id', semesterId)
    .eq('term', term)
  if (error) throw error
}

function mapSubject(row: Record<string, unknown>): Subject {
  return {
    id: row.id as string,
    semesterId: row.semester_id as string,
    code: row.code as string,
    name: row.name as string,
  }
}

export async function listSubjects(semesterId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, semester_id, code, name')
    .eq('semester_id', semesterId)
    .order('code')
  if (error) throw error
  return (data ?? []).map(mapSubject)
}

export async function createSubject(
  semesterId: string,
  code: string,
  name: string,
): Promise<Subject> {
  const { data, error } = await supabase
    .from('subjects')
    .insert({ semester_id: semesterId, code: code.trim(), name: name.trim() })
    .select('id, semester_id, code, name')
    .single()
  if (error) throw error
  return mapSubject(data)
}

export async function updateSubject(id: string, code: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('subjects')
    .update({ code: code.trim(), name: name.trim() })
    .eq('id', id)
  if (error) throw error
}

/** Sessions referencing the subject keep their rows — subject_id nulls out. */
export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id)
  if (error) throw error
}

/** Which subjects each section takes: { sectionId: subjectId[] }. */
export async function listSectionSubjects(semesterId: string): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('section_subjects')
    .select('section_id, subject_id, subjects!inner(semester_id)')
    .eq('subjects.semester_id', semesterId)
  if (error) throw error
  const map: Record<string, string[]> = {}
  for (const row of data ?? []) {
    const sectionId = row.section_id as string
    ;(map[sectionId] ??= []).push(row.subject_id as string)
  }
  return map
}

/** Replace one section's subject assignments with exactly `subjectIds`. */
export async function setSectionSubjects(
  sectionId: string,
  subjectIds: string[],
): Promise<void> {
  const { error: delError } = await supabase
    .from('section_subjects')
    .delete()
    .eq('section_id', sectionId)
  if (delError) throw delError
  if (subjectIds.length === 0) return
  const { error } = await supabase
    .from('section_subjects')
    .insert(subjectIds.map((subjectId) => ({ section_id: sectionId, subject_id: subjectId })))
  if (error) throw error
}

/**
 * Point src/lib/term.ts at the active semester's real dates. Memoized: every
 * screen that needs week/term labels can call this without re-fetching.
 *
 * Failure is deliberately swallowed — term.ts keeps its built-in fallback
 * calendar, so a week label degrading is never worth taking a screen down.
 */
let termCalendarPromise: Promise<void> | null = null

export function loadTermCalendar(force = false): Promise<void> {
  if (force) termCalendarPromise = null
  termCalendarPromise ??= getActiveSemester()
    .then((semester) => {
      if (!semester) return
      configureTermCalendar({
        semesterId: semester.id,
        semesterName: semester.name,
        startsOn: semester.startsOn,
        terms: semester.terms,
      })
    })
    .catch(() => {
      // Clear the memo so the NEXT caller retries. Caching the rejected promise
      // pinned the whole app to term.ts's fallback dates until a full reload —
      // and the printable report would then quietly print wrong week dividers.
      termCalendarPromise = null
    })
  return termCalendarPromise
}

/**
 * Rows come back typed from the client now (see lib/database.types.ts), so
 * mappers take the real shape instead of `Record<string, unknown>` + casts.
 * That's what makes a wrong column name a compile error rather than a 400.
 */
type SectionRow = Pick<
  Database['public']['Tables']['sections']['Row'],
  'id' | 'name' | 'semester_id'
>

function mapSection(row: SectionRow): Section {
  return {
    id: row.id,
    name: row.name,
    semesterId: row.semester_id,
  }
}

/**
 * Sections, newest-semester-aware. Pass a semesterId to scope the list — the
 * instructor area always does, so last semester's rosters don't pile up in every
 * picker. Omitting it returns every section across all semesters (the archive
 * views want that).
 */
export async function listSections(semesterId?: string): Promise<Section[]> {
  let query = supabase.from('sections').select('id, name, semester_id').order('name')
  if (semesterId) query = query.eq('semester_id', semesterId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapSection)
}

export async function createSection(name: string, semesterId: string): Promise<Section> {
  const { data, error } = await supabase
    .from('sections')
    .insert({ name: name.trim(), semester_id: semesterId })
    .select('id, name, semester_id')
    .single()
  if (error) throw error
  return mapSection(data)
}

/** Rename a section (instructor-only via RLS). */
export async function renameSection(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('sections').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

export async function deleteSection(id: string): Promise<void> {
  // Deliberately UNFILTERED: archived students still block deletion — the
  // cascade would silently destroy their preserved records.
  const { count, error: countError } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', id)
  if (countError) throw countError
  if ((count ?? 0) > 0) {
    throw new Error(
      'Section is not empty — it still has students (archived ones count too).',
    )
  }
  const { error } = await supabase.from('sections').delete().eq('id', id)
  if (error) throw error
}

/**
 * Total students per section INCLUDING archived. Gates section deletion in
 * ManageSections — a section holding only archived students must read as
 * non-empty there, even though rosters show it as empty.
 */
export async function getSectionTotalCounts(): Promise<Record<string, number>> {
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

/**
 * Per-section roster stats (total students + how many have claimed).
 *
 * Pass the section ids you're rendering (SectionGrid does) — students AND their
 * secrets are then scoped to those sections instead of scanning every semester's
 * roster and shipping every claim token's row over the wire on the instructor's
 * home screen (0031 ride-along).
 */
export async function getSectionStats(sectionIds?: string[]): Promise<Record<string, SectionStat>> {
  let studentQuery = supabase.from('students').select('id, section_id').is('archived_at', null)
  if (sectionIds && sectionIds.length > 0) studentQuery = studentQuery.in('section_id', sectionIds)
  const students = await studentQuery
  if (students.error) throw students.error
  const rows = students.data ?? []
  if (rows.length === 0) return {}

  // Chunked so the .in() URL stays bounded no matter how large a roster grows.
  const ids = rows.map((r) => r.id as string)
  const claimedById = new Map<string, boolean>()
  const CHUNK = 150
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('student_secrets')
      .select('student_id, claimed_at')
      .in('student_id', ids.slice(i, i + CHUNK))
    if (error) throw error
    for (const s of data ?? []) claimedById.set(s.student_id as string, !!s.claimed_at)
  }

  const stats: Record<string, SectionStat> = {}
  for (const row of rows) {
    const id = row.section_id as string
    const stat = (stats[id] ??= { total: 0, claimed: 0 })
    stat.total += 1
    if (claimedById.get(row.id as string)) stat.claimed += 1
  }
  return stats
}

/** Students in a section: profiles merged with their secret/token info. */
export async function listStudents(sectionId: string): Promise<SectionStudent[]> {
  const students = await supabase
    .from('students')
    .select(
      'id, section_id, full_name, display_name, avatar_url, semester_points, lifetime_points, user_id',
    )
    .eq('section_id', sectionId)
    .is('archived_at', null)
  if (students.error) throw students.error

  // Scoped to THIS roster (0031 ride-along) — the old unfiltered fetch shipped
  // every semester's claim tokens over the wire on every roster open.
  const secrets = await supabase
    .from('student_secrets')
    .select('student_id, claim_token, username, claimed_at')
    .in(
      'student_id',
      (students.data ?? []).map((s) => s.id as string),
    )
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

/**
 * Archive a student: hidden from rosters, leaderboard, attendance-taking and
 * analytics, but every record survives. Restorable any time. The server logs
 * the action (with a full row snapshot) and refreshes the frozen board.
 */
export async function archiveStudent(studentId: string): Promise<void> {
  await rpc('archive_student', { p_student_id: studentId })
}

/** Bring an archived student back — they reappear everywhere immediately. */
export async function restoreStudent(studentId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_student', { p_student_id: studentId })
  if (error) throw error
}

/**
 * The only irreversible deletion left in the app. Server-enforced: refuses
 * unless the student is already archived, and audit-logs the full cascade
 * (their points, records, achievements) as recoverable JSON first.
 */
export async function hardDeleteStudent(studentId: string): Promise<void> {
  const { error } = await supabase.rpc('hard_delete_student', { p_student_id: studentId })
  if (error) throw error
}

/** Archived students for a section, most recently archived first. */
export async function listArchivedStudents(sectionId: string): Promise<ArchivedStudent[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, display_name, avatar_url, lifetime_points, archived_at')
    .eq('section_id', sectionId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<{
    id: string
    full_name: string
    display_name: string
    avatar_url: string | null
    lifetime_points: number
    archived_at: string
  }>).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    lifetimePoints: r.lifetime_points,
    archivedAt: r.archived_at,
  }))
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
  // Awarding usually happens right after unlocking the phone at the start of
  // class — exactly when the access token is most likely to be mid-refresh.
  // Only auth-layer rejections retry, so this cannot double-insert.
  await withAuthRetry(async () => {
    const { error } = await supabase.from('point_events').insert(rows)
    if (error) throw error
  })
}


/**
 * Recent point awards across all students (instructor review / undo).
 *
 * Excludes 'redeem' debits on purpose: those are owned by point_redemptions,
 * and deleting the event here would give the points back while the request
 * still reads "approved" — a desync with no way to notice. Spending is
 * reviewed and reversed from the Requests screen instead.
 */
export async function listRecentAwards(limit = 30): Promise<AwardRecord[]> {
  const { data, error } = await supabase
    .from('point_events')
    .select('id, student_id, points, category, note, created_at, students(full_name, section_id)')
    .neq('category', 'redeem')
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
      .select('student_id, display_name, section_id, semester_points, rank')
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
  const entries: LeaderboardEntry[] = (snap.data ?? []).map((e) => ({
    student_id: e.student_id as string,
    display_name: e.display_name as string,
    section_id: e.section_id as string,
    points: (e.semester_points as number) ?? 0,
    rank: e.rank as number,
    avatar_url: avatarById.get(e.student_id as string) ?? null,
  }))
  return { entries, capturedAt: meta.data?.captured_at ?? null }
}

/** The signed-in student's own row, located by their auth user id. */
export async function getMyStudent(userId: string): Promise<StudentSelf | null> {
  const { data, error } = await supabase
    .from('students')
    .select(
      'id, section_id, full_name, display_name, avatar_url, bio, interests, banner_urls, display_title, pinned_achievements, semester_points, lifetime_points',
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // lifetime_points is the DB's career total; the app calls it all_time_points
  // so nothing confuses it with the semester balance students actually see.
  const { lifetime_points, ...rest } = data as Record<string, unknown>
  return { ...rest, all_time_points: (lifetime_points as number) ?? 0 } as StudentSelf
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
        'id, display_name, section_id, avatar_url, bio, interests, banner_urls, display_title, pinned_achievements, semester_points, created_at',
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
    semester_points: (s.semester_points as number) ?? 0,
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
  original: File,
): Promise<string> {
  // Downscale first: a phone photo is 3–8 MB and this renders at 40px. Fails
  // soft — if the canvas path can't handle the file, the original goes up.
  const file = await downscaleImage(original, AVATAR_MAX_PX)
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
export async function uploadBannerPhoto(userId: string, original: File): Promise<string> {
  const file = await downscaleImage(original, BANNER_MAX_PX)
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

/** One student, for the instructor's record page (includes archive + claim state). */
export async function getStudent(studentId: string): Promise<InstructorStudentDetail | null> {
  const [studentRes, secretRes] = await Promise.all([
    supabase
      .from('students')
      .select(
        'id, section_id, full_name, display_name, avatar_url, semester_points, lifetime_points, archived_at, sections(name)',
      )
      .eq('id', studentId)
      .maybeSingle(),
    supabase
      .from('student_secrets')
      .select('username, claimed_at')
      .eq('student_id', studentId)
      .maybeSingle(),
  ])
  if (studentRes.error) throw studentRes.error
  if (!studentRes.data) return null
  const s = studentRes.data as unknown as {
    id: string
    section_id: string
    full_name: string
    display_name: string
    avatar_url: string | null
    semester_points: number
    lifetime_points: number
    archived_at: string | null
    sections: { name: string } | null
  }
  const secret = secretRes.data as { username: string | null; claimed_at: string | null } | null
  return {
    id: s.id,
    sectionId: s.section_id,
    sectionName: s.sections?.name ?? '',
    fullName: s.full_name,
    displayName: s.display_name,
    avatarUrl: s.avatar_url,
    semesterPoints: s.semester_points ?? 0,
    lifetimePoints: s.lifetime_points,
    archivedAt: s.archived_at,
    username: secret?.username ?? null,
    claimed: !!secret?.claimed_at,
  }
}

/**
 * Whole-section attendance register (rows = active-or-recorded students, cols =
 * sessions chronological). Backs the class-record matrix export.
 */
export async function getSectionRegister(
  sectionId: string,
  subjectId?: string,
): Promise<SectionRegister> {
  // `subjectId` keeps the export honest with the screen it came from: Class
  // history's subject toggle used to scope every stat on screen and then hand
  // you a register with both subjects fused into one grid.
  let sessionQuery = supabase
    .from('class_sessions')
    .select('id, topic, started_at, subjects(code)')
    .eq('section_id', sectionId)
    .order('started_at', { ascending: true })
  if (subjectId) sessionQuery = sessionQuery.eq('subject_id', subjectId)
  const [sessionsRes, studentsRes] = await Promise.all([
    sessionQuery,
    supabase
      .from('students')
      .select('id, full_name, archived_at')
      .eq('section_id', sectionId),
  ])
  if (sessionsRes.error) throw sessionsRes.error
  if (studentsRes.error) throw studentsRes.error

  const sessions = (sessionsRes.data ?? []).map((s) => ({
    id: s.id as string,
    topic: (s.topic as string | null) ?? null,
    startedAt: s.started_at as string,
    subjectCode: oneEmbed<{ code: string }>(s.subjects)?.code ?? null,
  }))
  const roster = (studentsRes.data ?? []) as Array<{
    id: string
    full_name: string
    archived_at: string | null
  }>

  const statuses: Record<string, Record<string, AttendanceStatus>> = {}
  if (sessions.length > 0) {
    // The register genuinely needs every cell, so this pages past the 1000-row
    // cap instead of aggregating (0031). `id` is the unique order tiebreaker.
    const records = await fetchAllPages<{
      session_id: string
      student_id: string
      status: AttendanceStatus
    }>((from, to) =>
      supabase
        .from('attendance_records')
        .select('session_id, student_id, status')
        .in(
          'session_id',
          sessions.map((s) => s.id),
        )
        .order('id')
        .range(from, to),
    )
    for (const r of records) {
      ;(statuses[r.student_id] ??= {})[r.session_id] = r.status
    }
  }

  // Active students, plus archived ones who have any record (history stays whole).
  const students = roster
    .filter((s) => s.archived_at == null || statuses[s.id])
    .map((s) => ({ id: s.id, fullName: s.full_name }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))

  return { sessions, students, statuses }
}

/**
 * A page of the full "who viewed me" list (owner-only; empty for anyone else).
 * The strip uses getProfileViews; this backs the tap-through modal.
 */
export async function getProfileVisitors(
  studentId: string,
  offset = 0,
  limit = 20,
): Promise<ProfileVisitorPage> {
  const { data, error } = await supabase.rpc('get_profile_visitors', {
    p_student_id: studentId,
    p_offset: offset,
    p_limit: limit,
  })
  if (error) throw error
  const rows = (data ?? []) as Array<{
    student_id: string
    display_name: string
    avatar_url: string | null
    section_id: string
    lifetime_points: number
    rank: number | null
    last_viewed_at: string
    view_count: number
    total_count: number
  }>
  return {
    rows: rows.map((r) => ({
      studentId: r.student_id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url ?? null,
      sectionId: r.section_id,
      lifetimePoints: Number(r.lifetime_points) || 0,
      rank: r.rank == null ? null : Number(r.rank),
      lastViewedAt: r.last_viewed_at,
      viewCount: Number(r.view_count) || 0,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) || 0 : 0,
  }
}

/** Holders-per-badge across the class — powers the rarity readout. */
export async function getAchievementRarity(): Promise<Map<string, AchievementRarity>> {
  const { data, error } = await supabase.rpc('get_achievement_rarity')
  if (error) throw error
  const rows = (data ?? []) as Array<{ code: string; holders: number; total_students: number }>
  const map = new Map<string, AchievementRarity>()
  for (const r of rows) {
    map.set(r.code, {
      code: r.code,
      holders: Number(r.holders) || 0,
      totalStudents: Number(r.total_students) || 0,
    })
  }
  return map
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

