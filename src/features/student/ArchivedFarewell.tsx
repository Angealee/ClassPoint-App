import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Logo } from '@/components/ui/Logo'

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

/**
 * The send-off an archived student reads on their way out (0060).
 *
 * ── WHY IT IS A FULL-SCREEN LAYER AND NOT A SHEET ───────────────────────────
 * A Sheet is something you dismiss to get at what is behind it. There is
 * nothing behind this: the student's semester is over, and the screen it
 * reveals is a read-only recap. It is the first thing they see, so it owns the
 * whole viewport.
 *
 * ── IT NEVER GOES AWAY ON ITS OWN ──────────────────────────────────────────
 * It used to run for a clamped reading time and then fade out by itself. The
 * instructor's call (2026-11-11): the message stays until the student taps or
 * presses a key. A send-off that leaves while someone is still reading it is
 * worse than one that waits, and there is nobody it is in the way of — the
 * screen behind it is a read-only recap. So there is no end timer at all; the
 * only timer left is the tap guard below, and `onDone` fires from a tap or a key.
 *
 * It fades IN (opacity only) and then holds. Reduced motion neutralises the
 * fade-in and the layer simply appears, which is the same end state.
 *
 * ── Z-INDEX ─────────────────────────────────────────────────────────────────
 * z-[90]: above Sheet (40) and the celebration bursts (50), below
 * AuthTransitionOverlay (100) — which is correct, because the sign-in
 * transition is still fading out over the top of this when it first mounts.
 *
 * Everything animated here is opacity and transform, so it runs on the
 * compositor, and `<MotionConfig reducedMotion="user">` in App.tsx neutralises
 * the movement app-wide.
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
  const [armed, setArmed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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
    return () => clearTimeout(guard)
  }, [])

  // Focus the layer so Enter, Space or Escape can dismiss it without a pointer
  // (a modal dialog that cannot be closed from the keyboard is a trap).
  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="A message from your instructor"
      tabIndex={-1}
      onClick={() => armed && onDone()}
      onKeyDown={(e) => {
        if (armed && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) {
          e.preventDefault()
          onDone()
        }
      }}
      className="fixed inset-0 z-[90] flex cursor-pointer flex-col items-center justify-center gap-6 bg-canvas px-7 text-center outline-none"
      initial={{ opacity: 0 }}
      // In, then HOLD — nothing here ends it but the student.
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
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
