import type { Transition, Variants } from 'framer-motion'

export const spring: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 24,
  mass: 0.9,
}

export const snap: Transition = { type: 'spring', stiffness: 400, damping: 30 }

export const glide: Transition = { type: 'spring', stiffness: 320, damping: 32 }

export const settle: Transition = { type: 'spring', stiffness: 120, damping: 20 }

export const pop: Transition = { type: 'spring', stiffness: 300, damping: 18 }

export const tap: Transition = { type: 'spring', stiffness: 600, damping: 20 }

export const ease: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { ...spring, staggerChildren: 0.05 } },
}

/** A list that reveals its rows one after another. */
export const listVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

/** One row inside `listVariants`. */
export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: spring },
}

export const pressable = {
  whileTap: { scale: 0.975 },
  transition: spring,
} as const
