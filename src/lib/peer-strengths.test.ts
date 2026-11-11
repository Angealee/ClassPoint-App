import { describe, expect, it } from 'vitest'
import { joinLabels, strengthsOf } from './peer-strengths'

describe('strengthsOf', () => {
  it('names the highest and lowest question', () => {
    expect(
      strengthsOf([
        { label: 'Effort', pct: 90 },
        { label: 'Communication', pct: 40 },
        { label: 'Ideas', pct: 70 },
      ]),
    ).toEqual({ strongest: ['Effort'], roomToGrow: ['Communication'] })
  })

  it('says nothing with a single question, since there is nothing to compare', () => {
    expect(strengthsOf([{ label: 'Effort', pct: 90 }])).toBeNull()
  })

  it('says nothing when every question scored the same', () => {
    expect(
      strengthsOf([
        { label: 'Effort', pct: 75 },
        { label: 'Ideas', pct: 75 },
      ]),
    ).toBeNull()
  })

  it('treats a difference smaller than the SQL rounding as a tie', () => {
    expect(
      strengthsOf([
        { label: 'Effort', pct: 80 },
        { label: 'Ideas', pct: 80.04 },
      ]),
    ).toBeNull()
  })

  it('names tied questions together instead of choosing one', () => {
    expect(
      strengthsOf([
        { label: 'Effort', pct: 90 },
        { label: 'Ideas', pct: 90 },
        { label: 'Communication', pct: 30 },
      ]),
    ).toEqual({ strongest: ['Effort', 'Ideas'], roomToGrow: ['Communication'] })
  })

  it('compares percentages, so mixed scales are comparable', () => {
    expect(
      strengthsOf([
        { label: 'Quality', pct: 75 },
        { label: 'Showed up', pct: 90 },
      ]),
    ).toEqual({ strongest: ['Showed up'], roomToGrow: ['Quality'] })
  })

  it('ignores a non-numeric percentage rather than letting it win', () => {
    expect(
      strengthsOf([
        { label: 'Effort', pct: Number.NaN },
        { label: 'Ideas', pct: 60 },
      ]),
    ).toBeNull()
  })
})

describe('joinLabels', () => {
  it('joins one, two and three labels in plain English', () => {
    expect(joinLabels(['Effort'])).toBe('Effort')
    expect(joinLabels(['Effort', 'Ideas'])).toBe('Effort and Ideas')
    expect(joinLabels(['Effort', 'Ideas', 'Teamwork'])).toBe('Effort, Ideas and Teamwork')
  })
})
