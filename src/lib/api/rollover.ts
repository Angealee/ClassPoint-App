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
import type { PastLeaderboardEntry, RolloverCheck, SemesterCloseRow } from '@/lib/types'

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
 * Who closing a semester would archive (0060).
 *
 * Read BEFORE the destructive call so the confirm dialog can state a real
 * number and list the names. A count the instructor cannot check is a count
 * they learn to tap past — and this one is 200 people wide.
 *
 * Students with no section are deliberately absent: they belong to no semester,
 * so `archive_semester_students` will not touch them either. The two agree
 * because they ask the same join.
 */
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

/**
 * Archive every active student in a semester. Returns how many were archived.
 *
 * Idempotent: a second call finds nobody un-archived and returns 0 without
 * touching the leaderboard snapshot, so a retried tap is free.
 */
export async function archiveSemesterStudents(semesterId: string): Promise<number> {
  const n = await rpc<number>('archive_semester_students', { p_semester_id: semesterId })
  return Number(n ?? 0)
}

/**
 * Bring an archived student back, INTO a section.
 *
 * ⚠ Not `restoreStudent` (0023), and the difference is not cosmetic: that one
 *   only clears `archived_at`, leaving the student in the section they had when
 *   they left — a section belonging to a finished semester. `scan_attendance`'s
 *   active-semester guard then refuses them, so they looked restored and could
 *   not attend a class. This sets both columns in one transaction.
 */
export async function restoreStudentInto(
  studentId: string,
  targetSectionId: string,
): Promise<void> {
  await rpc<null>('restore_student_into', {
    p_student_id: studentId,
    p_target_section: targetSectionId,
  })
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
