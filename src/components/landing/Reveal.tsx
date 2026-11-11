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
      viewport={{ margin: '-40px' }}
      onViewportEnter={() => {
        controls.set(direction.current === 'up' ? 'hiddenAbove' : 'hiddenBelow')
        void controls.start('show')
      }}
      onViewportLeave={() => {
        void controls.start(direction.current === 'down' ? 'hiddenAbove' : 'hiddenBelow', ease)
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
