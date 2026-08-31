/**
 * The flying-comment timing rules.
 *
 * ── WHY THIS IS A PURE MODULE ──────────────────────────────────────────────
 * The anti-overlap guarantee is arithmetic, and it was previously buried in a
 * component alongside a WIDTH ESTIMATE (`96 + chars * 6.6`). The estimate was
 * the guarantee — get it wrong and pills either overlap or the lane is held so
 * long the stream throttles to a few comments a minute. It was wrong in both
 * directions, and nothing could catch that because none of it was testable.
 *
 * Everything here takes measured pixels and returns milliseconds, so the rule
 * can be proved rather than eyeballed on a moving screen.
 *
 * ── THE GUARANTEE ──────────────────────────────────────────────────────────
 * Every pill travels at the SAME speed and enters at the SAME point. So two
 * pills in one lane can never converge — whatever gap exists at launch is the
 * gap forever. Holding a lane until the previous pill's tail plus MIN_GAP has
 * cleared the entry point is therefore sufficient, and `neverOverlap` in the
 * test asserts exactly that.
 */

/** Pixels per second. Constant for every pill — see the guarantee above. */
export const SPEED_PX_PER_SEC = 46
/** Clear space kept between one pill's tail and the next pill's nose. */
export const MIN_GAP_PX = 64

/**
 * How long a pill takes to cross.
 *
 * Distance is the deck's width PLUS the pill's own, because it starts fully
 * off the right edge and must leave fully off the left.
 */
export function flightDurationMs(
  deckWidth: number,
  pillWidth: number,
  speed: number = SPEED_PX_PER_SEC,
): number {
  return Math.round(((deckWidth + pillWidth) / speed) * 1000)
}

/**
 * How long a lane stays busy after launching a pill of this width.
 *
 * Only as long as it takes the pill's tail plus the gap to clear the entry
 * point — NOT the full crossing. A lane is reusable long before its previous
 * pill has finished, which is what makes several lanes actually keep up with a
 * busy class.
 */
export function laneHoldMs(
  pillWidth: number,
  speed: number = SPEED_PX_PER_SEC,
  gap: number = MIN_GAP_PX,
): number {
  return Math.round(((pillWidth + gap) / speed) * 1000)
}

/**
 * The lane that has been free longest, or null when they are all still busy.
 *
 * Picking the longest-free lane (rather than the first free one) spreads
 * comments down the screen instead of piling them into lane 0.
 */
export function pickLane(freeAt: readonly number[], now: number): number | null {
  if (freeAt.length === 0) return null
  let best = 0
  for (let i = 1; i < freeAt.length; i++) {
    if (freeAt[i] < freeAt[best]) best = i
  }
  return freeAt[best] <= now ? best : null
}

/**
 * How many lanes fit on this screen.
 *
 * Derived from the viewport rather than hard-coded, so a tall phone gets more
 * lanes than a short one. The insets keep comments off the page header and the
 * bottom tab bar — the overlay covers the board, never the app's own chrome.
 */
export function laneCount(
  viewportHeight: number,
  topInset: number,
  bottomInset: number,
  laneHeight: number,
  max: number,
): number {
  const usable = viewportHeight - topInset - bottomInset
  return Math.max(1, Math.min(max, Math.floor(usable / laneHeight)))
}
