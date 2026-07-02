import { supabase } from '@/lib/supabase'
import type {
  AwardRecord,
  LeaderboardEntry,
  LeaderboardRow,
  LeaderboardSnapshot,
  PointCategory,
  PointEvent,
  PublicPointEvent,
  PublicProfile,
  Section,
  SectionStudent,
  StudentSelf,
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
    .select('id, section_id, full_name, display_name, avatar_url, bio, interests, lifetime_points')
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
      .select('id, display_name, section_id, avatar_url, bio, interests, lifetime_points, created_at')
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
