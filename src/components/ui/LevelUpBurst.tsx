import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { StarIcon } from '@/components/ui/icons'

const AUTO_DISMISS_MS = 3600

// Deterministic ring of particles so the burst looks even.
const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2
  const dist = 120 + (i % 3) * 26
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, delay: (i % 5) * 0.02 }
})

/** Celebratory full-screen burst shown when a student levels up. */
export function LevelUpBurst({ level, onDone }: { level: number | null; onDone: () => void }) {
  useEffect(() => {
    if (level === null) return
    const t = setTimeout(onDone, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [level, onDone])

  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          key="levelup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDone}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          role="alertdialog"
          aria-label={`Level up! You reached level ${level}`}
        >
          <div className="relative flex flex-col items-center">
            {/* Particle burst */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {PARTICLES.map((p, i) => (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
                  transition={{ duration: 1, delay: 0.1 + p.delay, ease: 'easeOut' }}
                  className="absolute text-gold-400"
                >
                  <StarIcon className="h-4 w-4" />
                </motion.span>
              ))}
            </div>

            {/* Badge */}
            <motion.div
              initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
              className="flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-gold-300 to-gold-500 shadow-2xl shadow-gold-500/40"
            >
              <StarIcon className="h-14 w-14 text-brand-950" />
            </motion.div>

            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.18 }}
              className="mt-6 font-display text-2xl font-bold uppercase tracking-[0.2em] text-gold-300"
            >
              Level Up!
            </motion.p>
            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.26 }}
              className="mt-1 font-display text-6xl font-bold text-white"
            >
              Lv {level}
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-4 text-xs text-white/60"
            >
              Tap to continue
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
