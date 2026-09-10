import { rpc } from './_internal'
import type {
  PeerCommentInput,
  PeerCompletionRow,
  PeerEvalScope,
  PeerEvalState,
  PeerEvalStatus,
  PeerEvaluationForm,
  PeerEvaluationListItem,
  PeerEvaluationSummary,
  PeerGroup,
  PeerGroupMember,
  PeerRatingInput,
  PeerScaleOption,
} from '@/lib/types'

// ============================================================================
// Peer Evaluation · groups (migration 0049)
//
// Instructor-only, end to end. `peer_groups` and `peer_group_members` are
// instructor-select in RLS and have NO write policies at all, so every call
// here goes through a security-definer RPC that re-asserts the caller. There is
// no student-facing read of a group; Phase 2 hands a student their groupmates
// through the evaluation they are actually in.
// ============================================================================

interface GroupRow {
  id: string
  name: string
  sort_order: number
  member_count: number
  members: PeerGroupMember[] | null
  created_at: string
}

function mapGroup(r: GroupRow): PeerGroup {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    memberCount: r.member_count ?? 0,
    // The RPC already builds camelCase objects in its jsonb, so this is a
    // shape guard rather than a mapping — `jsonb_agg` returns null for a group
    // with no members before the coalesce, and a client running ahead of the
    // migration would get undefined.
    members: r.members ?? [],
    createdAt: r.created_at,
  }
}

/**
 * Every live group in a section, with its members attached.
 *
 * ONE call fills the builder. The screen derives "unassigned" as the section
 * roster minus everyone returned here rather than asking the server a second
 * question — a second source for who is placed is a second thing that can
 * disagree with the first.
 */
export async function getSectionGroups(sectionId: string): Promise<PeerGroup[]> {
  const rows = await rpc<GroupRow[]>('get_section_groups', { p_section: sectionId })
  return (rows ?? []).map(mapGroup)
}

/** Returns the new group's id. Raises in words on a duplicate name. */
export async function createPeerGroup(sectionId: string, name: string): Promise<string> {
  return await rpc<string>('create_peer_group', { p_section: sectionId, p_name: name })
}

export async function renamePeerGroup(groupId: string, name: string): Promise<void> {
  await rpc('rename_peer_group', { p_group: groupId, p_name: name })
}

/**
 * Replace a group's membership with exactly this list.
 *
 * Takes the WHOLE list, not a delta: the sheet the instructor is looking at
 * holds the complete answer, and a delta API lets the screen and the table
 * disagree about a checkbox that toggled twice.
 *
 * ⚠ A student in this list who is already on another team in the same section
 * is MOVED here — the database does that silently, because the alternative is
 * a unique-constraint violation with an index name for a message. The sheet is
 * where the instructor sees the move coming, so it must keep showing each
 * student's current group.
 */
export async function setPeerGroupMembers(groupId: string, studentIds: string[]): Promise<void> {
  await rpc('set_peer_group_members', { p_group: groupId, p_students: studentIds })
}

/** Archive, never delete — Phase 2 snapshots the group id on every submission. */
export async function archivePeerGroup(groupId: string): Promise<void> {
  await rpc('archive_peer_group', { p_group: groupId })
}

// ============================================================================
// Peer Evaluation · evaluations and submission (migration 0050)
//
// ⚠ NOTHING HERE READS `peer_ratings` OR `peer_comments`. Both are
// instructor-select only in RLS, and that is the promise the feature makes: a
// student who could read raw rating rows could difference them against the peer
// list and work out who said what. Released results arrive in Phase 3 through
// an aggregating RPC, which is the only door.
// ============================================================================

interface EvalSummaryRow {
  id: string
  title: string
  instructions: string | null
  subject_code: string
  subject_name: string
  scope: PeerEvalScope
  status: PeerEvalStatus
  closes_at: string | null
  results_released_at: string | null
  peer_count: number
  submitted_at: string | null
  created_at: string
}

function mapSummary(r: EvalSummaryRow): PeerEvaluationSummary {
  return {
    id: r.id,
    title: r.title,
    instructions: r.instructions,
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    scope: r.scope,
    status: r.status,
    closesAt: r.closes_at,
    resultsReleasedAt: r.results_released_at,
    peerCount: r.peer_count ?? 0,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
  }
}

/** Every evaluation targeting this student's section. Empty when none do. */
export async function getMyPeerEvaluations(): Promise<PeerEvaluationSummary[]> {
  const rows = await rpc<EvalSummaryRow[]>('get_my_peer_evaluations')
  return (rows ?? []).map(mapSummary)
}

/**
 * The whole form in one call: title, criteria with their scales, and the peers
 * to rate.
 *
 * The RPC returns jsonb already in camelCase, because the payload is nested
 * (criteria carry a scale array, peers are a second list) and a RETURNS TABLE
 * would be either two round trips or a cartesian product to un-pick.
 */
export async function getPeerEvaluation(evaluationId: string): Promise<PeerEvaluationForm> {
  return await rpc<PeerEvaluationForm>('get_peer_evaluation', { p_eval: evaluationId })
}

/**
 * Submit. THERE IS NO SECOND CHANCE — the instructor's call, 2026-09-10.
 *
 * `unique (evaluation_id, evaluator_id)` plus a plain insert, so a stale tab
 * that tries again is refused by the database rather than quietly overwriting.
 * The caller must have said so before getting here; the ConfirmDialog on the
 * form is what discharges that.
 *
 * Keys stay snake_case because the RPC reads them with `jsonb_to_recordset`,
 * which matches on column name. Renaming them here would mean an alias layer in
 * plpgsql for four keys.
 */
export async function submitPeerEvaluation(
  evaluationId: string,
  ratings: PeerRatingInput[],
  comments: PeerCommentInput[],
): Promise<string> {
  return await rpc<string>('submit_peer_evaluation', {
    p_eval: evaluationId,
    p_ratings: ratings,
    p_comments: comments,
  })
}

// ── Instructor ───────────────────────────────────────────────────────────────

interface EvalListRow {
  id: string
  title: string
  subject_code: string
  subject_name: string
  scope: PeerEvalScope
  status: PeerEvalStatus
  closes_at: string | null
  closed_at: string | null
  results_released_at: string | null
  section_names: string[] | null
  criteria_count: number
  submitted_count: number
  expected_count: number
  created_at: string
}

export async function listPeerEvaluations(semesterId?: string): Promise<PeerEvaluationListItem[]> {
  const rows = await rpc<EvalListRow[]>('list_peer_evaluations', {
    p_semester: semesterId ?? null,
  })
  return (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    scope: r.scope,
    status: r.status,
    closesAt: r.closes_at,
    closedAt: r.closed_at,
    resultsReleasedAt: r.results_released_at,
    sectionNames: r.section_names ?? [],
    criteriaCount: r.criteria_count ?? 0,
    submittedCount: r.submitted_count ?? 0,
    expectedCount: r.expected_count ?? 0,
    createdAt: r.created_at,
  }))
}

export interface CreatePeerEvaluationArgs {
  subjectId: string
  title: string
  instructions: string
  scope: PeerEvalScope
  sectionIds: string[]
  criteria: { label: string; scale: PeerScaleOption[] }[]
  /** ISO string, or null for "closed by hand only". */
  closesAt: string | null
}

/**
 * Create and open in one step, which is also when the "it's open" push goes out.
 *
 * There is no draft state on purpose: criteria and sections arrive with the
 * evaluation, so there is never a window where a student can open one and find
 * it empty. The composer's ConfirmDialog states the real recipient count for
 * the same reason `Broadcast` does — a push cannot be recalled.
 */
export async function createPeerEvaluation(args: CreatePeerEvaluationArgs): Promise<string> {
  return await rpc<string>('create_peer_evaluation', {
    p_subject: args.subjectId,
    p_title: args.title,
    p_instructions: args.instructions,
    p_scope: args.scope,
    p_sections: args.sectionIds,
    p_criteria: args.criteria,
    p_closes_at: args.closesAt,
  })
}

/**
 * Edit. Criteria and sections LOCK once anyone has submitted.
 *
 * Pass a field only to change it. `closesAt` needs its companion flag because
 * null is a real value there (no deadline) and cannot also mean "leave alone" —
 * the RPC would otherwise clear a deadline on every title fix.
 */
export async function updatePeerEvaluation(
  evaluationId: string,
  patch: {
    title?: string
    instructions?: string
    sectionIds?: string[]
    criteria?: { label: string; scale: PeerScaleOption[] }[]
    closesAt?: string | null
  },
): Promise<void> {
  await rpc('update_peer_evaluation', {
    p_eval: evaluationId,
    p_title: patch.title ?? null,
    p_instructions: patch.instructions ?? null,
    p_sections: patch.sectionIds ?? null,
    p_criteria: patch.criteria ?? null,
    p_closes_at: patch.closesAt ?? null,
    p_set_closes_at: 'closesAt' in patch,
  })
}

/** Returns false when it was already closed — the cron may have beaten you. */
export async function closePeerEvaluation(evaluationId: string): Promise<boolean> {
  return await rpc<boolean>('close_peer_evaluation', { p_eval: evaluationId })
}

/** Also clears the deadline, or the cron would close it again within the minute. */
export async function reopenPeerEvaluation(evaluationId: string): Promise<void> {
  await rpc('reopen_peer_evaluation', { p_eval: evaluationId })
}

export async function extendPeerEvaluation(
  evaluationId: string,
  closesAt: string | null,
): Promise<void> {
  await rpc('extend_peer_evaluation', { p_eval: evaluationId, p_closes_at: closesAt })
}

interface CompletionRow {
  student_id: string
  display_name: string
  full_name: string
  avatar_url: string | null
  section_name: string
  group_name: string | null
  peer_count: number
  submitted_at: string | null
  applicable: boolean
}

/** Submitted, not submitted, and not applicable. Outstanding students first. */
export async function getPeerCompletion(evaluationId: string): Promise<PeerCompletionRow[]> {
  const rows = await rpc<CompletionRow[]>('get_peer_completion', { p_eval: evaluationId })
  return (rows ?? []).map((r) => ({
    studentId: r.student_id,
    displayName: r.display_name,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    sectionName: r.section_name,
    groupName: r.group_name,
    peerCount: r.peer_count ?? 0,
    submittedAt: r.submitted_at,
    applicable: !!r.applicable,
  }))
}

/** The kill switch, answered once in SQL. The client only renders the answer. */
export async function getPeerEvalState(): Promise<PeerEvalState> {
  return await rpc<PeerEvalState>('cp_peer_eval_state')
}
