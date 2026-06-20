import { useCallback, useEffect, useState } from 'react'

interface LockoutOptions {
  /** Failed attempts before a lock kicks in. */
  threshold?: number
  /** Base lock duration; each subsequent lock doubles it (capped). */
  baseMs?: number
  /** Upper bound on a single lock duration. */
  maxMs?: number
}

interface LockoutState {
  locked: boolean
  remainingMs: number
  /** Record one failed attempt; may start (or escalate) a lock. */
  registerFailure: () => void
  /** Clear all counters (call on success). */
  reset: () => void
}

/**
 * Client-side brute-force speed bump, persisted in localStorage so a reload
 * doesn't reset it. After `threshold` failures the form locks for `baseMs`,
 * and each further lock doubles the wait (60s → 2m → 4m …) up to `maxMs`.
 *
 * This is a deterrent layered under real auth, not a security boundary on its
 * own — a determined attacker can clear storage. The server-side password check
 * (and any Supabase rate limiting / MFA) remains the real gate.
 */
export function useLockout(key: string, opts: LockoutOptions = {}): LockoutState {
  const threshold = opts.threshold ?? 5
  const baseMs = opts.baseMs ?? 60_000
  const maxMs = opts.maxMs ?? 15 * 60_000

  const failKey = `${key}.fails`
  const untilKey = `${key}.until`
  const stageKey = `${key}.stage`

  const [lockedUntil, setLockedUntil] = useState(() => Number(localStorage.getItem(untilKey) ?? 0))
  const [nowTs, setNowTs] = useState(() => Date.now())

  const remainingMs = Math.max(0, lockedUntil - nowTs)
  const locked = remainingMs > 0

  // Tick a clock only while actually locked.
  useEffect(() => {
    if (!locked) return
    const id = window.setInterval(() => setNowTs(Date.now()), 500)
    return () => clearInterval(id)
  }, [locked])

  const registerFailure = useCallback(() => {
    const fails = Number(localStorage.getItem(failKey) ?? 0) + 1
    if (fails >= threshold) {
      const stage = Number(localStorage.getItem(stageKey) ?? 0)
      const duration = Math.min(baseMs * 2 ** stage, maxMs)
      const until = Date.now() + duration
      localStorage.setItem(untilKey, String(until))
      localStorage.setItem(stageKey, String(stage + 1))
      localStorage.setItem(failKey, '0')
      setLockedUntil(until)
      setNowTs(Date.now())
    } else {
      localStorage.setItem(failKey, String(fails))
    }
  }, [failKey, untilKey, stageKey, threshold, baseMs, maxMs])

  const reset = useCallback(() => {
    localStorage.removeItem(failKey)
    localStorage.removeItem(untilKey)
    localStorage.removeItem(stageKey)
    setLockedUntil(0)
  }, [failKey, untilKey, stageKey])

  return { locked, remainingMs, registerFailure, reset }
}

/** Format a millisecond duration as M:SS for a countdown label. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
