import { supabase } from '@/lib/supabase'
import { oneEmbed, rpc } from './_internal'
import type {
  Redemption,
  RedemptionKind,
  RedemptionRequest,
  RedemptionStatus,
  SpenderStat,
} from '@/lib/types'

// ============================================================================
// Use Points — redemption requests (migration 0019)
// ============================================================================

const REDEMPTION_COLS =
  'id, student_id, points, kind, note, status, requested_at, decided_at, decision_note'

interface RedemptionRow {
  id: string
  student_id: string
  points: number
  kind: RedemptionKind
  note: string | null
  status: RedemptionStatus
  requested_at: string
  decided_at: string | null
  decision_note: string | null
}

const mapRedemption = (r: RedemptionRow): Redemption => ({
  id: r.id,
  studentId: r.student_id,
  points: r.points,
  kind: r.kind,
  note: r.note,
  status: r.status,
  requestedAt: r.requested_at,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
})

/**
 * Ask to put points toward a grade. Server-side this locks the student row and
 * validates the balance against everything already pending, so it throws with a
 * readable message rather than letting anyone overdraw.
 */
export async function requestRedemption(input: {
  points: number
  kind: RedemptionKind
  note?: string
}): Promise<void> {
  const { error } = await supabase.rpc('request_point_redemption', {
    p_points: input.points,
    p_kind: input.kind,
    p_note: input.note?.trim() || null,
  })
  if (error) throw error
}

/** Withdraw one of your own still-pending requests. */
export async function cancelRedemption(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_point_redemption', { p_id: id })
  if (error) throw error
}

/** Instructor: approve (spends the points) or reject, with an optional note. */
export async function decideRedemption(
  id: string,
  approve: boolean,
  note?: string,
): Promise<void> {
  await rpc('decide_point_redemption', {
    p_id: id,
    p_approve: approve,
    p_note: note?.trim() || null,
  })
}

/** One student's own request history, newest first. */
export async function listMyRedemptions(studentId: string): Promise<Redemption[]> {
  const { data, error } = await supabase
    .from('point_redemptions')
    .select(REDEMPTION_COLS)
    .eq('student_id', studentId)
    .order('requested_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as RedemptionRow[]).map(mapRedemption)
}

/** Instructor: every request (optionally just the pending ones), newest first. */
export async function listRedemptions(opts?: {
  status?: RedemptionStatus
  limit?: number
}): Promise<RedemptionRequest[]> {
  let query = supabase
    .from('point_redemptions')
    .select(`${REDEMPTION_COLS}, students(full_name, avatar_url, section_id, semester_points)`)
    .order('requested_at', { ascending: false })
    .limit(opts?.limit ?? 100)
  if (opts?.status) query = query.eq('status', opts.status)
  const { data, error } = await query
  if (error) throw error
  type Row = RedemptionRow & {
    students: {
      full_name: string
      avatar_url: string | null
      section_id: string
      semester_points: number
    } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...mapRedemption(r),
    studentName: r.students?.full_name ?? 'Unknown',
    avatarUrl: r.students?.avatar_url ?? null,
    sectionId: r.students?.section_id ?? '',
    // The spendable balance the approve check re-validates against (0029).
    semesterPoints: r.students?.semester_points ?? 0,
  }))
}

/** How many requests are waiting — drives the instructor's inbox badge. */
export async function getPendingRedemptionCount(): Promise<number> {
  const { count, error } = await supabase
    .from('point_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

/** Instructor: who has actually spent the most (approved requests only). */
/**
 * The instructor's Top spenders card — read from the SAME snapshot the students'
 * spend board renders (0038).
 *
 * It used to sum `point_redemptions` client-side at `limit: 500`, which had two
 * problems. It would truncate the way the attendance queries did before 0031.
 * And once students had a spend board of their own, it was a SECOND definition
 * of one quantity — the exact shape of bug this project has already fixed twice
 * (the "your 142" / "available 137" split). One source, one number.
 *
 * Two deliberate consequences of the move: this is now per-SEMESTER and excludes
 * archived students, both of which match what students see; and the old
 * `requests` count is gone, because the authoritative source cannot provide it.
 * Nothing is lost — every request is listed in full directly above this card.
 */
export async function listTopSpenders(limit = 5): Promise<SpenderStat[]> {
  const { data, error } = await supabase
    .from('leaderboard_snapshot')
    .select('student_id, display_name, spent_points, spend_rank, students(avatar_url)')
    .not('spend_rank', 'is', null)
    .order('spend_rank')
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({
    studentId: r.student_id as string,
    studentName: r.display_name as string,
    avatarUrl: oneEmbed<{ avatar_url: string | null }>(r.students)?.avatar_url ?? null,
    spent: (r.spent_points as number) ?? 0,
    rank: (r.spend_rank as number) ?? 0,
  }))
}

