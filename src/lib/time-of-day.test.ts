import { describe, expect, it } from 'vitest'
import { dayPart, greetingFor } from './time-of-day'

describe('dayPart', () => {
  it('splits the day at 5, 8, 16 and 19', () => {
    expect(dayPart(4)).toBe('night')
    expect(dayPart(5)).toBe('dawn')
    expect(dayPart(7)).toBe('dawn')
    expect(dayPart(8)).toBe('day')
    expect(dayPart(15)).toBe('day')
    expect(dayPart(16)).toBe('dusk')
    expect(dayPart(18)).toBe('dusk')
    expect(dayPart(19)).toBe('night')
  })

  it('treats midnight and the small hours as night', () => {
    expect(dayPart(0)).toBe('night')
    expect(dayPart(23)).toBe('night')
  })

  it('tolerates out-of-range hours instead of returning nonsense', () => {
    expect(dayPart(24)).toBe('night')
    expect(dayPart(-1)).toBe('night')
    expect(dayPart(29)).toBe('dawn')
  })
})

describe('greetingFor', () => {
  it('uses the right Filipino greeting', () => {
    expect(greetingFor(9)).toBe('Magandang umaga')
    expect(greetingFor(12)).toBe('Magandang tanghali')
    expect(greetingFor(15)).toBe('Magandang hapon')
    expect(greetingFor(21)).toBe('Magandang gabi')
    expect(greetingFor(2)).toBe('Magandang gabi')
  })
})
