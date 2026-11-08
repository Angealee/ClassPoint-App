import { describe, expect, it } from 'vitest'
import { boostGain, boostState, boostTermsError, formatMarks, round2 } from './grade-boost'
import type { MyGradeItem } from './types'

/**
 * `request_grade_boost` (0062) is the authority; `boostState` is its preview.
 * Every branch below corresponds to an exception the SQL raises, so a drift
 * between the two shows up here rather than as a button that always fails.
 *
 * THE ONE THAT MATTERS IS THE CAP. The instructor chose "cap at max and show
 * the real gain first": a student at 17/20 offered +10 gains 3, not 10, and the
 * screen must say 3 BEFORE they confirm — telling them 10 and delivering 3 is
 * the specific thing this rule exists to prevent.
 */

function item(over: Partial<MyGradeItem> = {}): MyGradeItem {
  return {
    id: 'i1',
    term: 'prelim',
    component: 'quiz',
    name: 'Quiz 1',
    maxScore: 20,
    position: 0,
    score: 12,
    pointsCost: 5,
    pointsBonus: 4,
    boost: null,
    pending: false,
    ...over,
  }
}

describe('boostGain', () => {
  it('adds the whole bonus when there is room', () => {
    expect(boostGain(12, 20, 4)).toBe(4)
  })

  it('caps at the maximum — 17/20 plus 10 gains 3, not 10', () => {
    expect(boostGain(17, 20, 10)).toBe(3)
  })

  it('gains nothing at full marks', () => {
    expect(boostGain(20, 20, 4)).toBe(0)
  })

  it('never goes negative for a mark typed above the maximum', () => {
    // Extra credit the instructor chose to allow: the boost must not TAKE marks.
    expect(boostGain(22, 20, 4)).toBe(0)
  })

  it('gains nothing when there is no mark to add to', () => {
    expect(boostGain(null, 20, 4)).toBe(0)
  })

  it('does not leak floating point onto the screen', () => {
    // 12.1 + 0.2 is 12.299999999999999 in JavaScript.
    expect(boostGain(12.1, 20, 0.2)).toBe(0.2)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})

describe('formatMarks', () => {
  it('prints a mark the way a person writes it', () => {
    expect(formatMarks(12)).toBe('12')
    expect(formatMarks(12.5)).toBe('12.5')
    expect(formatMarks(12.25)).toBe('12.25')
    expect(formatMarks(12.299999999999999)).toBe('12.3')
    expect(formatMarks(0)).toBe('0')
  })
})

describe('boostState', () => {
  it('offers a boost with the real gain and the resulting mark', () => {
    expect(boostState(item({ score: 17, pointsBonus: 10, pointsCost: 5 }))).toEqual({
      kind: 'available',
      cost: 5,
      bonus: 10,
      gain: 3,
      newScore: 20,
      score: 17,
    })
  })

  it('is not offered when the instructor has not set terms', () => {
    expect(boostState(item({ pointsCost: null, pointsBonus: null }))).toEqual({
      kind: 'not-offered',
    })
  })

  it('says "unmarked" — not "not offered" — when the mark is not in yet', () => {
    // Different reasons, different sentences: one is "nothing to do here", the
    // other is "come back once your instructor has marked it".
    expect(boostState(item({ score: null }))).toEqual({ kind: 'unmarked', cost: 5, bonus: 4 })
  })

  it('says "full" at the maximum, and above it', () => {
    expect(boostState(item({ score: 20 }))).toEqual({ kind: 'full' })
    expect(boostState(item({ score: 21 }))).toEqual({ kind: 'full' })
  })

  it('treats a pending request as pending, even with the terms removed since', () => {
    expect(boostState(item({ pending: true, pointsCost: null, pointsBonus: null }))).toEqual({
      kind: 'pending',
    })
  })

  it('keeps showing a receipt after the instructor removes the terms', () => {
    // The receipt is history, not an offer. Hiding it would make the column look
    // as though the points had never been spent.
    const s = boostState(
      item({
        pointsCost: null,
        pointsBonus: null,
        boost: { marks: 3, points: 5, before: 17 },
      }),
    )
    expect(s).toEqual({ kind: 'boosted', marks: 3, points: 5, before: 17 })
  })

  it('shows boosted over pending and over full marks', () => {
    // After a boost the mark is often AT the maximum, and "full" must not win.
    const s = boostState(
      item({ score: 20, pending: true, boost: { marks: 3, points: 5, before: 17 } }),
    )
    expect(s.kind).toBe('boosted')
  })
})

describe('boostTermsError', () => {
  it('accepts both blank (not offered)', () => {
    expect(boostTermsError(null, null, 20)).toBeNull()
  })

  it('refuses one half — the table CHECKs both-or-neither', () => {
    expect(boostTermsError(5, null, 20)).toMatch(/both/i)
    expect(boostTermsError(null, 4, 20)).toMatch(/both/i)
  })

  it('keeps the cost inside what a request may be (1 to 50, whole)', () => {
    expect(boostTermsError(0, 4, 20)).not.toBeNull()
    expect(boostTermsError(51, 4, 20)).not.toBeNull()
    expect(boostTermsError(2.5, 4, 20)).not.toBeNull()
    expect(boostTermsError(50, 4, 20)).toBeNull()
  })

  it('refuses a bonus that is zero or larger than the column', () => {
    expect(boostTermsError(5, 0, 20)).not.toBeNull()
    expect(boostTermsError(5, 21, 20)).not.toBeNull()
    expect(boostTermsError(5, 20, 20)).toBeNull()
  })
})
