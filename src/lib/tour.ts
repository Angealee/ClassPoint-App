/**
 * Which of a student's first app opens get the tour, and whether it can be
 * skipped.
 *
 * Pure on purpose, with the two stores INJECTED rather than reached for: the
 * failure modes here are all silent — a tour that never shows looks the same as
 * one nobody needed, and a tour that nags forever looks like a feature — so the
 * counting has to be provable without a browser.
 *
 * ── THE RULES (the instructor's call, 2026-11-08) ───────────────────────────
 *   · The tour plays on each of a student's FIRST THREE app opens, from the
 *     start every time. It does not resume and it does not stop early because
 *     they finished it.
 *   · Open 1 has NO Skip. Opens 2 and 3 do.
 *   · After open 3 it never appears again.
 *
 * ── "AN OPEN" IS A SESSION, NOT A MOUNT ─────────────────────────────────────
 * `AppLayout` mounts again after a sign-out and sign-in, and React's StrictMode
 * mounts everything twice in development. Counting mounts would burn all three
 * plays in one sitting. So the count is incremented at most once per BROWSER
 * SESSION — `sessionStorage` is cleared when the tab or the installed PWA's
 * webview closes, which is what "opening the app" means on a phone — and a flag
 * in that same store records that this session already played it.
 *
 * ── KEYED BY STUDENT, ON PURPOSE ────────────────────────────────────────────
 * Every key carries the student id. A shared phone must not hand one student's
 * three plays to the next (the `cp_seen_level_${studentId}` and
 * `cp_peer_draft_${studentId}` precedent).
 *
 * ── FAIL SAFE IS "DON'T SHOW" ───────────────────────────────────────────────
 * If storage throws, or holds something unreadable, the answer is NO TOUR. The
 * opposite default would show it on every open forever for anyone whose browser
 * blocks storage — and a tour you cannot dismiss permanently is worse than one
 * somebody never saw.
 */

/** How many opens get the tour. */
export const TOUR_OPENS = 3

/** The one thing the tour needs from a Storage, so a test can hand it a Map. */
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

/**
 * Count this open (once per session) and say whether to play the tour.
 *
 * Safe to call repeatedly within one session: the second call finds the session
 * flag and returns the same answer without counting again. That idempotence is
 * what lets a lazy `useState` initialiser call it — React runs initialisers
 * twice under StrictMode.
 *
 * `legacyOnboarded` is the old `cp_onboarded` flag. A student who already got
 * the previous intro has used the app for a semester and is not shown a
 * beginner's tour; their count is set to the maximum so it never starts.
 */
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
      // Digits only. `Number('')` is 0 and `Number(' ')` is 0, so a bare
      // Number() check reads an EMPTY stored value as a valid fresh start —
      // which is the one corruption this guard exists to refuse. Unreadable is
      // treated as "already had it", never as "start again".
      stored = /^\d+$/.test(raw) ? Number(raw) : TOUR_OPENS
    }

    // Played and dismissed earlier in THIS session: not again.
    if (state === 'done') return { ...NONE, opens: stored ?? 0 }

    // Already counted this session (a remount, or StrictMode's second pass):
    // answer from the stored count without incrementing.
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

/** Mark this session's play as finished, so a remount does not replay it. */
export function endTour(session: TourStore, studentId: string): void {
  try {
    session.setItem(sessionKey(studentId), 'done')
  } catch {
    /* a blocked store costs a replay on remount, never the screen */
  }
}
