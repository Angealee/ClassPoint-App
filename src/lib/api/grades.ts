import { supabase } from '@/lib/supabase'
import { fetchAllPages, num, rpc, withAuthRetry } from './_internal'
import type {
  GradeItem,
  GradePolicy,
  GradeScore,
  GradeSumsRow,
  TermKey,
  TermSums,
} from '@/lib/types'

// ============================================================================
// Grades (migration 0057)
//
// Instructor-only, end to end: all three tables are instructor-gated in RLS
// with no student branch at all, so there is no "own rows" path to widen by
// accident. Nothing in this module reads point_events — points are never turned
// into a grade.
//
// ⚠ NO ARITHMETIC LIVES HERE EITHER. This module fetches and writes; every
// weight and the transmutation live in src/lib/grading.ts, which is the only
// definition of them in the codebase. See that file's header for why there is
// deliberately no SQL mirror.
// ============================================================================

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
  // Every weight is `numeric` and therefore arrives as a string — see num().
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
  }
}

const ITEM_COLS =
  'id, section_id, subject_id, term, component, name, max_score, position, archived_at'

// ----------------------------------------------------------------------------
// Policies
// ----------------------------------------------------------------------------

/**
 * The three weight rows for one subject.
 *
 * 0057 seeds all three on subject creation, so a short list means someone
 * deleted one — `subjectPolicyError` in grading.ts names the missing term
 * rather than letting a final grade be computed out of 70%.
 */
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

/**
 * Save one term's weights.
 *
 * Validate with `policyError` BEFORE calling: the table's CHECKs cover the two
 * row-level sums and will reject a bad write, but with a constraint name rather
 * than a sentence anyone would want to read. The cross-row rule (the three
 * terms' shares summing to 1) cannot be a CHECK at all and is only ever caught
 * client-side — see the comment in 0057.
 */
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

// ----------------------------------------------------------------------------
// Items — the score columns
// ----------------------------------------------------------------------------

/** Every score column for a scope. Archived ones are included, flagged. */
export async function listGradeItems(
  sectionId: string,
  subjectId: string,
  term?: TermKey,
): Promise<GradeItem[]> {
  let q = supabase
    .from('grade_items')
    .select(ITEM_COLS)
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId)
  if (term) q = q.eq('term', term)
  const { data, error } = await q.order('component').order('position').order('created_at')
  if (error) throw error
  return ((data ?? []) as ItemRow[]).map(mapItem)
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

/**
 * Rename, re-max or reposition a column.
 *
 * Changing `maxScore` moves every grade in the section, exactly as a weight
 * change does — the caller is expected to confirm it the same way.
 */
export async function updateGradeItem(
  id: string,
  patch: Partial<Pick<GradeItem, 'name' | 'maxScore' | 'position'>>,
): Promise<void> {
  const row: { name?: string; max_score?: number; position?: number } = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.maxScore !== undefined) row.max_score = patch.maxScore
  if (patch.position !== undefined) row.position = patch.position
  if (Object.keys(row).length === 0) return

  await withAuthRetry(async () => {
    const { error } = await supabase.from('grade_items').update(row).eq('id', id)
    if (error) throw error
  })
}

/**
 * Retire a column, or bring one back.
 *
 * Archiving takes the item's `max_score` out of the denominator, so every grade
 * in the section moves — the same magnitude as editing a weight, and gated the
 * same way. The scores survive, so restoring puts the class back exactly.
 */
export async function setGradeItemArchived(id: string, archived: boolean): Promise<void> {
  await withAuthRetry(async () => {
    const { error } = await supabase
      .from('grade_items')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) throw error
  })
}

// ----------------------------------------------------------------------------
// Scores — the cells
// ----------------------------------------------------------------------------

/**
 * Every mark against these columns.
 *
 * ⚠ PAGED, and it has to be: a section's term is ~40 students × ~20 items = 800
 * rows, which sits just under PostgREST's silent 1000-row cap — and three terms,
 * or a section that grows, is straight past it. The 0031 lesson is that the cap
 * truncates without an error, so the grid would quietly lose its last columns.
 *
 * Ordered by the primary key, which is unique, so pages cannot skip or repeat.
 */
export async function listGradeScores(
  itemIds: string[],
  /**
   * Narrow to one student.
   *
   * The per-student breakdown wants ~120 cells; without this it would pull the
   * whole class's marks for every item of every term — roughly 4,800 rows — to
   * render one person's record.
   */
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

/**
 * Write a batch of marks.
 *
 * ONE upsert for every dirty cell, so a fast run down a column is a single
 * round trip rather than forty. `onConflict` is the primary key, which makes
 * this idempotent — a retry can never double-write.
 *
 * A score of 0 is a real mark and belongs here. CLEARING a cell is a different
 * operation entirely (`clearGradeScores`): it removes the row, which changes
 * that student's in-progress denominator.
 */
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

/**
 * Un-mark cells — NOT the same as setting them to zero.
 *
 * With no row, the item leaves that student's "so far" denominator and counts
 * as a zero in the official grade. With a row holding 0, it counts as a zero in
 * both. That difference is the whole point of storing the absence.
 */
export async function clearGradeScores(cells: Array<Pick<GradeScore, 'itemId' | 'studentId'>>) {
  for (const cell of cells) {
    await withAuthRetry(async () => {
      const { error } = await supabase
        .from('grade_scores')
        .delete()
        .eq('item_id', cell.itemId)
        .eq('student_id', cell.studentId)
      if (error) throw error
    })
  }
}

// ----------------------------------------------------------------------------
// Aggregate — for the overall sheet, where raw cells would not fit
// ----------------------------------------------------------------------------

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

/**
 * Raw component totals, one row per student per term.
 *
 * This is what the overall sheet reads. The grid does NOT use it — it already
 * has every cell on screen and computes its own totals with `sumsFromScores`,
 * which applies the identical non-archived filter so the two cannot disagree.
 *
 * Omitting `term` returns all three, which is ~120 rows for a section: the
 * reason the RPC aggregates per (student, term) rather than per component is
 * that the per-component shape would be 2,496 rows for a whole subject, past
 * the 1000-row cap.
 */
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

// ----------------------------------------------------------------------------
// Import (migration 0058)
// ----------------------------------------------------------------------------

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

/**
 * Write a whole term from a spreadsheet, in ONE transaction.
 *
 * All of it lands or none of it does — an import is four columns and ~160
 * marks, and a half-written one leaves real columns with some marks in them
 * and nothing on screen saying which half is missing. The RPC also refuses a
 * mark for a student outside the section, which aborts the whole run rather
 * than quietly attaching one mark to a stranger.
 *
 * Marks that are NOT sent stay unmarked. Null is never sent as 0.
 */
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
