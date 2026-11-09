import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Logo } from '@/components/ui/Logo'

/**
 * How long the whole run lasts, scaled to how much there is to read.
 *
 * A fixed duration is wrong at both ends: 4s yanks a four-line send-off away
 * mid-sentence, and 9s on an empty message is a student staring at a logo. So
 * it is reading time, clamped — and a tap skips it regardless, which is what
 * makes the ceiling safe.
 */
const BASE_MS = 3200
const PER_CHAR_MS = 28
const MIN_MS = 3600
const MAX_MS = 9000

/**
 * Ignore the first tap for this long.
 *
 * ⚠ LOAD-BEARING, and the same lesson LevelUpBurst records. This screen appears
 *   immediately after the student has tapped "Sign in" — the finger is already
 *   on the glass and the tap in flight would dismiss the moment before it drew
 *   a single frame. Without the guard the farewell would be invisible to
 *   exactly the people it is for.
 */
const TAP_GUARD_MS = 700

function runMs(message: string | null): number {
  const chars = message?.length ?? 0
  return Math.min(MAX_MS, Math.max(MIN_MS, BASE_MS + chars * PER_CHAR_MS))
}

/**
 * The send-off an archived student reads on their way out (0060).
 *
 * ── WHY IT IS A FULL-SCREEN LAYER AND NOT A SHEET ───────────────────────────
 * A Sheet is something you dismiss to get at what is behind it. There is
 * nothing behind this: the student's semester is over, and the screen it
 * reveals is a read-only recap. It is the first thing they see, so it owns the
 * whole viewport.
 *
 * ── ONE TIMER, NOT THREE ────────────────────────────────────────────────────
 * Three sub-animations finish at three different moments, and
 * `reducedMotion="user"` changes which. `AuthTransition` already learned this:
 * a single `setTimeout` is the only clock that cannot disagree with itself, so
 * `onDone` never hangs on an animation that was neutralised.
 *
 * ── Z-INDEX ─────────────────────────────────────────────────────────────────
 * z-[90]: above Sheet (40) and the celebration bursts (50), below
 * AuthTransitionOverlay (100) — which is correct, because the sign-in
 * transition is still fading out over the top of this when it first mounts.
 *
 * Everything animated here is opacity and transform, so it runs on the
 * compositor, and `<MotionConfig reducedMotion="user">` in App.tsx neutralises
 * the movement app-wide while the timer still fires on time.
 */
export function ArchivedFarewell({
  semesterName,
  message,
  onDone,
}: {
  semesterName: string | null
  /** The instructor's words, or null — then the name and one line carry it. */
  message: string | null
  onDone: () => void
}) {
  const total = runMs(message)
  const [armed, setArmed] = useState(false)

  // Latest-ref so the timer effect depends on nothing that changes: an inline
  // arrow `onDone` from the parent is a new identity every render, and an
  // effect keyed on it would restart the clock on every parent re-render (the
  // Sheet focus-trap bug, which cost 21 sheets their keystrokes).
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const guard = setTimeout(() => setArmed(true), TAP_GUARD_MS)
    const end = setTimeout(() => doneRef.current(), total)
    return () => {
      clearTimeout(guard)
      clearTimeout(end)
    }
  }, [total])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="A message from your instructor"
      onClick={() => armed && onDone()}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-canvas px-7 text-center"
      initial={{ opacity: 0 }}
      // in (0–0.12), hold (0.12–0.86), out into the recap (0.86–1).
      animate={{ opacity: [0, 1, 1, 1, 0] }}
      transition={{
        duration: total / 1000,
        times: [0, 0.12, 0.5, 0.86, 1],
        ease: 'easeInOut',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: [0.86, 1, 1.04, 1] }}
        transition={{ duration: 1.6, times: [0, 0.4, 0.75, 1], ease: 'easeOut' }}
      >
        <Logo className="h-16 w-16" />
      </motion.div>

      {semesterName && (
        <motion.p
          className="text-2xs font-semibold uppercase tracking-widest text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          {semesterName}
        </motion.p>
      )}

      <motion.p
        // Reads as a letter rather than a notification: display face, generous
        // line height, capped at a comfortable measure instead of running the
        // full width of a phone.
        className="max-w-sm font-display text-xl font-bold leading-relaxed text-ink [overflow-wrap:break-word]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.9, ease: 'easeOut' }}
      >
        {message?.trim() || 'That is a wrap on your semester. Thanks for playing along.'}
      </motion.p>

      <motion.p
        className="text-xs text-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: armed ? 1 : 0 }}
        transition={{ duration: 0.5 }}
      >
        Tap to continue
      </motion.p>
    </motion.div>
  )
}
