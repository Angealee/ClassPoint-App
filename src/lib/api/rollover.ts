/**
 * Semester rollover (0035).
 *
 * The switch itself is `setActiveSemester`, and it is the single most
 * destructive operation in the app: it resets every student's points, level and
 * rank. The blocking checks live in SQL, not here — this module only surfaces
 * them so the wizard can show them before anyone commits.
 */
import { supabase } from '@/lib/supabase'
import { rpc } from './_internal'
import type { PastLeaderboardEntry, RolloverCheck } from '@/lib/types'

/**
 * Everything standing between the instructor and a safe rollover.
 *
 * An empty array means it's safe. `severity: 'block'` items are refused by
 * `set_active_semester` itself; `'warn'` items are the instructor's call.
 */
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

/** Move students into a section in the new semester. Returns how many moved. */
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

/** Archive students in bulk (one leaderboard refresh, not one per student). */
export async function archiveStudents(studentIds: string[]): Promise<number> {
  const n = await rpc<number>('archive_students', { p_student_ids: studentIds })
  return Number(n ?? 0)
}

/**
 * Make a semester active. Resets every student's spendable points to that
 * semester's ledger and rebuilds the leaderboard.
 *
 * Re-runs the blocking pre-flight server-side, so a stale UI cannot slip a
 * rollover past a live class or a pending redemption.
 */
export async function setActiveSemester(semesterId: string): Promise<number> {
  const n = await rpc<number>('set_active_semester', { p_semester_id: semesterId })
  return Number(n ?? 0)
}

/**
 * A past semester's final board, recomputed from the ledger.
 *
 * Includes archived students — they were on that board when it counted.
 */
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
