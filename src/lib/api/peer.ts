import { supabase } from '@/lib/supabase'
import { num, rpc } from './_internal'
import type {
  MyPeerResults,
  PeerEvaluationTemplate,
  PeerCommentInput,
  PeerCommentRow,
  PeerCompletionRow,
  PeerCriterionResult,
  PeerResultRow,
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
    members: r.members ?? [],
    createdAt: r.created_at,
  }
}

export async function getSectionGroups(sectionId: string): Promise<PeerGroup[]> {
  const rows = await rpc<GroupRow[]>('get_section_groups', { p_section: sectionId })
  return (rows ?? []).map(mapGroup)
}

export async function createPeerGroup(sectionId: string, name: string): Promise<string> {
  return await rpc<string>('create_peer_group', { p_section: sectionId, p_name: name })
}

export async function renamePeerGroup(groupId: string, name: string): Promise<void> {
  await rpc('rename_peer_group', { p_group: groupId, p_name: name })
}

export async function setPeerGroupMembers(groupId: string, studentIds: string[]): Promise<void> {
  await rpc('set_peer_group_members', { p_group: groupId, p_students: studentIds })
}

export async function archivePeerGroup(groupId: string): Promise<void> {
  await rpc('archive_peer_group', { p_group: groupId })
}

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

export async function getMyPeerEvaluations(): Promise<PeerEvaluationSummary[]> {
  const rows = await rpc<EvalSummaryRow[]>('get_my_peer_evaluations')
  return (rows ?? []).map(mapSummary)
}

export async function getPeerEvaluation(evaluationId: string): Promise<PeerEvaluationForm> {
  return await rpc<PeerEvaluationForm>('get_peer_evaluation', { p_eval: evaluationId })
}

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
  group_names?: string[] | null
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
    groupNames: r.group_names ?? [],
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
  groupIds: string[] | null
  criteria: { label: string; scale: PeerScaleOption[] }[]
  /** ISO string, or null for "closed by hand only". */
  closesAt: string | null
}

export async function createPeerEvaluation(args: CreatePeerEvaluationArgs): Promise<string> {
  return await rpc<string>('create_peer_evaluation', {
    p_subject: args.subjectId,
    p_title: args.title,
    p_instructions: args.instructions,
    p_scope: args.scope,
    p_sections: args.sectionIds,
    p_criteria: args.criteria,
    p_closes_at: args.closesAt,
    ...(args.groupIds && args.groupIds.length > 0 ? { p_groups: args.groupIds } : {}),
  })
}

export async function updatePeerEvaluation(
  evaluationId: string,
  patch: {
    title?: string
    instructions?: string
    sectionIds?: string[]
    groupIds?: string[]
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
    ...(patch.groupIds !== undefined ? { p_groups: patch.groupIds } : {}),
  })
}

export async function closePeerEvaluation(evaluationId: string): Promise<boolean> {
  return await rpc<boolean>('close_peer_evaluation', { p_eval: evaluationId })
}

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

export async function getPeerEvalState(): Promise<PeerEvalState> {
  return await rpc<PeerEvalState>('cp_peer_eval_state')
}

interface ResultRow {
  student_id: string
  display_name: string
  full_name: string
  avatar_url: string | null
  section_name: string
  group_name: string | null
  rater_count: number
  overall_pct: number | string | null
  overall_raw: number | string | null
  same_scale: boolean
  criteria: PeerCriterionResult[] | null
  comments: PeerCommentRow[] | null
}

function mapCriteria(list: PeerCriterionResult[] | null): PeerCriterionResult[] {
  return (list ?? []).map((c) => ({
    ...c,
    avg: num(c.avg as unknown as number | string) ?? 0,
    pct: num(c.pct as unknown as number | string) ?? 0,
    scaleMin: num(c.scaleMin as unknown as number | string) ?? 0,
    scaleMax: num(c.scaleMax as unknown as number | string) ?? 0,
  }))
}

export async function getPeerResults(
  evaluationId: string,
  sectionId?: string,
): Promise<PeerResultRow[]> {
  const rows = await rpc<ResultRow[]>('get_peer_results', {
    p_eval: evaluationId,
    p_section: sectionId ?? null,
  })
  return (rows ?? []).map((r) => ({
    studentId: r.student_id,
    displayName: r.display_name,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    sectionName: r.section_name,
    groupName: r.group_name,
    raterCount: r.rater_count ?? 0,
    overallPct: num(r.overall_pct),
    overallRaw: num(r.overall_raw),
    sameScale: !!r.same_scale,
    criteria: mapCriteria(r.criteria),
    comments: (r.comments ?? []).map((c) => ({ ...c, flagged: !!c.flagged })),
  }))
}

export async function getMyPeerResults(evaluationId: string): Promise<MyPeerResults> {
  const raw = await rpc<MyPeerResults>('get_my_peer_results', { p_eval: evaluationId })
  return {
    ...raw,
    overallPct: num(raw.overallPct as unknown as number | string),
    overallRaw: num(raw.overallRaw as unknown as number | string),
    criteria: mapCriteria(raw.criteria),
    comments: raw.comments ?? [],
  }
}

export async function releasePeerResults(evaluationId: string): Promise<number> {
  return await rpc<number>('release_peer_results', { p_eval: evaluationId })
}

export async function setPeerCommentHidden(
  submissionId: string,
  rateeId: string,
  hidden: boolean,
): Promise<void> {
  await rpc('set_peer_comment_hidden', {
    p_submission: submissionId,
    p_ratee: rateeId,
    p_hidden: hidden,
  })
}

export async function deletePeerEvaluation(evaluationId: string, typedTitle: string): Promise<number> {
  return await rpc<number>('delete_peer_evaluation', {
    p_eval: evaluationId,
    p_confirm_title: typedTitle,
  })
}

export async function getPeerEvaluationTemplate(
  evaluationId: string,
): Promise<PeerEvaluationTemplate> {
  const [evalRes, critRes, secRes] = await Promise.all([
    supabase
      .from('peer_evaluations')
      .select('title, instructions, scope, subject_id')
      .eq('id', evaluationId)
      .single(),
    supabase
      .from('peer_criteria')
      .select('label, scale, sort_order')
      .eq('evaluation_id', evaluationId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('peer_evaluation_sections')
      .select('section_id')
      .eq('evaluation_id', evaluationId),
  ])
  if (evalRes.error) throw evalRes.error
  if (critRes.error) throw critRes.error
  if (secRes.error) throw secRes.error

  let groupIds: string[] = []
  const groupRes = await supabase
    .from('peer_evaluation_groups')
    .select('group_id')
    .eq('evaluation_id', evaluationId)
  if (!groupRes.error) groupIds = (groupRes.data ?? []).map((g) => g.group_id as string)

  const e = evalRes.data
  return {
    title: e.title as string,
    instructions: (e.instructions as string | null) ?? '',
    scope: e.scope as PeerEvalScope,
    subjectId: e.subject_id as string,
    sectionIds: (secRes.data ?? []).map((s) => s.section_id as string),
    groupIds,
    criteria: (critRes.data ?? []).map((c) => ({
      label: c.label as string,
      scale: (c.scale as PeerScaleOption[]) ?? [],
    })),
  }
}

export async function applyPeerGroupPlan(
  sectionId: string,
  replace: boolean,
  groups: { name: string; studentIds: string[] }[],
): Promise<number> {
  return await rpc<number>('apply_peer_group_plan', {
    p_section: sectionId,
    p_replace: replace,
    p_groups: groups,
  })
}
