import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  boostColumns,
  boostReason,
  boostableCount,
  breakdownSegments,
  explainTerm,
  latestSoFar,
  markTone,
  sortItems,
  summarizeTerm,
  termsWithItems,
} from './student-grades'
import { defaultPolicy, sumsFromScores, termGrade } from './grading'
import type { GradePolicy, MyGradeItem, MyGradeSubject, TermKey } from './types'

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
    const s = subject([
      it_({ id: 'pt', component: 'performance_task', maxScore: 20, score: 20 }),
      it_({ id: 'q', component: 'quiz', maxScore: 10, score: 5 }),
      it_({ id: 'r', component: 'recitation', maxScore: 10, score: null }),
      it_({ id: 'e', component: 'exam', maxScore: 50, score: null }),
    ])
    const t = summarizeTerm(s, 'prelim')
    expect(t.soFar).toBeCloseTo(75, 10)

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
    'src/components/grades/ReportPlate.tsx',
    'src/components/grades/GradeShareCard.tsx',
    'src/components/grades/GradeShareSheet.tsx',
  ]

  it.each(STUDENT_FILES)('%s has no path to the official view', (file) => {
    expect(code(file)).not.toMatch(/['"]official['"]/)
  })

  it.each(STUDENT_FILES)('%s never computes a final grade', (file) => {
    expect(code(file)).not.toMatch(/\bfinalGrade\b/)
  })

  it('reads the student grades through the aggregating RPC, never a table', () => {
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

describe('breakdownSegments', () => {
  // Default policy: PT 30% · Quiz 15% · Recitation 15% · Exam 40% of the term; scores run 60-100.
  const marked = () => ({
    ...subject([
      it_({ id: 'pt', component: 'performance_task', maxScore: 20, score: 10 }),
      it_({ id: 'q1', component: 'quiz', maxScore: 20, score: 18 }),
      it_({ id: 'ex', component: 'exam', maxScore: 50, score: 50 }),
    ]),
    attendance: {
      prelim: { showed: 9, counted: 10 },
      midterm: { showed: 0, counted: 0 },
      finals: { showed: 0, counted: 0 },
    },
  })

  it('reads each part’s share of the term from the policy', () => {
    const segs = breakdownSegments(marked(), 'prelim')!
    expect(segs.map((s) => [s.component, s.weightPct])).toEqual([
      ['performance_task', 30],
      ['quiz', 15],
      ['recitation', 15],
      ['exam', 40],
    ])
    expect(segs.reduce((n, s) => n + s.weightPct, 0)).toBe(100)
  })

  it('fills by the attainable range, not score / 100 (hand-checked)', () => {
    const by = Object.fromEntries(breakdownSegments(marked(), 'prelim')!.map((s) => [s.component, s]))
    // PT 10/20 -> (0.5 * 0.4 + 0.6) * 100 = 80 -> (80 - 60) / 40 = 0.5, not 0.8
    expect(by.performance_task.score).toBeCloseTo(80, 6)
    expect(by.performance_task.fill).toBeCloseTo(0.5, 6)
    // Quiz 18/20 -> 96 -> 0.9
    expect(by.quiz.fill).toBeCloseTo(0.9, 6)
    // Exam full marks -> 100 -> 1
    expect(by.exam.fill).toBe(1)
  })

  it('draws recitation as the attendance rate, with no floor', () => {
    const rec = breakdownSegments(marked(), 'prelim')!.find((s) => s.component === 'recitation')!
    expect(rec.score).toBeCloseTo(90, 6)
    expect(rec.fill).toBeCloseTo(0.9, 6)
  })

  it('has no fill for a part nothing is marked in (not an empty-looking 60)', () => {
    const s = subject([it_({ id: 'q1', component: 'quiz', maxScore: 20, score: 18 })])
    const by = Object.fromEntries(breakdownSegments(s, 'prelim')!.map((x) => [x.component, x]))
    expect(by.exam.score).toBeNull()
    expect(by.exam.fill).toBeNull()
    expect(by.quiz.fill).toBeCloseTo(0.9, 6)
  })

  it('returns null when the policy cannot be trusted, so no bar is drawn for it', () => {
    const bad = { ...defaultPolicy('s1', 'prelim'), ptWeight: 0.9 }
    expect(breakdownSegments(subject([it_({ id: 'q1', score: 5 })], [bad]), 'prelim')).toBeNull()
  })
})

describe('markTone', () => {
  it('keeps the middle neutral and never uses red for a mark', () => {
    expect(markTone(65)).toBeNull()
    expect(markTone(68)).toBeNull()
    expect(markTone(50)).toBeNull()
    expect(markTone(100)).toBe('success')
    expect(markTone(49.9)).toBe('warn')
    expect(markTone(0)).toBe('warn')
    for (const pct of [0, 20, 49, 50, 69, 70, 84, 99, 100]) {
      expect(markTone(pct)).not.toBe('danger')
    }
  })
})

describe('the grade card is private by default', () => {
  const CARD = 'src/components/grades/GradeShareCard.tsx'
  const SHEET = 'src/components/grades/GradeShareSheet.tsx'
  const PLATE = 'src/components/grades/ReportPlate.tsx'

  it('stamps "so far, not final" on the image itself', () => {
    expect(code(CARD)).toMatch(/SO FAR · NOT FINAL/)
  })

  it('starts with the name and the subject OFF, and resets them each time it opens', () => {
    const src = code(SHEET)
    expect(src).toMatch(/const \[showName, setShowName\] = useState\(false\)/)
    expect(src).toMatch(/const \[showSubject, setShowSubject\] = useState\(false\)/)
    expect(src).toMatch(/setShowName\(false\)/)
    expect(src).toMatch(/setShowSubject\(false\)/)
  })

  it('asks once before it renders a card with marks on it', () => {
    const src = code(SHEET)
    expect(src).toContain('confirming')
    expect(src).toMatch(/Share your marks\?/)
    // The render is only ever called from the confirm button, never from the first press.
    expect(src).toMatch(/onClick=\{\(\) => setConfirming\(true\)\}/)
  })

  it('only offers a card when the figure is revealed, switched on and there is one to show', () => {
    const src = code('src/features/student/StudentGrades.tsx')
    expect(src).toMatch(/const canShare = figures && reveal && summary\.soFar !== null/)
  })

  it('draws every colour on the plate as a literal, never a themed token', () => {
    expect(code(CARD)).not.toMatch(/var\(--/)
    expect(code(PLATE)).not.toMatch(/bg-card|text-ink|border-line/)
  })
})
