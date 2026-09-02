import type { ToneName } from '@/lib/tone'

/**
 * How Student Space presents its three access states.
 *
 * ── WHAT IS DELIBERATELY *NOT* HERE ────────────────────────────────────────
 * The gate itself. Whether a student is allowed in is decided once, in SQL, by
 * `cp_space_state()` — this module never re-derives it from section flags or
 * the kill switch. Re-implementing that rule client-side would make it the
 * app's SECOND definition of who may post, and every quantity this codebase has
 * defined twice has drifted: the show-up rate reached five copies, the points
 * row four. The server decides; this file only dresses the answer.
 *
 * The one genuinely client-side question is `canPostNow`, because a timeout can
 * lapse while the app is open and a student should not have to reload to speak
 * again.
 */

/** Mirrors `cp_space_state()` in migration 0041. */
export type SpaceState = 'open' | 'paused' | 'locked'

export interface SpaceAccess {
  state: SpaceState
  /** The server's view at fetch time. Prefer `canPostNow` for live decisions. */
  canPost: boolean
  /** When the caller's mute lapses (ISO), or null if they are not muted. */
  timeoutUntil: string | null
  timeoutReason: string | null
}

/**
 * What an unknown student gets before `get_space_access()` answers.
 *
 * Locked, not open: the nav row renders from this on first paint, and flashing
 * a BETA chip at a student who turns out not to be in the beta is worse than
 * briefly under-promising to one who is.
 */
export const SPACE_ACCESS_UNKNOWN: SpaceAccess = {
  state: 'locked',
  canPost: false,
  timeoutUntil: null,
  timeoutReason: null,
}

/** The chip beside "Student Space" in the sidebar and the mobile menu. */
export function spaceChip(state: SpaceState): { label: string; tone: ToneName } {
  switch (state) {
    case 'open':
      return { label: 'BETA', tone: 'accent' }
    case 'paused':
      // `warn`, not `danger`: the feature is coming back. Danger is reserved
      // for things the student lost.
      return { label: 'Paused', tone: 'warn' }
    case 'locked':
      return { label: 'Soon', tone: 'neutral' }
  }
}

/**
 * ── WHY THERE IS NO `spaceRowLinks` ────────────────────────────────────────
 * The nav row links in EVERY state, including 'locked'. A row that renders but
 * does nothing when tapped is a worse affordance than one that explains itself,
 * and the locked screen is not a dead end — it carries the instructor's own
 * "what this is and who gets it" message. The route stays mounted in all three
 * states for the same reason: a typed URL or a stale deep link should land on
 * an explanation, never a blank screen or an uninterpretable redirect.
 */

/**
 * May this student post RIGHT NOW?
 *
 * Re-checks the mute against the clock rather than trusting the boolean the
 * server sent, because a one-hour timeout handed out at 09:00 must stop biting
 * at 10:00 without a refetch.
 *
 * Fails CLOSED on an unparseable timestamp: `NaN <= now` is false, so a corrupt
 * value leaves the student muted rather than silently un-muting them. This is
 * the branch the test pins.
 */
export function canPostNow(access: SpaceAccess, now: number = Date.now()): boolean {
  if (access.state !== 'open') return false
  if (access.timeoutUntil !== null) return Date.parse(access.timeoutUntil) <= now
  return access.canPost
}

/** True while a mute is still in force — drives the "you're muted" notice. */
export function isMuted(access: SpaceAccess, now: number = Date.now()): boolean {
  return access.state === 'open' && !canPostNow(access, now)
}
