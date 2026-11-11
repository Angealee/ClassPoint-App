import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { StarIcon } from '@/components/ui/icons'
import { ConfettiBurst } from '@/components/leaderboard/ConfettiBurst'

const TAP_GUARD_MS = 700

const PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2
  const dist = 120 + (i % 3) * 30
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, delay: (i % 5) * 0.02 }
})

/** Light rays fanning out behind the medallion. */
const RAYS = Array.from({ length: 12 }, (_, i) => (i / 12) * 360)

export function LevelUpBurst({ level, onDone }: { level: number | null; onDone: () => void }) {
  const reduced = useReducedMotion() ?? false
  const [armed, setArmed] = useState(false)
  const [shown, setShown] = useState(level ?? 1)

  useEffect(() => {
    if (level === null) return
    setArmed(false)
    setShown(Math.max(1, level - 1))
    const arm = setTimeout(() => setArmed(true), TAP_GUARD_MS)
    const tick = setTimeout(() => setShown(level), reduced ? 0 : 620)
    return () => {
      clearTimeout(arm)
      clearTimeout(tick)
    }
  }, [level, reduced])

  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          key="levelup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => armed && onDone()}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/75 backdrop-blur-sm"
          role="alertdialog"
          aria-label={`Level up! You reached level ${level}. Tap to continue.`}
        >
          {!reduced && (
            <motion.div
              className="pointer-events-none absolute inset-0 bg-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.65, 0] }}
              transition={{ duration: 0.45, times: [0, 0.12, 1], delay: 0.28 }}
            />
          )}

          <ConfettiBurst />

          <motion.div
            className="relative flex flex-col items-center"
            animate={reduced ? undefined : { x: [0, -7, 6, -4, 3, 0], y: [0, 4, -3, 2, 0] }}
            transition={{ duration: 0.42, delay: 0.28, ease: 'easeOut' }}
          >
            {/* Rays, rotating slowly behind everything. */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 0.5, scale: 1, rotate: reduced ? 0 : 360 }}
              transition={{
                opacity: { duration: 0.5, delay: 0.2 },
                scale: { duration: 0.6, delay: 0.2, ease: 'easeOut' },
                rotate: { duration: 34, repeat: Infinity, ease: 'linear' },
              }}
            >
              {RAYS.map((deg) => (
                <span
                  key={deg}
                  className="absolute h-64 w-6 origin-center bg-gradient-to-t from-transparent via-gold-400/25 to-transparent"
                  style={{ transform: `rotate(${deg}deg)` }}
                />
              ))}
            </motion.div>

            {/* Particle ring. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {PARTICLES.map((p, i) => (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
                  transition={{ duration: 1.1, delay: 0.24 + p.delay, ease: 'easeOut' }}
                  className="absolute text-gold-400"
                >
                  <StarIcon className="h-4 w-4" />
                </motion.span>
              ))}
            </div>

            <motion.div
              initial={{ y: -160, scale: 0.5, rotate: -14, opacity: 0 }}
              animate={{
                y: 0,
                opacity: 1,
                rotate: 0,
                scale: reduced ? 1 : [0.5, 1.18, 0.9, 1.04, 1],
                scaleY: reduced ? 1 : [0.5, 0.82, 1.12, 0.98, 1],
              }}
              transition={{ duration: reduced ? 0.2 : 0.62, ease: [0.2, 0.9, 0.3, 1], delay: 0.05 }}
              className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-gold-300 to-gold-500 shadow-2xl shadow-gold-500/40"
            >
              <StarIcon className="h-16 w-16 text-brand-950" />
              {/* Shine sweep, once, after it lands. */}
              {!reduced && (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 w-16 -skew-x-12 bg-white/45 blur-md"
                  initial={{ x: -110 }}
                  animate={{ x: 190 }}
                  transition={{ duration: 0.75, delay: 0.72, ease: 'easeInOut' }}
                />
              )}
            </motion.div>

            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.42 }}
              className="mt-6 font-display text-2xl font-bold uppercase tracking-[0.2em] text-gold-300"
            >
              Level Up!
            </motion.p>

            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-1 font-display text-6xl font-bold tabular-nums text-white"
            >
              Lv {shown}
            </motion.p>

            <div className="mt-5 h-2 w-52 overflow-hidden rounded-full bg-white/15">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500"
                initial={{ width: '55%' }}
                animate={{ width: reduced ? '12%' : ['55%', '100%', '100%', '12%'] }}
                transition={{
                  duration: reduced ? 0.2 : 1.1,
                  times: reduced ? undefined : [0, 0.45, 0.62, 1],
                  delay: 0.35,
                  ease: 'easeInOut',
                }}
              />
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: armed ? 1 : 0 }}
              transition={{ duration: 0.35 }}
              className="mt-6 text-xs text-white/60"
            >
              Tap to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
