import { describe, expect, it } from 'vitest'
import { REVEAL_PLAYS, revealKey, takeReveal, type RevealStore } from './reveal-budget'

function memory(seed: Record<string, string> = {}): RevealStore & { data: Record<string, string> } {
  const data = { ...seed }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v
    },
  }
}

describe('takeReveal', () => {
  it('plays on the first three opens and then stops', () => {
    const store = memory()
    const plays = Array.from({ length: 6 }, () => takeReveal(store, 'ana'))
    expect(plays).toEqual([true, true, true, false, false, false])
    expect(REVEAL_PLAYS).toBe(3)
  })

  it('keeps each student separate (a shared phone)', () => {
    const store = memory()
    for (let i = 0; i < 3; i++) takeReveal(store, 'ana')
    expect(takeReveal(store, 'ana')).toBe(false)
    expect(takeReveal(store, 'ben')).toBe(true)
  })

  it('does not spend a play it did not give', () => {
    const store = memory()
    for (let i = 0; i < 5; i++) takeReveal(store, 'ana')
    expect(store.data[revealKey('ana')]).toBe('3')
  })

  it('treats a corrupted value as spent, not as a fresh start', () => {
    // Number('') is 0, so a naive parse would replay the reveal forever on an empty value.
    for (const bad of ['', 'abc', '-1', '2.5', 'NaN']) {
      expect(takeReveal(memory({ [revealKey('ana')]: bad }), 'ana'), `"${bad}"`).toBe(false)
    }
  })

  it('fails safe: a storage that throws means do not play', () => {
    const broken: RevealStore = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(takeReveal(broken, 'ana')).toBe(false)
  })

  it('fails safe when it can read but not write', () => {
    const readOnly: RevealStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(takeReveal(readOnly, 'ana')).toBe(false)
  })
})
