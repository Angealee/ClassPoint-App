import { supabase } from '@/lib/supabase'
import { fetchAllPages, num, rpc, withAuthRetry } from './_internal'
import type {
  GradeAbsence,
  GradeAttendance,
  GradeBoost,
  GradeItem,
  GradePolicy,
  GradeScore,
  GradeSumsRow,
  MyGradeItem,
  MyGrades,
  ReverseBoostResult,
  TermKey,
  TermSums,
} from '@/lib/types'

/** `.in()` chunk size — the same ceiling getSectionStats uses. */
const CHUNK = 150

type PolicyRow = {
  subject_id: string
  term: TermKey
  pt_weight: number | string
  quiz_weight: number | string
  recit_weight: number | string
  cs_weight: number | string
  exam_weight: number | string
  final_weight: number | string
  transmute_base: number | string
  transmute_span: number | string
}

function mapPolicy(row: PolicyRow): GradePolicy {
  return {
    subjectId: row.subject_id,
    term: row.term,
    ptWeight: num(row.pt_weight) ?? 0,
    quizWeight: num(row.quiz_weight) ?? 0,
    recitWeight: num(row.recit_weight) ?? 0,
    csWeight: num(row.cs_weight) ?? 0,
    examWeight: num(row.exam_weight) ?? 0,
    finalWeight: num(row.final_weight) ?? 0,
    transmuteBase: num(row.transmute_base) ?? 0,
    transmuteSpan: num(row.transmute_span) ?? 0,
  }
}

type ItemRow = {
  id: string
  section_id: string
  subject_id: string
  term: TermKey
  component: GradeItem['component']
  name: string
  max_score: number | string
  position: number
  archived_at: string | null
  assist_off?: boolean
  session_id?: string | null
}

function mapItem(row: ItemRow): GradeItem {
  return {
    id: row.id,
    sectionId: row.section_id,
    subjectId: row.subject_id,
    term: row.term,
    component: row.component,
    maxScore: num(row.max_score) ?? 0,
    name: row.name,
    position: row.position,
    archivedAt: row.archived_at,
    assistOff: row.assist_off === true,
    sessionId: row.session_id ?? null,
  }
}

const ITEM_COLS =
  'id, section_id, subject_id, term, component, name, max_score, position, archived_at'

const ITEM_COLS_WITH_ASSIST = `${ITEM_COLS}, assist_off, session_id`

function isMissingAssistColumn(error: { code?: string; message?: string }): boolean {
  return error.code === '42703' || /assist_off|session_id/.test(error.message ?? '')
}

export async function listGradePolicies(subjectId: string): Promise<GradePolicy[]> {
  const { data, error } = await supabase
    .from('grade_policies')
    .select(
      'subject_id, term, pt_weight, quiz_weight, recit_weight, cs_weight, exam_weight, final_weight, transmute_base, transmute_span',
    )
    .eq('subject_id', subjectId)
  if (error) throw error
  return ((data ?? []) as PolicyRow[]).map(mapPolicy)
}

export async function saveGradePolicy(policy: GradePolicy): Promise<void> {
  await withAuthRetry(async () => {
    const { error } = await supabase
      .from('grade_policies')
      .update({
        pt_weight: policy.ptWeight,
        quiz_weight: policy.quizWeight,
        recit_weight: policy.recitWeight,
        cs_weight: policy.csWeight,
        exam_weight: policy.examWeight,
        final_weight: policy.finalWeight,
        transmute_base: policy.transmuteBase,
        transmute_span: policy.transmuteSpan,
        updated_at: new Date().toISOString(),
      })
      .eq('subject_id', policy.subjectId)
      .eq('term', policy.term)
    if (error) throw error
  })
}

export async function saveGradePolicies(
  subjectId: string,
  policies: GradePolicy[],
): Promise<void> {
  try {
    await rpc('save_subject_policy', {
      p_subject_id: subjectId,
      p_policies: policies.map((p) => ({
        term: p.term,
        pt_weight: p.ptWeight,
        quiz_weight: p.quizWeight,
        recit_weight: p.recitWeight,
        cs_weight: p.csWeight,
        exam_weight: p.examWeight,
        final_weight: p.finalWeight,
        transmute_base: p.transmuteBase,
        transmute_span: p.transmuteSpan,
      })),
    })
  } catch (e) {
    const err = e as { code?: string; message?: string } | null
    const missing =
      err?.code === 'PGRST202' ||
      err?.code === '42883' ||
      (/save_subject_policy/.test(err?.message ?? '') &&
        /could not find|does not exist/i.test(err?.message ?? ''))
    if (!missing) throw e
    for (const p of policies) await saveGradePolicy(p)
  }
}

export async function listGradeItems(
  sectionId: string,
  subjectId: string,
  term?: TermKey,
): Promise<GradeItem[]> {
  const run = (cols: string) => {
    let q = supabase
      .from('grade_items')
      .select(cols)
      .eq('section_id', sectionId)
      .eq('subject_id', subjectId)
      .neq('component', 'recitation')
    if (term) q = q.eq('term', term)
    return q.order('component').order('position').order('created_at')
  }

  let { data, error } = await run(ITEM_COLS_WITH_ASSIST)
  if (error && isMissingAssistColumn(error)) {
    ;({ data, error } = await run(ITEM_COLS))
  }
  if (error) throw error
  return ((data ?? []) as unknown as ItemRow[]).map(mapItem)
}

export interface NewGradeItem {
  sectionId: string
  subjectId: string
  term: TermKey
  component: GradeItem['component']
  name: string
  maxScore: number
  position?: number
}

export async function createGradeItem(input: NewGradeItem): Promise<GradeItem> {
  return withAuthRetry(async () => {
    const { data, error } = await supabase
      .from('grade_items')
      .insert({
        section_id: input.sectionId,
        subject_id: input.subjectId,
        term: input.term,
        component: input.component,
        name: input.name.trim(),
        max_score: input.maxScore,
        position: input.position ?? 0,
      })
      .select(ITEM_COLS)
      .single()
    if (error) throw error
    return mapItem(data as ItemRow)
  })
}

export async function updateGradeItem(
  id: string,
  patch: Partial<Pick<GradeItem, 'name' | 'maxScore' | 'position' | 'assistOff' | 'sessionId'>>,
): Promise<void> {
  const row: {
    name?: string
    max_score?: number
    position?: number
    assist_off?: boolean
    session_id?: string | null
  } = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.maxScore !== undefined) row.max_score = patch.maxScore
  if (patch.position !== undefined) row.position = patch.position
  if (patch.assistOff !== undefined) row.assist_off = patch.assistOff
  if (patch.sessionId !== undefined) row.session_id = patch.sessionId
  if (Object.keys(row).length === 0) return

  await withAuthRetry(async () => {
    const { error } = await supabase.from('grade_items').update(row).eq('id', id)
    if (error) throw error
  })
}

export async function setGradeItemArchived(id: string, archived: boolean): Promise<void> {
  await withAuthRetry(async () => {
    const { error } = await supabase
      .from('grade_items')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) throw error
  })
}

export async function listGradeScores(
  itemIds: string[],
  studentId?: string,
): Promise<GradeScore[]> {
  if (itemIds.length === 0) return []

  const out: GradeScore[] = []
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK)
    const rows = await fetchAllPages<{
      item_id: string
      student_id: string
      score: number | string
    }>((from, to) => {
      let q = supabase
        .from('grade_scores')
        .select('item_id, student_id, score')
        .in('item_id', chunk)
      if (studentId) q = q.eq('student_id', studentId)
      return q.order('item_id').order('student_id').range(from, to)
    })
    for (const r of rows) {
      out.push({ itemId: r.item_id, studentId: r.student_id, score: num(r.score) ?? 0 })
    }
  }
  return out
}

export async function saveGradeScores(scores: GradeScore[]): Promise<void> {
  if (scores.length === 0) return
  await withAuthRetry(async () => {
    const { error } = await supabase.from('grade_scores').upsert(
      scores.map((s) => ({ item_id: s.itemId, student_id: s.studentId, score: s.score })),
      { onConflict: 'item_id,student_id' },
    )
    if (error) throw error
  })
}

export async function clearGradeScores(cells: Array<Pick<GradeScore, 'itemId' | 'studentId'>>) {
  if (cells.length === 0) return

  const byItem = new Map<string, string[]>()
  for (const cell of cells) {
    const list = byItem.get(cell.itemId)
    if (list) list.push(cell.studentId)
    else byItem.set(cell.itemId, [cell.studentId])
  }

  for (const [itemId, studentIds] of byItem) {
    for (let i = 0; i < studentIds.length; i += CHUNK) {
      const chunk = studentIds.slice(i, i + CHUNK)
      await withAuthRetry(async () => {
        const { error } = await supabase
          .from('grade_scores')
          .delete()
          .eq('item_id', itemId)
          .in('student_id', chunk)
        if (error) throw error
      })
    }
  }
}

export async function getGradeAbsences(
  sectionId: string,
  subjectId: string,
  term?: TermKey,
): Promise<GradeAbsence[]> {
  const raw = await rpc<GradeAbsence[] | null>('get_grade_absences', {
    p_section_id: sectionId,
    p_subject_id: subjectId,
    p_term: term ?? null,
  })
  return (raw ?? []).map((a) => ({
    itemId: a.itemId,
    studentId: a.studentId,
    source: a.source === 'auto' ? 'auto' : 'manual',
  }))
}

export async function saveGradeAbsences(cells: Array<Pick<GradeScore, 'itemId' | 'studentId'>>) {
  if (cells.length === 0) return
  await withAuthRetry(async () => {
    const { error } = await supabase.from('grade_absences').upsert(
      cells.map((c) => ({ item_id: c.itemId, student_id: c.studentId })),
      { onConflict: 'item_id,student_id' },
    )
    if (error) throw error
  })
}

export async function clearGradeAbsences(cells: Array<Pick<GradeScore, 'itemId' | 'studentId'>>) {
  if (cells.length === 0) return
  const byItem = new Map<string, string[]>()
  for (const cell of cells) {
    const list = byItem.get(cell.itemId)
    if (list) list.push(cell.studentId)
    else byItem.set(cell.itemId, [cell.studentId])
  }
  for (const [itemId, studentIds] of byItem) {
    for (let i = 0; i < studentIds.length; i += CHUNK) {
      const chunk = studentIds.slice(i, i + CHUNK)
      await withAuthRetry(async () => {
        const { error } = await supabase
          .from('grade_absences')
          .delete()
          .eq('item_id', itemId)
          .in('student_id', chunk)
        if (error) throw error
      })
    }
  }
}

export async function getGradeAttendance(
  sectionId: string,
  subjectId: string,
  term: TermKey,
): Promise<Map<string, GradeAttendance>> {
  const rows = await rpc<
    Array<{ student_id: string; showed: number | string; counted: number | string }>
  >('get_grade_attendance', {
    p_section_id: sectionId,
    p_subject_id: subjectId,
    p_term: term,
  })
  const out = new Map<string, GradeAttendance>()
  for (const r of rows ?? []) {
    out.set(r.student_id, { showed: num(r.showed) ?? 0, counted: num(r.counted) ?? 0 })
  }
  return out
}

type SumsRow = {
  student_id: string
  full_name: string
  term: TermKey
  pt_score: number | string
  pt_max: number | string
  pt_marked: number | string
  quiz_score: number | string
  quiz_max: number | string
  quiz_marked: number | string
  recit_score: number | string
  recit_max: number | string
  recit_marked: number | string
  exam_score: number | string
  exam_max: number | string
  exam_marked: number | string
}

function mapSums(row: SumsRow): GradeSumsRow {
  const sums: TermSums = {
    performance_task: {
      sumScore: num(row.pt_score) ?? 0,
      sumMax: num(row.pt_max) ?? 0,
      sumMaxMarked: num(row.pt_marked) ?? 0,
    },
    quiz: {
      sumScore: num(row.quiz_score) ?? 0,
      sumMax: num(row.quiz_max) ?? 0,
      sumMaxMarked: num(row.quiz_marked) ?? 0,
    },
    recitation: {
      sumScore: num(row.recit_score) ?? 0,
      sumMax: num(row.recit_max) ?? 0,
      sumMaxMarked: num(row.recit_marked) ?? 0,
    },
    exam: {
      sumScore: num(row.exam_score) ?? 0,
      sumMax: num(row.exam_max) ?? 0,
      sumMaxMarked: num(row.exam_marked) ?? 0,
    },
  }
  return { studentId: row.student_id, fullName: row.full_name, term: row.term, sums }
}

export async function getSectionGradeSums(
  sectionId: string,
  subjectId: string,
  term?: TermKey,
): Promise<GradeSumsRow[]> {
  const rows = await rpc<SumsRow[]>('get_section_grade_sums', {
    p_section_id: sectionId,
    p_subject_id: subjectId,
    p_term: term ?? null,
  })
  return (rows ?? []).map(mapSums)
}

export interface GradeImportColumn {
  component: GradeItem['component']
  name: string
  maxScore: number
}

export interface GradeImportMark {
  component: GradeItem['component']
  studentId: string
  score: number
}

export interface GradeImportResult {
  itemsCreated: number
  scoresWritten: number
  scoresOverwritten: number
}

export async function importGradeTerm(
  sectionId: string,
  subjectId: string,
  term: TermKey,
  columns: GradeImportColumn[],
  marks: GradeImportMark[],
): Promise<GradeImportResult> {
  const data = await rpc<{
    items_created: number
    scores_written: number
    scores_overwritten: number
  }>('import_grade_term', {
    p_section_id: sectionId,
    p_subject_id: subjectId,
    p_term: term,
    p_components: columns.map((c) => ({
      component: c.component,
      name: c.name,
      max_score: c.maxScore,
    })),
    p_scores: marks.map((m) => ({
      component: m.component,
      student_id: m.studentId,
      score: m.score,
    })),
  })

  return {
    itemsCreated: num(data?.items_created) ?? 0,
    scoresWritten: num(data?.scores_written) ?? 0,
    scoresOverwritten: num(data?.scores_overwritten) ?? 0,
  }
}

export async function getStudentGradesEnabled(): Promise<boolean> {
  return (await rpc<boolean>('cp_student_grades_flag')) === true
}

export async function setStudentGradesEnabled(
  enabled: boolean,
): Promise<{ enabled: boolean; notified: number }> {
  const data = await rpc<{ enabled: boolean; notified: number }>('set_student_grades_enabled', {
    p_enabled: enabled,
  })
  return { enabled: data?.enabled === true, notified: num(data?.notified) ?? 0 }
}

export async function listGradeBoosts(itemIds: string[]): Promise<GradeBoost[]> {
  if (itemIds.length === 0) return []
  const out: GradeBoost[] = []
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK)
    const rows = await fetchAllPages<{
      item_id: string
      student_id: string
      score_before: number | string
      score_after: number | string
      marks_granted: number | string
      points_spent: number
      applied_at: string
    }>((from, to) =>
      supabase
        .from('grade_boosts')
        .select('item_id, student_id, score_before, score_after, marks_granted, points_spent, applied_at')
        .in('item_id', chunk)
        .order('item_id')
        .order('student_id')
        .range(from, to),
    )
    for (const r of rows) {
      out.push({
        itemId: r.item_id,
        studentId: r.student_id,
        scoreBefore: num(r.score_before) ?? 0,
        scoreAfter: num(r.score_after) ?? 0,
        marksGranted: num(r.marks_granted) ?? 0,
        pointsSpent: r.points_spent,
        appliedAt: r.applied_at,
      })
    }
  }
  return out
}

export async function reverseGradeBoost(
  itemId: string,
  studentId: string,
): Promise<ReverseBoostResult> {
  const data = await rpc<{
    mark_restored: boolean
    points_refunded: number
    score_now: number | string | null
  }>('reverse_grade_boost', { p_item_id: itemId, p_student_id: studentId })
  return {
    markRestored: data?.mark_restored === true,
    pointsRefunded: num(data?.points_refunded) ?? 0,
    scoreNow: num(data?.score_now),
  }
}

type MyGradesRaw = {
  enabled: boolean
  figures?: boolean
  subjects: Array<{
    subjectId: string
    code: string
    name: string
    policies: Array<Omit<GradePolicy, 'subjectId'>>
    /** 0063 — absent on a database without it. */
    attendance?: Partial<Record<TermKey, { showed?: number | string; counted?: number | string }>>
    items: MyGradeItem[]
  }>
}

export async function getMyGrades(): Promise<MyGrades> {
  const raw = await rpc<MyGradesRaw>('get_my_grades')
  return {
    enabled: raw?.enabled === true,
    figures: raw?.figures === undefined ? raw?.enabled === true : raw.figures === true,
    subjects: (raw?.subjects ?? []).map((s) => ({
      subjectId: s.subjectId,
      code: s.code,
      name: s.name,
      policies: (s.policies ?? []).map((p) => ({
        subjectId: s.subjectId,
        term: p.term,
        ptWeight: num(p.ptWeight) ?? 0,
        quizWeight: num(p.quizWeight) ?? 0,
        recitWeight: num(p.recitWeight) ?? 0,
        csWeight: num(p.csWeight) ?? 0,
        examWeight: num(p.examWeight) ?? 0,
        finalWeight: num(p.finalWeight) ?? 0,
        transmuteBase: num(p.transmuteBase) ?? 0,
        transmuteSpan: num(p.transmuteSpan) ?? 0,
      })),
      attendance: Object.fromEntries(
        (['prelim', 'midterm', 'finals'] as TermKey[]).map((t) => [
          t,
          {
            showed: num(s.attendance?.[t]?.showed) ?? 0,
            counted: num(s.attendance?.[t]?.counted) ?? 0,
          },
        ]),
      ) as Record<TermKey, GradeAttendance>,
      items: (s.items ?? []).map((i) => ({
        ...i,
        maxScore: num(i.maxScore) ?? 0,
        score: num(i.score),
        offered: i.offered === true,
        absent: i.absent === true,
        boost: i.boost
          ? {
              marks: num(i.boost.marks) ?? 0,
              points: i.boost.points,
              before: num(i.boost.before) ?? 0,
            }
          : null,
        pending: i.pending === true,
      })),
    })),
  }
}

export async function requestGradeBoost(itemId: string, points: number): Promise<string> {
  return await rpc<string>('request_grade_boost', { p_item_id: itemId, p_points: points })
}
