import { describe, expect, it } from 'vitest'
import {
  componentScore,
  defaultPolicy,
  displayGrade,
  emptySums,
  finalGrade,
  orderedItems,
  policyError,
  subjectPolicyError,
  sumsFromScores,
  sumsToOne,
  termGrade,
  type GradeItemLike,
} from './grading'
import type { GradeComponent, GradePolicy, TermSums } from './types'

/**
 * Pins the grade computation against the instructor's real spreadsheet.
 *
 * THE LOAD-BEARING TEST IS "carries full precision" BELOW. Excel computes every
 * intermediate at full precision and rounds only for display: the exam 35.58/50
 * transmutes to 88.464, shown as 88.46, and the term grade 94.61 is reachable
 * ONLY from 88.464 — rounding that component first gives 94.60. If a future
 * change rounds early, every grade in the app drifts a hundredth away from the
 * sheet the instructor has been submitting for years, which is exactly the kind
 * of error nobody notices until someone recomputes by hand.
 *
 * The second one worth knowing about is `finalGrade` returning null for a term
 * that has not happened. The live spreadsheet reads 68.508 for a student with a
 * 99.64 prelim and a 96.54 finals, purely because the Midterms column is empty —
 * a number that looks exactly like a grade. Removing that is the reason this
 * feature exists, so the test asserts the result is null AND specifically not
 * 68.508.
 */

const POLICY: GradePolicy = defaultPolicy('subject-1', 'finals')

/** Build a term's sums where every item is marked — the finished-term case. */
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
    // (0/50 * 0.4 + 0.6) * 100. The base-60 transmutation means the lowest
    // possible grade in this system is 60, not 0.
    expect(componentScore(0, 50)).toBe(60)
  })

  it('tops out at 100 on a perfect score', () => {
    expect(componentScore(50, 50)).toBe(100)
  })

  it('returns the floor rather than NaN when the component has no items', () => {
    // The instructor's call: an empty component counts. Excel answers #DIV/0!
    // here, so there is no behaviour to be faithful to — but NaN would leak
    // through every sum above it and render as "NaN" on a grade sheet.
    expect(componentScore(0, 0)).toBe(60)
    expect(Number.isNaN(componentScore(0, 0))).toBe(false)
  })

  it('lets a bonus mark exceed 100 rather than clamping it', () => {
    // 60/50 = 1.2 → (1.2 * 0.4 + 0.6) * 100 = 108. A clamped typo — 95 entered
    // on a /50 item — would read as a plausible 100 and never be questioned.
    expect(componentScore(60, 50)).toBe(108)
  })

  it('honours a non-default transmutation', () => {
    // base 0.5 / span 0.5: half marks → 75.
    expect(componentScore(25, 50, 0.5, 0.5)).toBe(75)
  })
})

describe('termGrade — parity with the instructor spreadsheet', () => {
  it('reproduces row 3 of the Finals sheet (AD = 91.52)', () => {
    // PT 37.5/50 → 90.00 · Quiz 97/100 → 98.80 · Recitation 97/100 → 98.80
    // CS = 90*0.5 + 98.8*0.25 + 98.8*0.25 = 94.40
    // Exam 34/50 → 87.20 · Term = 94.40*0.6 + 87.20*0.4 = 91.52
    const s = sums({
      performance_task: [37.5, 50],
      quiz: [97, 100],
      recitation: [97, 100],
      exam: [34, 50],
    })
    expect(displayGrade(termGrade(s, POLICY))).toBe('91.52')
  })

  it('reproduces a row with no performance tasks and no exam (AD = 70.32)', () => {
    // Blanks score zero against a real total: PT 0/50 → 60.00, exam 0/50 → 60.00.
    // CS = 60*0.5 + 94.40*0.25 + 94.40*0.25 = 77.20
    // Term = 77.20*0.6 + 60*0.4 = 70.32
    const s = sums({
      performance_task: [0, 50],
      quiz: [86, 100],
      recitation: [86, 100],
      exam: [0, 50],
    })
    expect(displayGrade(termGrade(s, POLICY))).toBe('70.32')
  })

  it('carries full precision — 35.58 on the exam gives 94.61, not 94.60', () => {
    // THE LOAD-BEARING TEST. Exam 35.58/50 → 88.464, which the sheet DISPLAYS
    // as 88.46. PT is 48.25 (displayed 48.3) → 98.60; CS = 98.70.
    //   full precision : 98.70*0.6 + 88.464*0.4 = 94.6056 → 94.61
    //   rounded first  : 98.70*0.6 + 88.46 *0.4 = 94.604  → 94.60
    const s = sums({
      performance_task: [48.25, 50],
      quiz: [97, 100],
      recitation: [97, 100],
      exam: [35.58, 50],
    })
    expect(displayGrade(termGrade(s, POLICY))).toBe('94.61')

    // And pin the wrong answer too, so "round once" cannot be quietly undone.
    const preRounded = 98.7 * 0.6 + 88.46 * 0.4
    expect(displayGrade(preRounded)).toBe('94.60')
  })
})

describe('termGrade — structure', () => {
  it('equals class standing exactly when the exam carries no weight', () => {
    // PT 40/50 → 92 · Quiz 80/100 → 92 · Recitation 80/100 → 92 ⇒ CS = 92.
    const policy: GradePolicy = { ...POLICY, csWeight: 1, examWeight: 0 }
    const s = sums({ performance_task: [40, 50], quiz: [80, 100], recitation: [80, 100] })
    expect(termGrade(s, policy)).toBe(92)
  })

  it('is null for a term that has no items in any component', () => {
    // Not a confident 60.00: a term nobody has started describes nothing, and a
    // real-looking number there is worse than a dash.
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
    // This is the one habit change from Excel, and the whole "so far" view
    // depends on it: a student who sat the quiz and got nothing is not the same
    // as a student whose quiz has not been marked.
    const s = sumsFromScores(items, new Map([['q1', 0]]))
    expect(s.quiz.sumMaxMarked).toBe(20)
    expect(componentScore(s.quiz.sumScore, s.quiz.sumMaxMarked)).toBe(60)
  })

  it('leaves archived items out of both denominators', () => {
    // Archiving an item rescales the class — the same magnitude as a weight
    // change — so the aggregate RPC must apply this identical filter.
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
    // Officially the term HAS started, so it still produces a grade.
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
    // The spreadsheet bug this feature exists to remove: it shows 68.508 here.
    const result = finalGrade([
      { grade: 99.64, weight: 0.3 },
      { grade: null, weight: 0.3 },
      { grade: 96.54, weight: 0.4 },
    ])
    expect(result).toBeNull()
    expect(result).not.toBe(68.508)
  })

  it('ignores a term that carries no weight, even with no grade', () => {
    // 50*0 contributes nothing, so a missing grade there cannot matter.
    expect(
      finalGrade([
        { grade: 90, weight: 0.5 },
        { grade: null, weight: 0 },
        { grade: 70, weight: 0.5 },
      ]),
    ).toBe(80)
  })

  it('is null when the weights do not add up, rather than renormalising', () => {
    // A misconfigured policy must be visible. Silently scaling 0.97 up to 1
    // would hand back a plausible grade from a broken setup.
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
    // A missing row is ambiguous, and defaulting its share to 0 would silently
    // compute a final grade out of 70%.
    expect(subjectPolicyError(all.filter((p) => p.term !== 'midterm'))).toMatch(/Midterm/)
  })

  it('catches term shares that do not add up', () => {
    const skewed = all.map((p) => (p.term === 'finals' ? { ...p, finalWeight: 0.3 } : p))
    expect(subjectPolicyError(skewed)).toMatch(/Prelim, Midterm and Finals/)
  })
})

describe('orderedItems', () => {
  it('orders by component first, then position', () => {
    // One definition of column order, so the grid, the export and the printed
    // sheet cannot disagree about which column is "Quiz 2".
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
    expect(displayGrade(null)).toBe('—')
  })

  it('always shows two decimals', () => {
    expect(displayGrade(91.5)).toBe('91.50')
    expect(displayGrade(100)).toBe('100.00')
  })
})
