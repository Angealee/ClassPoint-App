import { describe, expect, it } from 'vitest'
import { homeMessage } from './home-message'

describe('homeMessage', () => {
  it('rank outranks everything else, best first', () => {
    expect(homeMessage({ rank: 1, streak: 9, part: 'day' })).toMatch(/#1/)
    expect(homeMessage({ rank: 3, streak: 9, part: 'day' })).toMatch(/podium/)
    expect(homeMessage({ rank: 10, streak: 9, part: 'day' })).toMatch(/Top 10/)
  })

  it('falls to the streak once you are outside the top 10', () => {
    expect(homeMessage({ rank: 11, streak: 3, part: 'day' })).toBe('3 classes in a row. Ayos!')
    expect(homeMessage({ rank: null, streak: 5, part: 'night' })).toBe('5 classes in a row. Ayos!')
  })

  it('a streak of 1 or 2 is not worth a headline', () => {
    expect(homeMessage({ rank: null, streak: 2, part: 'day' })).not.toMatch(/in a row/)
    expect(homeMessage({ rank: null, streak: null, part: 'day' })).not.toMatch(/in a row/)
  })

  it('has a tagline for every part of the day', () => {
    for (const part of ['dawn', 'day', 'dusk', 'night'] as const) {
      expect(homeMessage({ rank: null, streak: 0, part }).length).toBeGreaterThan(5)
    }
  })

  it('contains no em dash', () => {
    for (const part of ['dawn', 'day', 'dusk', 'night'] as const) {
      expect(homeMessage({ rank: 50, streak: 0, part })).not.toContain('—')
    }
  })
})
