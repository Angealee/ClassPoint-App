/**
 * The floating-comment timing rules.
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
 *
 * ── GEOMETRY-AGNOSTIC SINCE THE COLUMN REWRITE (2026-11-08) ────────────────
 * Comments used to fly right-to-left across up to five horizontal lanes; they
 * now rise in a single column up one side. Not a line of this arithmetic
 * changed — the guarantee is about a distance and a size, and it never cared
 * which axis they were measured on. So the parameters are named `travelPx` and
 * `pillPx` rather than `deckWidth` and `pillWidth`: the caller passes widths
 * for a horizontal stream and heights for a vertical one, and the proof holds
 * either way.
 *
 * `laneCount` was deleted with that rewrite. It derived a lane count from the
 * viewport height, which only means anything when lanes are stacked
 * vertically; one column needs no such answer. `pickLane` still takes an array
 * so the single column is simply an array of one, which keeps the one
 * scheduling rule in one place.
 */

/** Pixels per second. Constant for every pill — see the guarantee above. */
export const SPEED_PX_PER_SEC = 46
/** Clear space kept between one pill's tail and the next pill's nose. */
export const MIN_GAP_PX = 64

/**
 * How long a pill takes to cross.
 *
 * Distance is the track's own length PLUS the pill's, because it starts fully
 * outside the entry edge and must leave fully past the exit edge.
 */
export function flightDurationMs(
  travelPx: number,
  pillPx: number,
  speed: number = SPEED_PX_PER_SEC,
): number {
  return Math.round(((travelPx + pillPx) / speed) * 1000)
}

/**
 * How long a lane stays busy after launching a pill of this size.
 *
 * Only as long as it takes the pill's tail plus the gap to clear the entry
 * point — NOT the full crossing. A lane is reusable long before its previous
 * pill has finished, which is what lets one column keep up with a busy class.
 */
export function laneHoldMs(
  pillPx: number,
  speed: number = SPEED_PX_PER_SEC,
  gap: number = MIN_GAP_PX,
): number {
  return Math.round(((pillPx + gap) / speed) * 1000)
}

/**
 * The lane that has been free longest, or null when they are all still busy.
 *
 * Picking the longest-free lane (rather than the first free one) spreads
 * comments across the track instead of piling them into lane 0. With a single
 * column there is nothing to spread, but the "is it free yet" half is exactly
 * the same question — which is why this is still the one scheduler.
 */
export function pickLane(freeAt: readonly number[], now: number): number | null {
  if (freeAt.length === 0) return null
  let best = 0
  for (let i = 1; i < freeAt.length; i++) {
    if (freeAt[i] < freeAt[best]) best = i
  }
  return freeAt[best] <= now ? best : null
}
