import { describe, expect, it } from 'vitest'
import {
  boostGain,
  boostState,
  formatMarks,
  maxPointsFor,
  pointsGain,
  round2,
} from './grade-boost'
import type { MyGradeItem } from './types'

function item(over: Partial<MyGradeItem> = {}): MyGradeItem {
  return {
    id: 'i1',
    term: 'prelim',
    component: 'quiz',
    name: 'Quiz 1',
    maxScore: 20,
    position: 0,
    score: 12,
    offered: true,
    absent: false,
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

describe('maxPointsFor — the most a student may use (mirror of request_grade_boost, 0064)', () => {
  it('is the marks still missing: 17/20 may use at most 3', () => {
    expect(maxPointsFor(17, 20)).toBe(3)
  })

  it('rounds UP to a whole point: 17.5/20 may use 3 (points are whole numbers)', () => {
    expect(maxPointsFor(17.5, 20)).toBe(3)
    expect(maxPointsFor(19.5, 20)).toBe(1)
  })

  it('is never more than the 50 a single request may be', () => {
    expect(maxPointsFor(0, 100)).toBe(50)
    expect(maxPointsFor(50, 100)).toBe(50)
    expect(maxPointsFor(51, 100)).toBe(49)
  })

  it('is zero at or past the maximum — nothing to gain', () => {
    expect(maxPointsFor(20, 20)).toBe(0)
    expect(maxPointsFor(22, 20)).toBe(0)
  })

  it('does not round a floating point sliver up into an extra point', () => {
    expect(maxPointsFor(17.00000000001, 20)).toBe(3)
  })
})

describe('pointsGain — what N points really add (1 point = 1 mark, capped)', () => {
  it('adds one mark per point when there is room', () => {
    expect(pointsGain(3, 12, 20)).toBe(3)
  })

  it('NEVER passes the maximum: a mark of 17.5 on /20 gains 2.5 from 3 points', () => {
    expect(pointsGain(3, 17.5, 20)).toBe(2.5)
    expect(17.5 + pointsGain(3, 17.5, 20)).toBe(20)
  })

  it('caps a request that overshoots (a stale screen cannot push past the maximum)', () => {
    expect(pointsGain(10, 17, 20)).toBe(3)
  })

  it('is zero at the maximum and never negative above it', () => {
    expect(pointsGain(5, 20, 20)).toBe(0)
    expect(pointsGain(5, 22, 20)).toBe(0)
  })
})

describe('boostState', () => {
  it('offers the column with the marks missing and the most points usable', () => {
    expect(boostState(item({ score: 17 }))).toEqual({
      kind: 'available',
      score: 17,
      gap: 3,
      maxPoints: 3,
    })
  })

  it('needs NO setup from the instructor: a marked column below its max is simply open', () => {
    expect(boostState(item()).kind).toBe('available')
  })

  it('is not offered only when the instructor switched the column off', () => {
    expect(boostState(item({ offered: false }))).toEqual({ kind: 'not-offered' })
  })

  it('says "unmarked" — not "not offered" — when the mark is not in yet', () => {
    expect(boostState(item({ score: null }))).toEqual({ kind: 'unmarked' })
  })

  it('says "full" at the maximum, and above it', () => {
    expect(boostState(item({ score: 20 }))).toEqual({ kind: 'full' })
    expect(boostState(item({ score: 21 }))).toEqual({ kind: 'full' })
  })

  it('treats a pending request as pending, even if the column is switched off since', () => {
    expect(boostState(item({ pending: true, offered: false }))).toEqual({ kind: 'pending' })
  })

  it('keeps showing a receipt after the column is switched off', () => {
    const s = boostState(item({ offered: false, boost: { marks: 3, points: 3, before: 17 } }))
    expect(s).toEqual({ kind: 'boosted', marks: 3, points: 3, before: 17 })
  })

  it('shows boosted over pending and over full marks', () => {
    const s = boostState(
      item({ score: 20, pending: true, boost: { marks: 3, points: 3, before: 17 } }),
    )
    expect(s.kind).toBe('boosted')
  })
})

describe('boostState — absent (0063, unchanged by 0064)', () => {
  it('refuses an absent student even with a mark typed — a 0 for an absentee is not eligible', () => {
    expect(boostState(item({ absent: true, score: 0 })).kind).toBe('absent')
    expect(boostState(item({ absent: true, score: 12 })).kind).toBe('absent')
  })

  it('says absent rather than “your mark isn’t in yet” for an absent student with no mark', () => {
    // Waiting would be the wrong advice: no mark is coming.
    expect(boostState(item({ absent: true, score: null })).kind).toBe('absent')
  })

  it('lets everyone else through: a mark, room to gain, not absent', () => {
    expect(boostState(item({ absent: false })).kind).toBe('available')
  })

  it('keeps the receipt and the waiting request ahead of absent — those are history', () => {
    expect(
      boostState(item({ absent: true, boost: { marks: 3, points: 3, before: 12 } })).kind,
    ).toBe('boosted')
    expect(boostState(item({ absent: true, pending: true })).kind).toBe('pending')
  })

  it('is not offered before it is absent — a switched-off column stays quiet', () => {
    expect(boostState(item({ absent: true, offered: false })).kind).toBe('not-offered')
  })
})
