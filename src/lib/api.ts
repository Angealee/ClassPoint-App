import { supabase } from '@/lib/supabase'
import type {
  LeaderboardEntry,
  LeaderboardRow,
  LeaderboardSnapshot,
  PointCategory,
  PointEvent,
  RosterStudent,
  Section,
  StudentSelf,
} from '@/lib/types'

/** All sections, ordered by name (2A, 2B, …). */
export async function listSections(): Promise<Section[]> {
  const { data, error } = await supabase
    .from('sections')
    .select('id, name')
    .order('name')
  if (error) throw error
  return data ?? []
}

/** Roster for a section: student profiles merged with their secret/token info. */
export async function listRoster(sectionId: string): Promise<RosterStudent[]> {
  const [students, secrets] = await Promise.all([
    supabase
      .from('students')
      .select('id, section_id, full_name, display_name, lifetime_points, user_id')
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
      } as RosterStudent
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

export async function deleteStudent(studentId: string): Promise<void> {
  const { error } = await supabase.from('students').delete().eq('id', studentId)
  if (error) throw error
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

/**
 * The frozen leaderboard snapshot + when it was captured.
 * Refreshed twice daily (7:30 AM / 7:30 PM PHT) by a pg_cron job, so the
 * ranking only "settles" twice a day even though dashboards are live.
 */
export async function getLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
  const [snap, meta] = await Promise.all([
    supabase
      .from('leaderboard_snapshot')
      .select('student_id, display_name, section_id, lifetime_points, rank')
      .order('rank'),
    supabase.from('leaderboard_meta').select('captured_at').maybeSingle(),
  ])
  if (snap.error) throw snap.error
  return {
    entries: (snap.data as LeaderboardEntry[]) ?? [],
    capturedAt: meta.data?.captured_at ?? null,
  }
}

/** The signed-in student's own row, located by their auth user id. */
export async function getMyStudent(userId: string): Promise<StudentSelf | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, section_id, full_name, display_name, lifetime_points')
    .eq('user_id', userId)
    .maybeSingle<StudentSelf>()
  if (error) throw error
  return data ?? null
}

/** Student updates their own public display name (column-guarded by trigger). */
export async function updateDisplayName(studentId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ display_name: displayName })
    .eq('id', studentId)
  if (error) throw error
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
