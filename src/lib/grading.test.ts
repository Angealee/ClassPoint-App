import { describe, expect, it } from 'vitest'
import {
  attendanceSums,
  completionByTerm,
  componentScore,
  componentScores,
  componentShare,
  defaultPolicy,
  displayGrade,
  emptySums,
  finalGrade,
  hasAnyItems,
  orderedItems,
  policyError,
  recitationScore,
  subjectPolicyError,
  sumsFromScores,
  sumsToOne,
  termGrade,
  weightedComponents,
  type GradeItemLike,
} from './grading'
import type { GradeComponent, GradePolicy, TermKey, TermSums } from './types'

const POLICY: GradePolicy = defaultPolicy('subject-1', 'finals')

function sums(parts: Partial<Record<GradeComponent, [score: number, max: number]>>): TermSums {
  const out = emptySums()
  for (const [component, pair] of Object.entries(parts)) {
    const [score, max] = pair as [number, number]
    out[component as GradeComponent] = { sumScore: score, sumMax: max, sumMaxMarked: max }
  }
  return out
}

describe('componentScore', () => {
  it('floors at 60 when nothing is scored', () => {
    expect(componentScore(0, 50)).toBe(60)
  })

  it('tops out at 100 on a perfect score', () => {
    expect(componentScore(50, 50)).toBe(100)
  })

  it('returns the floor rather than NaN when the component has no items', () => {
    expect(componentScore(0, 0)).toBe(60)
    expect(Number.isNaN(componentScore(0, 0))).toBe(false)
  })

  it('lets a bonus mark exceed 100 rather than clamping it', () => {
    expect(componentScore(60, 50)).toBe(108)
  })

  it('honours a non-default transmutation', () => {
    // base 0.5 / span 0.5: half marks → 75.
    expect(componentScore(25, 50, 0.5, 0.5)).toBe(75)
  })
})

describe('termGrade — parity with the instructor spreadsheet', () => {
  it('reproduces row 3 of the Finals sheet (AD = 91.52)', () => {
    const s = sums({
      performance_task: [37.5, 50],
      quiz: [97, 100],
      recitation: [98.8, 100],
      exam: [34, 50],
    })
    expect(displayGrade(termGrade(s, POLICY))).toBe('91.52')
  })

  it('reproduces a row with no performance tasks and no exam (AD = 70.32)', () => {
    const s = sums({
      performance_task: [0, 50],
      quiz: [86, 100],
      recitation: [94.4, 100],
      exam: [0, 50],
    })
    expect(displayGrade(termGrade(s, POLICY))).toBe('70.32')
  })

  it('carries full precision — 35.58 on the exam gives 94.61, not 94.60', () => {
    const s = sums({
      performance_task: [48.25, 50],
      quiz: [97, 100],
      recitation: [98.8, 100],
      exam: [35.58, 50],
    })
    expect(displayGrade(termGrade(s, POLICY))).toBe('94.61')

    const preRounded = 98.7 * 0.6 + 88.46 * 0.4
    expect(displayGrade(preRounded)).toBe('94.60')
  })
})

describe('termGrade — structure', () => {
  it('equals class standing exactly when the exam carries no weight', () => {
    const policy: GradePolicy = { ...POLICY, csWeight: 1, examWeight: 0 }
    const s = sums({ performance_task: [40, 50], quiz: [80, 100], recitation: [92, 100] })
    expect(termGrade(s, policy)).toBeCloseTo(92, 9)
  })

  it('is null for a term that has no items in any component', () => {
    expect(termGrade(emptySums(), POLICY)).toBeNull()
  })

  it('is null when neither class standing nor the exam carries weight', () => {
    const policy: GradePolicy = { ...POLICY, csWeight: 0, examWeight: 0 }
    expect(termGrade(sums({ quiz: [80, 100] }), policy)).toBeNull()
  })
})

describe('official vs so far', () => {
  const items: GradeItemLike[] = [
    { id: 'q1', component: 'quiz', maxScore: 20, archivedAt: null },
    { id: 'q2', component: 'quiz', maxScore: 20, archivedAt: null },
  ]

  it('counts an unmarked item as zero officially, and ignores it so far', () => {
    // Full marks on the only quiz that has been marked.
    const scores = new Map([['q1', 20]])
    const s = sumsFromScores(items, scores)

    expect(s.quiz).toEqual({ sumScore: 20, sumMax: 40, sumMaxMarked: 20 })
    // official: 20/40 = 0.5 → 80.  so far: 20/20 = 1 → 100.
    expect(componentScore(s.quiz.sumScore, s.quiz.sumMax)).toBe(80)
    expect(componentScore(s.quiz.sumScore, s.quiz.sumMaxMarked)).toBe(100)
  })

  it('treats a typed zero as a mark, not as a blank', () => {
    const s = sumsFromScores(items, new Map([['q1', 0]]))
    expect(s.quiz.sumMaxMarked).toBe(20)
    expect(componentScore(s.quiz.sumScore, s.quiz.sumMaxMarked)).toBe(60)
  })

  it('leaves archived items out of both denominators', () => {
    const withArchived: GradeItemLike[] = [
      ...items,
      { id: 'q3', component: 'quiz', maxScore: 60, archivedAt: '2026-10-01T00:00:00Z' },
    ]
    const s = sumsFromScores(withArchived, new Map([['q1', 20]]))
    expect(s.quiz.sumMax).toBe(40)
  })

  it('reports nothing marked as "so far" having no answer', () => {
    const s = sumsFromScores(items, new Map())
    expect(termGrade(s, POLICY, 'soFar')).toBeNull()
    expect(termGrade(s, POLICY, 'official')).not.toBeNull()
  })
})

describe('finalGrade', () => {
  it('combines three terms at 30/30/40', () => {
    // 90*0.3 + 80*0.3 + 70*0.4 = 27 + 24 + 28 = 79
    expect(
      finalGrade([
        { grade: 90, weight: 0.3 },
        { grade: 80, weight: 0.3 },
        { grade: 70, weight: 0.4 },
      ]),
    ).toBeCloseTo(79, 10)
  })

  it('refuses to report a partial sum when a term has not happened', () => {
    const result = finalGrade([
      { grade: 99.64, weight: 0.3 },
      { grade: null, weight: 0.3 },
      { grade: 96.54, weight: 0.4 },
    ])
    expect(result).toBeNull()
    expect(result).not.toBe(68.508)
  })

  it('ignores a term that carries no weight, even with no grade', () => {
    expect(
      finalGrade([
        { grade: 90, weight: 0.5 },
        { grade: null, weight: 0 },
        { grade: 70, weight: 0.5 },
      ]),
    ).toBe(80)
  })

  it('is null when the weights do not add up, rather than renormalising', () => {
    expect(
      finalGrade([
        { grade: 90, weight: 0.3 },
        { grade: 80, weight: 0.3 },
        { grade: 70, weight: 0.37 },
      ]),
    ).toBeNull()
  })
})

describe('sumsToOne', () => {
  it('accepts the default split despite floating point', () => {
    expect(sumsToOne([0.3, 0.3, 0.4])).toBe(true)
    expect(sumsToOne([0.5, 0.25, 0.25])).toBe(true)
    expect(sumsToOne([0.1, 0.2, 0.3, 0.4])).toBe(true)
  })

  it('rejects a real shortfall', () => {
    expect(sumsToOne([0.3, 0.3, 0.37])).toBe(false)
  })
})

describe('policyError', () => {
  it('accepts the DCT default', () => {
    expect(policyError(defaultPolicy('s', 'prelim'))).toBeNull()
  })

  it('names the group that does not add up, with the real total', () => {
    const bad: GradePolicy = { ...POLICY, quizWeight: 0.3 }
    expect(policyError(bad)).toMatch(/Performance Tasks, Quizzes and Recitation/)
    expect(policyError(bad)).toMatch(/105%/)
  })

  it('rejects a weight outside 0–100%', () => {
    expect(policyError({ ...POLICY, examWeight: 1.5 })).toMatch(/between 0% and 100%/)
  })

  it('rejects a transmutation with no span', () => {
    // span 0 would make every score transmute to the same number.
    expect(policyError({ ...POLICY, transmuteSpan: 0 })).toMatch(/span/)
  })
})

describe('subjectPolicyError', () => {
  const all = (['prelim', 'midterm', 'finals'] as const).map((t) => defaultPolicy('s', t))

  it('accepts a fully configured subject', () => {
    expect(subjectPolicyError(all)).toBeNull()
  })

  it('names the missing term rather than assuming a zero share', () => {
    expect(subjectPolicyError(all.filter((p) => p.term !== 'midterm'))).toMatch(/Midterm/)
  })

  it('catches term shares that do not add up', () => {
    const skewed = all.map((p) => (p.term === 'finals' ? { ...p, finalWeight: 0.3 } : p))
    expect(subjectPolicyError(skewed)).toMatch(/Prelim, Midterm and Finals/)
  })
})

describe('orderedItems', () => {
  it('orders by component first, then position', () => {
    const items = [
      { component: 'exam' as const, position: 0, id: 'e' },
      { component: 'quiz' as const, position: 1, id: 'q2' },
      { component: 'performance_task' as const, position: 0, id: 'p' },
      { component: 'quiz' as const, position: 0, id: 'q1' },
    ]
    expect(orderedItems(items).map((i) => i.id)).toEqual(['p', 'q1', 'q2', 'e'])
  })
})

describe('displayGrade', () => {
  it('renders a dash for no grade', () => {
    expect(displayGrade(null)).toBe('-')
  })

  it('always shows two decimals', () => {
    expect(displayGrade(91.5)).toBe('91.50')
    expect(displayGrade(100)).toBe('100.00')
  })
})

describe('componentShare / weightedComponents', () => {
  it('multiplies a Class Standing part by Class Standing, and leaves the exam alone', () => {
    // 0.6 × 0.5, 0.6 × 0.25, 0.6 × 0.25, 0.4 — worked by hand.
    const p = defaultPolicy('s', 'prelim')
    expect(componentShare(p, 'performance_task')).toBeCloseTo(0.3, 10)
    expect(componentShare(p, 'quiz')).toBeCloseTo(0.15, 10)
    expect(componentShare(p, 'recitation')).toBeCloseTo(0.15, 10)
    expect(componentShare(p, 'exam')).toBe(0.4)
  })

  it('the shares of a valid policy add up to the whole term', () => {
    const p = defaultPolicy('s', 'prelim')
    const total = (['performance_task', 'quiz', 'recitation', 'exam'] as const)
      .map((c) => componentShare(p, c))
      .reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 10)
  })

  it('leaves out a zero-weight part — it cannot be "missing" from a grade it is not in', () => {
    const p = { ...defaultPolicy('s', 'prelim'), ptWeight: 0.5, quizWeight: 0.5, recitWeight: 0 }
    expect(weightedComponents(p)).toEqual(['performance_task', 'quiz', 'exam'])
  })

  it('a zero exam weight drops the exam', () => {
    const p = { ...defaultPolicy('s', 'prelim'), csWeight: 1, examWeight: 0 }
    expect(weightedComponents(p)).toEqual(['performance_task', 'quiz', 'recitation'])
  })
})

describe('completionByTerm (Era 8.0)', () => {
  const row = (term: TermKey, marked: number, max: number) => ({
    term,
    sums: {
      ...emptySums(),
      quiz: { sumScore: 0, sumMax: max, sumMaxMarked: marked },
    } as TermSums,
  })

  it('divides marked by the FULL maximum, not by what is marked', () => {
    const out = completionByTerm([row('prelim', 10, 40), row('prelim', 10, 40)])
    expect(out.prelim).toBe(25)
  })

  it('reports a term with no columns as null, not as 0%', () => {
    const out = completionByTerm([row('prelim', 10, 40)])
    expect(out.midterm).toBeNull()
    expect(out.finals).toBeNull()
  })

  it('is 0 for a term that is fully set up and entirely unmarked', () => {
    const out = completionByTerm([row('finals', 0, 50)])
    expect(out.finals).toBe(0)
  })

  it('is 100 once every cell is marked', () => {
    const out = completionByTerm([row('midterm', 30, 30), row('midterm', 30, 30)])
    expect(out.midterm).toBe(100)
  })

  it('sums across components, not just the first one', () => {
    const mixed = {
      term: 'prelim' as TermKey,
      sums: {
        performance_task: { sumScore: 0, sumMax: 100, sumMaxMarked: 0 },
        quiz: { sumScore: 0, sumMax: 100, sumMaxMarked: 100 },
        recitation: { sumScore: 0, sumMax: 0, sumMaxMarked: 0 },
        exam: { sumScore: 0, sumMax: 0, sumMaxMarked: 0 },
      } as TermSums,
    }
    expect(completionByTerm([mixed]).prelim).toBe(50)
  })

  it('answers every term for an empty roster', () => {
    const out = completionByTerm([])
    expect(out).toEqual({ prelim: null, midterm: null, finals: null })
  })
})

describe('Recitation is attendance, as-is (0063)', () => {
  it('97% attendance is a Recitation grade of 97 — no floor, no transmutation', () => {
    const sums97 = attendanceSums({ showed: 97, counted: 100 })
    expect(recitationScore(sums97, POLICY)).toBe(97)
  })

  it('zero attendance is 0, not 60 — harsher than the other parts, by choice', () => {
    expect(recitationScore(attendanceSums({ showed: 0, counted: 10 }), POLICY)).toBe(0)
    expect(componentScore(0, 10)).toBe(60)
  })

  it('reads the floor, not 0, while no class has been counted yet', () => {
    expect(recitationScore(attendanceSums({ showed: 0, counted: 0 }), POLICY)).toBe(60)
    expect(recitationScore(attendanceSums(undefined), POLICY)).toBe(60)
  })

  it('is the same under both views — attendance has no "not marked yet"', () => {
    const s = emptySums()
    s.recitation = attendanceSums({ showed: 9, counted: 10 })
    expect(componentScores(s, POLICY, 'official').recitation).toBeCloseTo(90, 9)
    expect(componentScores(s, POLICY, 'soFar').recitation).toBeCloseTo(90, 9)
  })

  it('does not make a term "started": attendance alone gives no term grade', () => {
    const s = emptySums()
    s.recitation = attendanceSums({ showed: 9, counted: 10 })
    expect(hasAnyItems(s, 'official')).toBe(false)
    expect(hasAnyItems(s, 'soFar')).toBe(false)
    expect(termGrade(s, POLICY)).toBeNull()
  })

  it('feeds Class Standing at its own weight', () => {
    const policy: GradePolicy = { ...POLICY, csWeight: 1, examWeight: 0 }
    const s = sums({ performance_task: [0, 50], quiz: [100, 100] })
    s.recitation = attendanceSums({ showed: 8, counted: 10 })
    expect(termGrade(s, policy)).toBeCloseTo(60 * 0.5 + 100 * 0.25 + 80 * 0.25, 9)
  })

  it('sumsFromScores takes Recitation from attendance and ignores leftover typed columns', () => {
    const items: GradeItemLike[] = [
      { id: 'q1', component: 'quiz', maxScore: 20, archivedAt: null },
      { id: 'r1', component: 'recitation', maxScore: 10, archivedAt: null },
    ]
    const out = sumsFromScores(
      items,
      new Map([
        ['q1', 15],
        ['r1', 10],
      ]),
      { showed: 7, counted: 8 },
    )
    expect(out.recitation).toEqual({ sumScore: 7, sumMax: 8, sumMaxMarked: 8 })
    expect(out.quiz).toEqual({ sumScore: 15, sumMax: 20, sumMaxMarked: 20 })
  })

  it('completionByTerm does not count Recitation as work left to enter', () => {
    const s = emptySums()
    s.quiz = { sumScore: 10, sumMax: 20, sumMaxMarked: 20 }
    s.recitation = attendanceSums({ showed: 5, counted: 10 })
    expect(completionByTerm([{ term: 'prelim', sums: s }]).prelim).toBe(100)
  })
})
