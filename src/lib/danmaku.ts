
export const SPEED_PX_PER_SEC = 46
export const MIN_GAP_PX = 64

export function flightDurationMs(
  travelPx: number,
  pillPx: number,
  speed: number = SPEED_PX_PER_SEC,
): number {
  return Math.round(((travelPx + pillPx) / speed) * 1000)
}

export function laneHoldMs(
  pillPx: number,
  speed: number = SPEED_PX_PER_SEC,
  gap: number = MIN_GAP_PX,
): number {
  return Math.round(((pillPx + gap) / speed) * 1000)
}

export function pickLane(freeAt: readonly number[], now: number): number | null {
  if (freeAt.length === 0) return null
  let best = 0
  for (let i = 1; i < freeAt.length; i++) {
    if (freeAt[i] < freeAt[best]) best = i
  }
  return freeAt[best] <= now ? best : null
}
