import { supabase } from '@/lib/supabase'
import { rpc } from './_internal'
import type { PastLeaderboardEntry, RolloverCheck, SemesterCloseRow } from '@/lib/types'

export async function getRolloverPreflight(semesterId: string): Promise<RolloverCheck[]> {
  const { data, error } = await supabase.rpc('get_rollover_preflight', {
    p_semester_id: semesterId,
  })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    code: r.code as string,
    severity: r.severity as 'block' | 'warn',
    count: Number(r.item_count ?? 0),
    detail: r.detail as string,
  }))
}

export async function promoteStudents(
  studentIds: string[],
  targetSectionId: string,
): Promise<number> {
  const n = await rpc<number>('promote_students', {
    p_student_ids: studentIds,
    p_target_section: targetSectionId,
  })
  return Number(n ?? 0)
}

export async function archiveStudents(studentIds: string[]): Promise<number> {
  const n = await rpc<number>('archive_students', { p_student_ids: studentIds })
  return Number(n ?? 0)
}

export async function setActiveSemester(semesterId: string): Promise<number> {
  const n = await rpc<number>('set_active_semester', { p_semester_id: semesterId })
  return Number(n ?? 0)
}

export async function getSemesterClosePreview(
  semesterId: string,
): Promise<SemesterCloseRow[]> {
  const { data, error } = await supabase.rpc('get_semester_close_preview', {
    p_semester_id: semesterId,
  })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    studentId: r.student_id as string,
    fullName: r.full_name as string,
    sectionName: r.section_name as string,
  }))
}

export async function archiveSemesterStudents(semesterId: string): Promise<number> {
  const n = await rpc<number>('archive_semester_students', { p_semester_id: semesterId })
  return Number(n ?? 0)
}

export async function restoreStudentInto(
  studentId: string,
  targetSectionId: string,
): Promise<void> {
  await rpc<null>('restore_student_into', {
    p_student_id: studentId,
    p_target_section: targetSectionId,
  })
}

export async function getSemesterLeaderboard(
  semesterId: string,
): Promise<PastLeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_semester_leaderboard', {
    p_semester_id: semesterId,
  })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    studentId: r.student_id as string,
    displayName: r.display_name as string,
    sectionId: r.section_id as string,
    sectionName: r.section_name as string,
    points: Number(r.points ?? 0),
    rank: Number(r.rank ?? 0),
    avatarUrl: (r.avatar_url as string | null) ?? null,
  }))
}
