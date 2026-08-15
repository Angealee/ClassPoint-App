import { supabase } from '@/lib/supabase'
import type {
  AbsenceExcuse,
  ExcuseRequest,
  ExcuseStatus,
} from '@/lib/types'

// ============================================================================
// Absence excuses — the DCT-CCS admission-slip flow (migration 0025)
// ============================================================================

/** File an excuse for one of your own absent records (7-day window). */
export async function requestAbsenceExcuse(
  recordId: string,
  reason: string,
  hasSlip: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('request_absence_excuse', {
    p_record_id: recordId,
    p_reason: reason.trim(),
    p_has_slip: hasSlip,
  })
  if (error) throw error
}

/** Flip your pending excuse's slip status when the Dean issues (or you lose) it. */
export async function setExcuseSlipStatus(id: string, hasSlip: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_excuse_slip_status', { p_id: id, p_has_slip: hasSlip })
  if (error) throw error
}

/** Withdraw your own pending excuse request. */
export async function cancelAbsenceExcuse(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_absence_excuse', { p_id: id })
  if (error) throw error
}

/** Instructor: excuse (on sight of the slip) or reject, with an optional note. */
export async function decideAbsenceExcuse(
  id: string,
  approve: boolean,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('decide_absence_excuse', {
    p_id: id,
    p_approve: approve,
    p_note: note?.trim() || null,
  })
  if (error) throw error
}

/** A student's own excuse requests (join into attendance history by recordId). */
export async function listMyExcuses(studentId: string): Promise<AbsenceExcuse[]> {
  const { data, error } = await supabase
    .from('absence_excuses')
    .select('id, record_id, reason, has_slip, status, requested_at, decided_at, decision_note')
    .eq('student_id', studentId)
    .order('requested_at', { ascending: false })
  if (error) throw error
  return (
    (data ?? []) as Array<{
      id: string
      record_id: string
      reason: string
      has_slip: boolean
      status: ExcuseStatus
      requested_at: string
      decided_at: string | null
      decision_note: string | null
    }>
  ).map((r) => ({
    id: r.id,
    recordId: r.record_id,
    reason: r.reason,
    hasSlip: r.has_slip,
    status: r.status,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  }))
}

/** Instructor: every excuse (optionally just pending), newest first, with context. */
export async function listExcuses(opts?: {
  status?: ExcuseStatus
  limit?: number
}): Promise<ExcuseRequest[]> {
  let query = supabase
    .from('absence_excuses')
    .select(
      'id, record_id, reason, has_slip, status, requested_at, decided_at, decision_note, ' +
        'students(id, full_name, avatar_url, section_id), ' +
        'attendance_records(class_sessions(topic, started_at))',
    )
    .order('requested_at', { ascending: false })
    .limit(opts?.limit ?? 100)
  if (opts?.status) query = query.eq('status', opts.status)
  const { data, error } = await query
  if (error) throw error
  type Row = {
    id: string
    record_id: string
    reason: string
    has_slip: boolean
    status: ExcuseStatus
    requested_at: string
    decided_at: string | null
    decision_note: string | null
    students: { id: string; full_name: string; avatar_url: string | null; section_id: string } | null
    attendance_records: { class_sessions: { topic: string | null; started_at: string } | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    recordId: r.record_id,
    reason: r.reason,
    hasSlip: r.has_slip,
    status: r.status,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    studentId: r.students?.id ?? '',
    studentName: r.students?.full_name ?? 'Unknown',
    avatarUrl: r.students?.avatar_url ?? null,
    sectionId: r.students?.section_id ?? '',
    sessionTopic: r.attendance_records?.class_sessions?.topic ?? null,
    sessionStartedAt: r.attendance_records?.class_sessions?.started_at ?? null,
  }))
}

/** How many excuse requests are waiting — feeds the instructor inbox badge. */
export async function getPendingExcuseCount(): Promise<number> {
  const { count, error } = await supabase
    .from('absence_excuses')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

