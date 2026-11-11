import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  boostColumns,
  boostReason,
  boostableCount,
  explainTerm,
  latestSoFar,
  sortItems,
  summarizeTerm,
  termsWithItems,
} from './student-grades'
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
    offered: true,
    absent: false,
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
    attendance: {
      prelim: { showed: 0, counted: 0 },
      midterm: { showed: 0, counted: 0 },
      finals: { showed: 0, counted: 0 },
    },
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

describe('explainTerm', () => {
  it('turns "50% of 60%" into the shares a student can reason with', () => {
    // 0.6 × 0.5 = 30, 0.6 × 0.25 = 15, 0.6 × 0.25 = 15, exam 40 — worked by hand.
    const e = explainTerm(subject([]), 'prelim')
    expect(e?.parts.map((p) => [p.component, p.sharePct])).toEqual([
      ['performance_task', 30],
      ['quiz', 15],
      ['recitation', 15],
      ['exam', 40],
    ])
    // The shares of a term add to the whole of it.
    expect(e?.parts.reduce((n, p) => n + p.sharePct, 0)).toBe(100)
  })

  it('states the scale a part is scored on', () => {
    expect(explainTerm(subject([]), 'prelim')).toMatchObject({ floor: 60, ceiling: 100 })
  })

  it('follows a changed policy, with no floating-point residue', () => {
    // CS 70 / Exam 30, and 40/30/30 inside CS → 28, 21, 21, 30.
    const custom: GradePolicy = {
      ...defaultPolicy('s1', 'prelim'),
      csWeight: 0.7,
      examWeight: 0.3,
      ptWeight: 0.4,
      quizWeight: 0.3,
      recitWeight: 0.3,
    }
    const e = explainTerm(subject([], [custom]), 'prelim')
    expect(e?.parts.map((p) => p.sharePct)).toEqual([28, 21, 21, 30])
  })

  it('leaves out a part that carries no weight', () => {
    const noRecit: GradePolicy = {
      ...defaultPolicy('s1', 'prelim'),
      ptWeight: 0.5,
      quizWeight: 0.5,
      recitWeight: 0,
    }
    const e = explainTerm(subject([], [noRecit]), 'prelim')
    expect(e?.parts.map((p) => p.component)).toEqual(['performance_task', 'quiz', 'exam'])
  })

  it('explains nothing when the weights are broken or missing', () => {
    // The same rule that withholds the term figure: do not explain a number that
    // is not being shown.
    const bad: GradePolicy = { ...defaultPolicy('s1', 'prelim'), ptWeight: 0.9 }
    expect(explainTerm(subject([], [bad]), 'prelim')).toBeNull()
    expect(explainTerm(subject([], []), 'prelim')).toBeNull()
  })
})

describe('boostColumns / boostReason', () => {
  const offered = { offered: true }

  it('puts boostable columns in one list and everything else in another', () => {
    const s = subject([
      it_({ id: 'ok', score: 5, ...offered }),
      it_({ id: 'unmarked', score: null, ...offered }),
      it_({ id: 'full', score: 10, ...offered }),
      it_({ id: 'pending', score: 5, ...offered, pending: true }),
      it_({ id: 'done', score: 9, ...offered, boost: { marks: 4, points: 5, before: 5 } }),
      it_({ id: 'none', score: 5, offered: false }),
    ])
    const { actionable, other } = boostColumns([s])
    expect(actionable.map((c) => c.item.id)).toEqual(['ok'])
    expect(other.map((c) => c.item.id).sort()).toEqual(
      ['done', 'full', 'none', 'pending', 'unmarked'].sort(),
    )
    // Nothing is lost between the two lists.
    expect(actionable.length + other.length).toBe(6)
  })

  it('agrees with boostableCount — the two screens cannot disagree about a column', () => {
    const s = subject([
      it_({ id: 'a', score: 5, ...offered }),
      it_({ id: 'b', score: 6, ...offered }),
      it_({ id: 'c', score: null, ...offered }),
    ])
    expect(boostColumns([s]).actionable.length).toBe(boostableCount([s]))
  })

  it('keeps the grid’s order: term, then component, then position', () => {
    const s = subject([
      it_({ id: 'fin', term: 'finals', score: 1, ...offered }),
      it_({ id: 'q2', term: 'prelim', component: 'quiz', position: 1, score: 1, ...offered }),
      it_({ id: 'pt', term: 'prelim', component: 'performance_task', score: 1, ...offered }),
      it_({ id: 'q1', term: 'prelim', component: 'quiz', position: 0, score: 1, ...offered }),
    ])
    expect(boostColumns([s]).actionable.map((c) => c.item.id)).toEqual(['pt', 'q1', 'q2', 'fin'])
  })

  it('carries the subject with each column, across subjects', () => {
    const a = subject([it_({ id: 'x', score: 1, ...offered })])
    const b = { ...subject([it_({ id: 'y', score: 1, ...offered })]), subjectId: 's2', code: 'EL 1' }
    expect(boostColumns([a, b]).actionable.map((c) => c.subject.code)).toEqual(['IT 32', 'EL 1'])
  })

  it('says why a column is not actionable, in plain words', () => {
    expect(boostReason({ kind: 'pending' })).toMatch(/waiting/i)
    expect(boostReason({ kind: 'unmarked' })).toMatch(/isn.t in/i)
    expect(boostReason({ kind: 'full' })).toMatch(/full marks/i)
    expect(boostReason({ kind: 'not-offered' })).toMatch(/not offered/i)
    expect(boostReason({ kind: 'boosted', marks: 3, points: 5, before: 17 })).toBe('+3 from 5 pts')
  })
})

describe('boostableCount', () => {
  it('counts only columns a request could be made on right now', () => {
    const s = subject([
      it_({ id: 'ok', score: 5, offered: true }),
      it_({ id: 'unmarked', score: null, offered: true }),
      it_({ id: 'full', score: 10, offered: true }),
      it_({ id: 'pending', score: 5, offered: true, pending: true }),
      it_({
        id: 'done',
        score: 9,
        offered: true,
        boost: { marks: 4, points: 5, before: 5 },
      }),
      it_({ id: 'none', score: 5, offered: false }),
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
    'src/features/student/UsePoints.tsx',
    'src/components/points/GradeColumns.tsx',
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

describe('Recitation from attendance (0063)', () => {
  it('uses the student’s attendance rate as-is, beside their marks', () => {
    // Hand-computed. PT unmarked → 60. Quiz 10/10 → 100. Recitation 9 of 10
    // classes → 90 (as-is: no floor, no transmutation). Exam unmarked → 60.
    // CS = 60*.5 + 100*.25 + 90*.25 = 77.5;  term = 77.5*.6 + 60*.4 = 70.5.
    const s = subject([
      it_({ id: 'pt', component: 'performance_task', maxScore: 20, score: null }),
      it_({ id: 'q', component: 'quiz', maxScore: 10, score: 10 }),
      it_({ id: 'e', component: 'exam', maxScore: 50, score: null }),
    ])
    s.attendance.prelim = { showed: 9, counted: 10 }
    const t = summarizeTerm(s, 'prelim')
    expect(t.soFar).toBeCloseTo(70.5, 9)
    const recit = t.components.find((c) => c.component === 'recitation')
    expect(recit?.score).toBeCloseTo(90, 9)
    expect(recit?.earned).toBe(9)
    expect(recit?.possible).toBe(10)
  })

  it('shows a dash for Recitation, not 60, before any class has been counted', () => {
    const s = subject([it_({ id: 'q', component: 'quiz', maxScore: 10, score: 10 })])
    const recit = summarizeTerm(s, 'prelim').components.find((c) => c.component === 'recitation')
    expect(recit?.score).toBeNull()
  })

  it('scopes attendance to the term it belongs to', () => {
    const s = subject([it_({ id: 'q', component: 'quiz', maxScore: 10, score: 10, term: 'midterm' })])
    s.attendance.prelim = { showed: 1, counted: 10 }
    s.attendance.midterm = { showed: 10, counted: 10 }
    const recit = summarizeTerm(s, 'midterm').components.find((c) => c.component === 'recitation')
    expect(recit?.score).toBeCloseTo(100, 9)
  })

  it('explains an absent column in words', () => {
    expect(boostReason({ kind: 'absent' })).toBe('You were absent for this one')
  })

  it('files an absent column under “not available”, never as something to act on', () => {
    const s = subject([it_({ id: 'q', component: 'quiz', score: 4, offered: true, absent: true })])
    const { actionable, other } = boostColumns([s])
    expect(actionable).toHaveLength(0)
    expect(other[0].state.kind).toBe('absent')
    expect(boostableCount([s])).toBe(0)
  })
})

describe('sortItems (Lowest first)', () => {
  const q = (id: string, score: number | null, maxScore: number) => it_({ id, score, maxScore })

  it('keeps the instructor’s order when asked for "In order"', () => {
    const items = [q('a', 18, 20), q('b', 5, 20)]
    expect(sortItems(items, 'order')).toBe(items)
  })

  it('puts the weakest SHARE of the maximum first, not the lowest raw mark', () => {
    // 30/50 = 60% is weaker than 15/20 = 75%, though 30 is the bigger number.
    const out = sortItems([q('strong', 15, 20), q('weak', 30, 50), q('mid', 9, 10)], 'lowest')
    expect(out.map((i) => i.id)).toEqual(['weak', 'strong', 'mid'])
  })

  it('puts unmarked columns last — there is nothing to compare', () => {
    const out = sortItems([q('none', null, 20), q('low', 2, 20), q('high', 19, 20)], 'lowest')
    expect(out.map((i) => i.id)).toEqual(['low', 'high', 'none'])
  })

  it('is stable on ties and never mutates its input', () => {
    const items = [q('x', 10, 20), q('y', 10, 20), q('z', 5, 20)]
    const before = items.map((i) => i.id)
    expect(sortItems(items, 'lowest').map((i) => i.id)).toEqual(['z', 'x', 'y'])
    expect(items.map((i) => i.id)).toEqual(before)
  })
})
