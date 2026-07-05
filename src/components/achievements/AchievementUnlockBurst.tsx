import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeArt } from './BadgeArt'
import { StarIcon } from '@/components/ui/icons'
import type { Achievement } from '@/lib/types'

const AUTO_DISMISS_MS = 4200

// Same deterministic particle ring as LevelUpBurst, for a consistent feel
// across every celebratory moment in the app.
const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2
  const dist = 120 + (i % 3) * 26
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, delay: (i % 5) * 0.02 }
})

/** Celebratory full-screen burst shown when an achievement unlocks — structurally
 * mirrors LevelUpBurst, themed with the achievement's own illustrated badge. */
export function AchievementUnlockBurst({
  achievement,
  onDone,
}: {
  achievement: Achievement | null
  onDone: () => void
}) {
  useEffect(() => {
    if (!achievement) return
    const t = setTimeout(onDone, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [achievement, onDone])

  return (
    <AnimatePresence>
      {achievement && (
        <motion.div
          key="achievement-unlock"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDone}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
          role="alertdialog"
          aria-label={`Achievement unlocked: ${achievement.name}`}
        >
          <div className="relative flex flex-col items-center">
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

            <motion.div
              initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
            >
              <BadgeArt code={achievement.code} category={achievement.category} state="unlocked" size="lg" />
            </motion.div>

            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.18 }}
              className="mt-6 font-display text-xl font-bold uppercase tracking-[0.2em] text-gold-300"
            >
              Achievement Unlocked!
            </motion.p>
            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.26 }}
              className="mt-1 max-w-[280px] text-center font-display text-3xl font-bold text-white"
            >
              {achievement.name}
            </motion.p>
            {achievement.titleText && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-2 text-sm text-white/80"
              >
                New title unlocked: <span className="font-semibold text-gold-300">{achievement.titleText}</span>
              </motion.p>
            )}
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
