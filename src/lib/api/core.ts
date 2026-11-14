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
  RosterPerson,
  Section,
  SectionStudent,
  StudentSelf,
} from '@/lib/types'
import type { NameParts } from '@/lib/student-name'

const SEMESTER_COLS =
  'id, name, starts_on, is_active, farewell_message, semester_terms(term, starts_on, ends_on)'

const TERM_OFFSETS: Array<{ term: TermKey; from: number; to: number }> = [
  { term: 'prelim', from: 0, to: 41 },
  { term: 'midterm', from: 42, to: 83 },
  { term: 'finals', from: 84, to: 125 },
]

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
    farewellMessage: (row.farewell_message as string | null) ?? null,
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

export async function listSemesters(): Promise<Semester[]> {
  const { data, error } = await supabase
    .from('semesters')
    .select(SEMESTER_COLS)
    .order('starts_on', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapSemester)
}

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
    // A new semester has nobody to say goodbye to yet.
    farewellMessage: null,
    terms: TERM_OFFSETS.map((t) => ({
      term: t.term,
      startsOn: addDays(startsOn, t.from),
      endsOn: addDays(startsOn, t.to),
    })),
  }
}

export async function renameSemester(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('semesters').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

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

export async function setSemesterFarewell(
  semesterId: string,
  message: string,
): Promise<void> {
  const trimmed = message.trim()
  const { error } = await supabase
    .from('semesters')
    .update({ farewell_message: trimmed === '' ? null : trimmed })
    .eq('id', semesterId)
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

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id)
  if (error) throw error
}

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
      termCalendarPromise = null
    })
  return termCalendarPromise
}

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
  const { count, error: countError } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', id)
  if (countError) throw countError
  if ((count ?? 0) > 0) {
    throw new Error(
      'Section is not empty, it still has students (archived ones count too).',
    )
  }
  const { error } = await supabase.from('sections').delete().eq('id', id)
  if (error) throw error
}

export async function listRosterBasics(sectionId: string): Promise<RosterPerson[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, display_name, avatar_url')
    .eq('section_id', sectionId)
    .is('archived_at', null)
  if (error) throw error
  return (data ?? [])
    .map((s) => ({
      id: s.id as string,
      fullName: s.full_name as string,
      displayName: s.display_name as string,
      avatarUrl: (s.avatar_url as string | null) ?? null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

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

export async function getSectionStats(sectionIds?: string[]): Promise<Record<string, SectionStat>> {
  let studentQuery = supabase.from('students').select('id, section_id').is('archived_at', null)
  if (sectionIds && sectionIds.length > 0) studentQuery = studentQuery.in('section_id', sectionIds)
  const students = await studentQuery
  if (students.error) throw students.error
  const rows = students.data ?? []
  if (rows.length === 0) return {}

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

export async function listStudents(sectionId: string): Promise<SectionStudent[]> {
  const students = await supabase
    .from('students')
    .select(
      'id, section_id, full_name, display_name, avatar_url, semester_points, lifetime_points, user_id',
    )
    .eq('section_id', sectionId)
    .is('archived_at', null)
  if (students.error) throw students.error

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

export async function createStudent(
  sectionId: string,
  parts: NameParts,
): Promise<{ studentId: string; claimToken: string }> {
  const { data, error } = await supabase
    .rpc('create_student', {
      p_section_id: sectionId,
      p_last_name: parts.lastName,
      p_first_name: parts.firstName,
      p_middle_name: parts.middleName ?? null,
      p_suffix: parts.suffix ?? null,
    })
    .single<{ student_id: string; claim_token: string }>()
  if (error) throw error
  return { studentId: data.student_id, claimToken: data.claim_token }
}

/** Update a student's structured name fields (instructor-only). */
export async function updateStudentName(
  studentId: string,
  parts: NameParts,
): Promise<void> {
  await rpc('update_student_name', {
    p_student_id: studentId,
    p_last_name: parts.lastName,
    p_first_name: parts.firstName,
    p_middle_name: parts.middleName ?? null,
    p_suffix: parts.suffix ?? null,
  })
}

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

export async function archiveStudent(studentId: string): Promise<void> {
  await rpc('archive_student', { p_student_id: studentId })
}

export async function restoreStudent(studentId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_student', { p_student_id: studentId })
  if (error) throw error
}

export async function hardDeleteStudent(studentId: string): Promise<void> {
  const { error } = await supabase.rpc('hard_delete_student', { p_student_id: studentId })
  if (error) throw error
}

export async function listArchivedStudents(sectionId?: string): Promise<ArchivedStudent[]> {
  let query = supabase
    .from('students')
    .select(
      'id, full_name, display_name, avatar_url, lifetime_points, archived_at, sections(name, semesters(name))',
    )
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  if (sectionId) query = query.eq('section_id', sectionId)

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as Array<{
    id: string
    full_name: string
    display_name: string
    avatar_url: string | null
    lifetime_points: number
    archived_at: string
    sections: unknown
  }>).map((r) => {
    const section = oneEmbed<{ name: string; semesters: unknown }>(r.sections)
    const semester = oneEmbed<{ name: string }>(section?.semesters)
    return {
      id: r.id,
      fullName: r.full_name,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      lifetimePoints: r.lifetime_points,
      archivedAt: r.archived_at,
      sectionName: section?.name ?? null,
      semesterName: semester?.name ?? null,
    }
  })
}

export async function resetStudentPin(
  studentId: string,
): Promise<{ token: string; expiresAt: string }> {
  const { data, error } = await supabase
    .rpc('reset_student_pin', { p_student_id: studentId })
    .single<{ reset_token: string; reset_expires_at: string }>()
  if (error) throw error
  return { token: data.reset_token, expiresAt: data.reset_expires_at }
}

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
  await withAuthRetry(async () => {
    const { error } = await supabase.from('point_events').insert(rows)
    if (error) throw error
  })
}

export interface AwardFilters {
  /** Only this section's students. Omit for every section. */
  sectionId?: string
  /** Only this ledger category. Omit for all of them. */
  category?: PointCategory
  offset?: number
}

export async function listRecentAwards(
  limit = 30,
  filters: AwardFilters = {},
): Promise<AwardRecord[]> {
  const cols = filters.sectionId
    ? 'id, student_id, points, category, note, created_at, students!inner(full_name, section_id)'
    : 'id, student_id, points, category, note, created_at, students(full_name, section_id)'
  let q = supabase.from('point_events').select(cols).neq('category', 'redeem')
  if (filters.category) q = q.eq('category', filters.category)
  if (filters.sectionId) q = q.eq('students.section_id', filters.sectionId)
  const from = filters.offset ?? 0
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)
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

export async function deletePointEvent(id: string): Promise<void> {
  const { error } = await supabase.from('point_events').delete().eq('id', id)
  if (error) throw error
}

export async function getLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
  const [snap, meta, avatars] = await Promise.all([
    supabase
      .from('leaderboard_snapshot')
      .select(
        'student_id, display_name, section_id, semester_points, rank, previous_rank, rank_since, spent_points, spend_rank',
      )
      .order('rank'),
    supabase.from('leaderboard_meta').select('captured_at').maybeSingle(),
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
    previous_rank: (e.previous_rank as number | null) ?? null,
    rank_since: (e.rank_since as string | null) ?? new Date().toISOString(),
    spent_points: (e.spent_points as number | null) ?? 0,
    spend_rank: (e.spend_rank as number | null) ?? null,
  }))
  return { entries, capturedAt: meta.data?.captured_at ?? null }
}

export async function getMyStudent(userId: string): Promise<StudentSelf | null> {
  const { data, error } = await supabase
    .from('students')
    .select(
      'id, section_id, full_name, display_name, avatar_url, bio, interests, banner_urls, header_url, header_pos, display_title, pinned_achievements, semester_points, lifetime_points, archived_at',
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { lifetime_points, ...rest } = data as Record<string, unknown>
  return { ...rest, all_time_points: (lifetime_points as number) ?? 0 } as StudentSelf
}

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

export async function getPublicProfile(
  studentId: string,
  eventLimit = 5,
): Promise<PublicProfile> {
  const [studentRes, eventsRes] = await Promise.all([
    supabase
      .from('students')
      .select(
        'id, display_name, section_id, avatar_url, bio, interests, banner_urls, header_url, header_pos, display_title, pinned_achievements, semester_points, created_at',
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
    header_url: (s.header_url as string | null) ?? null,
    header_pos: (s.header_pos as number | null) ?? 50,
    display_title: (s.display_title as string | null) ?? null,
    pinned_achievements: (s.pinned_achievements as string[] | null) ?? null,
    semester_points: (s.semester_points as number) ?? 0,
    created_at: (s.created_at as string | null) ?? null,
    events: (eventsRes.data ?? []) as PublicPointEvent[],
  }
}

export async function updateAvatar(
  studentId: string,
  userId: string,
  original: File,
): Promise<string> {
  const file = await downscaleImage(original, AVATAR_MAX_PX)
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
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

export async function uploadHeaderPhoto(userId: string, original: File): Promise<string> {
  const file = await downscaleImage(original, BANNER_MAX_PX)
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${userId}/header-${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
  if (upErr) throw upErr
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export async function setHeaderUrl(studentId: string, url: string | null): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ header_url: url, header_pos: 50 })
    .eq('id', studentId)
  if (error) throw error
}

/** Save where the cover sits vertically, 0–100 (0040). */
export async function setHeaderPos(studentId: string, pos: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(pos)))
  const { error } = await supabase
    .from('students')
    .update({ header_pos: clamped })
    .eq('id', studentId)
  if (error) throw error
}

/** Save the student's showcase banner photo URLs (0–3). */
export async function setBannerUrls(studentId: string, urls: string[]): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ banner_urls: urls.length ? urls : null })
    .eq('id', studentId)
  if (error) throw error
}

export async function recordProfileView(viewedId: string): Promise<void> {
  const { error } = await supabase.rpc('record_profile_view', { p_viewed_id: viewedId })
  if (error) throw error
}

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

export async function getSectionRegister(
  sectionId: string,
  subjectId?: string,
): Promise<SectionRegister> {
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

  const students = roster
    .filter((s) => s.archived_at == null || statuses[s.id])
    .map((s) => ({ id: s.id, fullName: s.full_name }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))

  return { sessions, students, statuses }
}

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

export async function getMyRank(studentId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('leaderboard_snapshot')
    .select('rank')
    .eq('student_id', studentId)
    .maybeSingle<{ rank: number }>()
  if (error) throw error
  return data?.rank ?? null
}

export interface EventCursor {
  created_at: string
  id: string
}

export async function listStudentEvents(
  studentId: string,
  limit = 20,
  before?: EventCursor,
): Promise<PointEvent[]> {
  let q = supabase
    .from('point_events')
    .select('id, student_id, points, category, note, created_at')
    .eq('student_id', studentId)
  if (before) {
    const at = `"${before.created_at}"`
    q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${before.id})`)
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

