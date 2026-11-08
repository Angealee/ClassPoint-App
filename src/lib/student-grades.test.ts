import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { boostableCount, latestSoFar, summarizeTerm, termsWithItems } from './student-grades'
import { defaultPolicy, sumsFromScores, termGrade } from './grading'
import type { GradePolicy, MyGradeItem, MyGradeSubject, TermKey } from './types'

/**
 * A student's view of their own grades.
 *
 * The figures here are computed BY HAND from the instructor's policy (50/25/25
 * inside Class Standing, 60/40 against the exam, base 0.6 / span 0.4), not by
 * calling the function under test — a test that derives its expectation from the
 * implementation can only ever agree with it.
 */

function it_(over: Partial<MyGradeItem> & { id: string }): MyGradeItem {
  return {
    term: 'prelim',
    component: 'quiz',
    name: over.id,
    maxScore: 10,
    position: 0,
    score: null,
    pointsCost: null,
    pointsBonus: null,
    boost: null,
    pending: false,
    ...over,
  }
}

function subject(items: MyGradeItem[], policies?: GradePolicy[]): MyGradeSubject {
  return {
    subjectId: 's1',
    code: 'IT 32',
    name: 'Platform Technologies',
    policies:
      policies ?? (['prelim', 'midterm', 'finals'] as TermKey[]).map((t) => defaultPolicy('s1', t)),
    items,
  }
}

describe('summarizeTerm', () => {
  it('has no figure for a term nothing is marked in — not a bare 60', () => {
    const s = subject([it_({ id: 'q1', component: 'quiz' }), it_({ id: 'e1', component: 'exam' })])
    const t = summarizeTerm(s, 'prelim')
    expect(t.soFar).toBeNull()
    expect(t.marked).toBe(0)
    expect(t.total).toBe(2)
  })

  it('matches the instructor’s So-far toggle on a part-marked term', () => {
    // Hand-computed. PT 20/20 → 100. Quiz 5/10 → (0.5*0.4+0.6)*100 = 80.
    // Recitation and Exam unmarked → the 60 minimum each.
    // CS = 100*.5 + 80*.25 + 60*.25 = 85;  term = 85*.6 + 60*.4 = 75.
    const s = subject([
      it_({ id: 'pt', component: 'performance_task', maxScore: 20, score: 20 }),
      it_({ id: 'q', component: 'quiz', maxScore: 10, score: 5 }),
      it_({ id: 'r', component: 'recitation', maxScore: 10, score: null }),
      it_({ id: 'e', component: 'exam', maxScore: 50, score: null }),
    ])
    const t = summarizeTerm(s, 'prelim')
    expect(t.soFar).toBeCloseTo(75, 10)

    // …and it IS the same number the instructor's sheet derives, from the same
    // functions, so a student and the instructor can quote one figure.
    const sums = sumsFromScores(
      s.items.map((i) => ({ id: i.id, component: i.component, maxScore: i.maxScore, archivedAt: null })),
      new Map([
        ['pt', 20],
        ['q', 5],
      ]),
    )
    expect(t.soFar).toBe(termGrade(sums, defaultPolicy('s1', 'prelim'), 'soFar'))
  })

  it('shows "—" for an unmarked component, never the minimum', () => {
    const s = subject([
      it_({ id: 'q', component: 'quiz', score: 5 }),
      it_({ id: 'e', component: 'exam', maxScore: 50, score: null }),
    ])
    const t = summarizeTerm(s, 'prelim')
    const exam = t.components.find((c) => c.component === 'exam')
    const quiz = t.components.find((c) => c.component === 'quiz')
    expect(exam?.score).toBeNull()
    expect(quiz?.score).toBeCloseTo(80, 10)
  })

  it('counts a real zero as marked — a zero is not "not marked yet"', () => {
    const s = subject([it_({ id: 'q', component: 'quiz', score: 0 })])
    const t = summarizeTerm(s, 'prelim')
    expect(t.marked).toBe(1)
    // 0/10 → the 60 floor for the quiz component. A figure exists; it is not null.
    expect(t.soFar).not.toBeNull()
  })

  it('withholds the figure when the weights are broken, rather than guess', () => {
    const bad: GradePolicy = { ...defaultPolicy('s1', 'prelim'), ptWeight: 0.9 }
    const s = subject([it_({ id: 'q', score: 5 })], [bad])
    expect(summarizeTerm(s, 'prelim').soFar).toBeNull()
  })

  it('withholds the figure when the term has no policy row at all', () => {
    const s = subject([it_({ id: 'q', score: 5 })], [])
    expect(summarizeTerm(s, 'prelim').soFar).toBeNull()
  })

  it('keeps terms apart', () => {
    const s = subject([
      it_({ id: 'a', term: 'prelim', score: 10 }),
      it_({ id: 'b', term: 'midterm', score: null }),
    ])
    expect(summarizeTerm(s, 'prelim').total).toBe(1)
    expect(summarizeTerm(s, 'midterm').marked).toBe(0)
  })
})

describe('termsWithItems / latestSoFar', () => {
  it('lists only terms that have columns', () => {
    const s = subject([it_({ id: 'a', term: 'prelim' }), it_({ id: 'b', term: 'finals' })])
    expect(termsWithItems(s)).toEqual(['prelim', 'finals'])
  })

  it('picks the LATEST term that has a figure', () => {
    const s = subject([
      it_({ id: 'a', term: 'prelim', score: 8 }),
      it_({ id: 'b', term: 'midterm', score: 9 }),
      it_({ id: 'c', term: 'finals', score: null }),
    ])
    expect(latestSoFar(s)?.term).toBe('midterm')
  })

  it('is null when nothing is marked anywhere', () => {
    expect(latestSoFar(subject([it_({ id: 'a', score: null })]))).toBeNull()
  })
})

describe('boostableCount', () => {
  it('counts only columns a request could be made on right now', () => {
    const s = subject([
      it_({ id: 'ok', score: 5, pointsCost: 5, pointsBonus: 4 }),
      it_({ id: 'unmarked', score: null, pointsCost: 5, pointsBonus: 4 }),
      it_({ id: 'full', score: 10, pointsCost: 5, pointsBonus: 4 }),
      it_({ id: 'pending', score: 5, pointsCost: 5, pointsBonus: 4, pending: true }),
      it_({
        id: 'done',
        score: 9,
        pointsCost: 5,
        pointsBonus: 4,
        boost: { marks: 4, points: 5, before: 5 },
      }),
      it_({ id: 'none', score: 5 }),
    ])
    expect(boostableCount([s])).toBe(1)
  })
})

/**
 * DECISION 15, ENFORCED STRUCTURALLY.
 *
 * "A student never sees the official figure" is the kind of rule that is broken
 * by nobody writing a one-word change: `termGrade(sums, policy, 'official')` in a
 * student screen typechecks, passes every other test, and puts a number on a
 * student's phone that counts unmarked work as a zero. So the student-facing
 * files are read as TEXT and must not reach for it — or for a final grade, which
 * needs the official view of every term.
 *
 * Source-text parsing with comments stripped, because these files DOCUMENT the
 * very thing they forbid (a naive substring check would fail on the prose
 * explaining why). Same technique, and same reason, as material.test.ts.
 */
function code(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

describe('a student is never shown the official grade', () => {
  const STUDENT_FILES = [
    'src/lib/student-grades.ts',
    'src/lib/grade-boost.ts',
    'src/features/student/StudentGrades.tsx',
    'src/features/student/Dashboard.tsx',
  ]

  it.each(STUDENT_FILES)('%s has no path to the official view', (file) => {
    expect(code(file)).not.toMatch(/['"]official['"]/)
  })

  it.each(STUDENT_FILES)('%s never computes a final grade', (file) => {
    // finalGrade needs every term graded under the official rule — that IS the
    // number this feature exists to withhold.
    expect(code(file)).not.toMatch(/\bfinalGrade\b/)
  })

  it('reads the student grades through the aggregating RPC, never a table', () => {
    // 0057's rule: no student branch in RLS, so a student reads grades ONLY
    // through get_my_grades. A direct .from() here would be a read that RLS
    // refuses at best, and a second path to widen at worst.
    const src = readFileSync(join(process.cwd(), 'src/lib/api/grades.ts'), 'utf8')
    const start = src.indexOf('export async function getMyGrades')
    const end = src.indexOf('export async function requestGradeBoost')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(src.slice(start, end)).toContain("rpc<MyGradesRaw>('get_my_grades')")
    expect(src.slice(start, end)).not.toMatch(/\.from\(/)
  })

  it('the matcher itself can see a violation (a guard that cannot fail is not a guard)', () => {
    const offending = "const g = termGrade(sums, policy, 'official')"
    expect(offending).toMatch(/['"]official['"]/)
    expect('const f = finalGrade(terms)').toMatch(/\bfinalGrade\b/)
  })
})
