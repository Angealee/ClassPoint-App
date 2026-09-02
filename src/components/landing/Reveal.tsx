import { motion, useAnimationControls, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import { ease, spring } from '@/lib/motion'
import { useLandingScroll } from './scroll'

const VARIANTS: Variants = {
  hiddenBelow: { opacity: 0, y: 24 },
  hiddenAbove: { opacity: 0, y: -24 },
  show: { opacity: 1, y: 0 },
}

export const revealIconVariants: Variants = {
  hiddenBelow: { opacity: 0, scale: 0.5 },
  hiddenAbove: { opacity: 0, scale: 0.5 },
  show: { opacity: 1, scale: 1, transition: { ...spring, delay: 0.14 } },
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  /** Seconds. Staggers siblings that reveal as one group. */
  delay?: number
  className?: string
}) {
  const controls = useAnimationControls()
  const { direction } = useLandingScroll()

  return (
    <motion.div
      variants={VARIANTS}
      initial="hiddenBelow"
      animate={controls}
      transition={{ ...spring, delay }}
      // A small negative margin so the entrance starts just before the block
      // reaches the edge and is finishing as it becomes properly visible,
      // rather than beginning from nothing once it is already on screen.
      viewport={{ margin: '-40px' }}
      onViewportEnter={() => {
        // Jump to the correct side FIRST, then travel to rest. `set` is
        // instantaneous and happens off-screen, so it is never seen.
        controls.set(direction.current === 'up' ? 'hiddenAbove' : 'hiddenBelow')
        void controls.start('show')
      }}
      onViewportLeave={() => {
        // Leave through the edge it is actually heading for: travelling down,
        // the block exits via the top.
        void controls.start(direction.current === 'down' ? 'hiddenAbove' : 'hiddenBelow', ease)
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
