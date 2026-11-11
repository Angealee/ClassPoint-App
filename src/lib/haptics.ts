
export type HapticKey = 'point' | 'deduct' | 'levelup' | 'rank'

const PATTERNS: Record<HapticKey, number | number[]> = {
  point: 60, // a short, satisfying tap
  deduct: [40, 30, 40], // two soft taps — "heads up"
  levelup: [50, 40, 90], // building celebration
  rank: [30, 30, 30], // light triple tick
}

const MUTE_KEY = 'cp_haptics_muted'

/** Is the Vibration API usable on this device/browser at all? */
export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function getHapticsMuted(): boolean {
  return isMuted()
}
export function setHapticsMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Buzz for an event. No-ops if unsupported, muted, or blocked. */
export function vibrate(key: HapticKey): void {
  if (!hapticsSupported() || isMuted()) return
  try {
    navigator.vibrate(PATTERNS[key])
  } catch {
    /* ignore */
  }
}

export function vibrateOnce(): void {
  if (!hapticsSupported()) return
  try {
    navigator.vibrate(35)
  } catch {
    /* ignore */
  }
}
