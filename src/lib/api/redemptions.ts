import { supabase } from '@/lib/supabase'
import { rpc } from './_internal'
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
export async function listTopSpenders(limit = 5): Promise<SpenderStat[]> {
  const all = await listRedemptions({ status: 'approved', limit: 500 })
  const by = new Map<string, SpenderStat>()
  for (const r of all) {
    const cur = by.get(r.studentId) ?? {
      studentId: r.studentId,
      studentName: r.studentName,
      avatarUrl: r.avatarUrl,
      spent: 0,
      requests: 0,
    }
    cur.spent += r.points
    cur.requests += 1
    by.set(r.studentId, cur)
  }
  return [...by.values()].sort((a, b) => b.spent - a.spent).slice(0, limit)
}

