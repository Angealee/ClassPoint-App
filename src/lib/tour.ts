
/** How many opens get the tour. */
export const TOUR_OPENS = 3

export interface TourStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface TourSession {
  /** Play the tour now. */
  show: boolean
  /** Which open this is, 1-based. 0 when the answer is "unknown". */
  opens: number
  /** Opens 2 and 3 can be skipped; open 1 cannot. */
  skippable: boolean
}

const NONE: TourSession = { show: false, opens: 0, skippable: false }

export const opensKey = (studentId: string) => `cp_tour_v1_${studentId}`
export const sessionKey = (studentId: string) => `cp_tour_session_v1_${studentId}`

function within(opens: number): TourSession {
  const show = opens >= 1 && opens <= TOUR_OPENS
  return { show, opens, skippable: show && opens >= 2 }
}

export function beginTour(
  local: TourStore,
  session: TourStore,
  studentId: string,
  legacyOnboarded: boolean,
): TourSession {
  try {
    const state = session.getItem(sessionKey(studentId))
    const raw = local.getItem(opensKey(studentId))

    let stored: number | null = null
    if (raw !== null) {
      stored = /^\d+$/.test(raw) ? Number(raw) : TOUR_OPENS
    }

    // Played and dismissed earlier in THIS session: not again.
    if (state === 'done') return { ...NONE, opens: stored ?? 0 }

    if (state === 'open') return within(stored ?? 0)

    if (stored === null && legacyOnboarded) {
      local.setItem(opensKey(studentId), String(TOUR_OPENS))
      return { ...NONE, opens: TOUR_OPENS }
    }

    const opens = (stored ?? 0) + 1
    local.setItem(opensKey(studentId), String(opens))
    session.setItem(sessionKey(studentId), 'open')
    return within(opens)
  } catch {
    return NONE
  }
}

export function endTour(session: TourStore, studentId: string): void {
  try {
    session.setItem(sessionKey(studentId), 'done')
  } catch {
    /* a blocked store costs a replay on remount, never the screen */
  }
}
