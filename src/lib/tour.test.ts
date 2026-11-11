import { describe, expect, it } from 'vitest'
import { TOUR_OPENS, beginTour, endTour, opensKey, sessionKey, type TourStore } from './tour'

/**
 * A Map-backed store. `session` is recreated per simulated app open, which is
 * exactly what closing and reopening the installed PWA does to sessionStorage;
 * `local` survives across them.
 */
function store(): TourStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

const throwing: TourStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('which opens get the tour', () => {
  it('plays on the first three opens and then never again', () => {
    const local = store()
    const seen: boolean[] = []
    for (let open = 1; open <= 5; open += 1) {
      // A fresh sessionStorage each time: a new app open.
      seen.push(beginTour(local, store(), 'a', false).show)
    }
    expect(seen).toEqual([true, true, true, false, false])
    expect(TOUR_OPENS).toBe(3)
  })

  it('cannot be skipped on open 1, and can on opens 2 and 3', () => {
    // The instructor's rule, and the easy one to get backwards: a first-time
    // student is the one person who must see it.
    const local = store()
    const skippable = [1, 2, 3].map((n) => ({
      n,
      s: beginTour(local, store(), 'a', false).skippable,
    }))
    expect(skippable).toEqual([
      { n: 1, s: false },
      { n: 2, s: true },
      { n: 3, s: true },
    ])
  })

  it('does not stop early because the student finished it', () => {
    // Replay from the start on each of the three — finishing open 1 must not
    // end open 2.
    const local = store()
    const first = store()
    expect(beginTour(local, first, 'a', false).show).toBe(true)
    endTour(first, 'a')
    expect(beginTour(local, store(), 'a', false).show).toBe(true)
  })
})

describe('an open is a session, not a mount', () => {
  it('counts once however many times it is called in one session', () => {
    // StrictMode runs a lazy initialiser twice, and a sign-out/sign-in remounts
    // the layout. Counting mounts would spend all three plays in one sitting.
    const local = store()
    const session = store()
    for (let i = 0; i < 6; i += 1) beginTour(local, session, 'a', false)
    expect(local.map.get(opensKey('a'))).toBe('1')
  })

  it('keeps showing for a remount BEFORE it is dismissed', () => {
    const local = store()
    const session = store()
    expect(beginTour(local, session, 'a', false).show).toBe(true)
    expect(beginTour(local, session, 'a', false).show).toBe(true)
  })

  it('does not replay within a session once it has been dismissed', () => {
    const local = store()
    const session = store()
    beginTour(local, session, 'a', false)
    endTour(session, 'a')
    expect(beginTour(local, session, 'a', false).show).toBe(false)
    expect(session.map.get(sessionKey('a'))).toBe('done')
  })
})

describe('students do not share plays', () => {
  it('keys everything by student id, so a shared phone starts each one fresh', () => {
    const local = store()
    expect(beginTour(local, store(), 'a', false).opens).toBe(1)
    expect(beginTour(local, store(), 'a', false).opens).toBe(2)
    // A different student on the same device is on their FIRST open.
    const b = beginTour(local, store(), 'b', false)
    expect(b.opens).toBe(1)
    expect(b.skippable).toBe(false)
  })
})

describe('existing students', () => {
  it('never shows a beginner tour to someone who got the old intro', () => {
    const local = store()
    expect(beginTour(local, store(), 'a', true).show).toBe(false)
    expect(local.map.get(opensKey('a'))).toBe(String(TOUR_OPENS))
    // And it stays that way on every later open.
    expect(beginTour(local, store(), 'a', true).show).toBe(false)
    expect(beginTour(local, store(), 'a', false).show).toBe(false)
  })

  it('ignores the legacy flag once a count exists', () => {
    // A new student mid-tour must not be cut short because the old key is set.
    const local = store()
    beginTour(local, store(), 'a', false)
    expect(beginTour(local, store(), 'a', true).show).toBe(true)
  })
})

describe('fail safe is "do not show"', () => {
  it('shows nothing when storage throws', () => {
    // The opposite default shows it on EVERY open forever for anyone whose
    // browser blocks storage — a tour you can never dismiss for good.
    expect(beginTour(throwing, throwing, 'a', false).show).toBe(false)
  })

  it('shows nothing when it cannot WRITE the count', () => {
    const readOnly: TourStore = { getItem: () => null, setItem: throwing.setItem }
    expect(beginTour(readOnly, store(), 'a', false).show).toBe(false)
  })

  it('treats an unreadable count as already played, not as a fresh start', () => {
    for (const bad of ['banana', '-2', '1.5', 'NaN', '']) {
      const local = store()
      local.map.set(opensKey('a'), bad)
      expect(beginTour(local, store(), 'a', false).show, `value ${JSON.stringify(bad)}`).toBe(
        false,
      )
    }
  })

  it('survives a throwing endTour', () => {
    expect(() => endTour(throwing, 'a')).not.toThrow()
  })
})
