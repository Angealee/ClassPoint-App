import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

/**
 * A brief centered check that confirms a consequential action landed (approve a
 * request, save your profile, finalise attendance). Auto-dismisses. Purely
 * decorative, so reduced-motion users simply never see it — the toast already
 * carries the real confirmation.
 */
export function SuccessTick({ show, onDone }: { show: boolean; onDone: () => void }) {
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!show) return
    // Reduced motion: skip the flourish entirely, resolve immediately.
    const ms = reduce ? 0 : 950
    const t = setTimeout(onDone, ms)
    return () => clearTimeout(t)
  }, [show, reduce, onDone])

  if (reduce) return null

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 shadow-2xl shadow-emerald-500/40"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          >
            <motion.svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M5 12.5 10 17.5 19.5 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.12, duration: 0.3, ease: 'easeOut' }}
              />
            </motion.svg>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
