/**
 * ClassPoint · haptic feedback (vibration).
 *
 * Buzzes the phone for in-app events while the app is *open* (foreground). The
 * background / lock-screen buzz is handled by the OS when a Web Push arrives
 * (see public/push-sw.js); this module covers the case where the student is
 * actively looking at the app, mirroring lib/sound.ts.
 *
 * Platform notes:
 *  - Android (Chrome / Edge / Firefox) support navigator.vibrate().
 *  - iOS / iPadOS Safari do NOT implement the Vibration API at all — not even
 *    for installed PWAs. There is no foreground buzz on iPhone. iPhones still
 *    vibrate for *push* notifications (the system handles those), so turning on
 *    "Push to this device" in Profile is how iOS students feel alerts.
 *  - Everything is a safe no-op when unsupported, muted, or blocked.
 */

export type HapticKey = 'point' | 'deduct' | 'levelup' | 'rank'

/**
 * Vibration patterns in milliseconds: a single number, or alternating
 * buzz/pause/buzz… The feel intentionally tracks the matching sound effect.
 */
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

/** Read/persist the user's vibration preference (defaults to on). */
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

/** A single confirmation tap — used when the student turns vibration on. */
export function vibrateOnce(): void {
  if (!hapticsSupported()) return
  try {
    navigator.vibrate(35)
  } catch {
    /* ignore */
  }
}
