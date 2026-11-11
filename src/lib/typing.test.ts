import { describe, expect, it } from 'vitest'
import {
  TYPING_THROTTLE_MS,
  TYPING_TIMEOUT_MS,
  activeTypers,
  noteTyping,
  shouldBroadcast,
  typingLabel,
  type TypingEntry,
} from './typing'

const T0 = 1_000_000

describe('noteTyping', () => {
  it('adds someone', () => {
    expect(noteTyping([], 'Ana', T0)).toEqual([{ name: 'Ana', at: T0 }])
  })

  it('REPLACES rather than duplicating on every keystroke', () => {
    let s: TypingEntry[] = []
    s = noteTyping(s, 'Ana', T0)
    s = noteTyping(s, 'Ana', T0 + 100)
    s = noteTyping(s, 'Ana', T0 + 200)
    expect(s).toEqual([{ name: 'Ana', at: T0 + 200 }])
  })

  it('keeps other people', () => {
    const s = noteTyping(noteTyping([], 'Ana', T0), 'Bea', T0 + 10)
    expect(s.map((e) => e.name).sort()).toEqual(['Ana', 'Bea'])
  })
})

describe('activeTypers', () => {
  it('drops anyone gone stale', () => {
    const s = [
      { name: 'Ana', at: T0 },
      { name: 'Bea', at: T0 - TYPING_TIMEOUT_MS - 1 },
    ]
    expect(activeTypers(s, T0).map((e) => e.name)).toEqual(['Ana'])
  })

  it('treats the exact timeout as stale', () => {
    const s = [{ name: 'Ana', at: T0 - TYPING_TIMEOUT_MS }]
    expect(activeTypers(s, T0)).toEqual([])
  })
})

describe('typingLabel', () => {
  const at = (name: string) => ({ name, at: T0 })

  it('is null when nobody is typing', () => {
    expect(typingLabel([], T0)).toBeNull()
    expect(typingLabel([{ name: 'Ana', at: T0 - 99_999 }], T0)).toBeNull()
  })

  it('names one and two people', () => {
    expect(typingLabel([at('Ana')], T0)).toBe('Ana is typing…')
    expect(typingLabel([at('Ana'), at('Bea')], T0)).toBe('Ana and Bea are typing…')
  })

  it('caps at two names then counts, so it stays one line', () => {
    const many = ['Ana', 'Bea', 'Cel', 'Dan', 'Eli', 'Fay'].map(at)
    expect(typingLabel(many, T0)).toBe('Ana, Bea and 4 others are typing…')
  })
})

describe('shouldBroadcast', () => {
  it('always sends the first one', () => {
    expect(shouldBroadcast(null, T0)).toBe(true)
  })

  it('throttles', () => {
    expect(shouldBroadcast(T0, T0 + 1)).toBe(false)
    expect(shouldBroadcast(T0, T0 + TYPING_THROTTLE_MS - 1)).toBe(false)
    expect(shouldBroadcast(T0, T0 + TYPING_THROTTLE_MS)).toBe(true)
  })

  it('re-broadcasts before the receiver times out', () => {
    expect(TYPING_THROTTLE_MS).toBeLessThan(TYPING_TIMEOUT_MS)
  })
})
