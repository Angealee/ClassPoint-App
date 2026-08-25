import type { Transition, Variants } from 'framer-motion'

/**
 * Shared motion vocabulary.
 *
 * One place so the whole app moves the same way. The instructor picked
 * "noticeable — with character": springy easing, ~250–350ms, movement you can
 * actually see, rather than the near-invisible 120ms kind.
 *
 * Everything here is switched off for motion-sensitive users by the
 * `<MotionConfig reducedMotion="user">` in App.tsx — these values never need
 * their own guard.
 */

/** The house spring. Enough bounce to read as deliberate, not enough to wobble. */
export const spring: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 24,
  mass: 0.9,
}

/** For things that should ease rather than bounce — bars, widths, opacity. */
export const ease: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }

/**
 * Whole-screen entrance, used by the router outlet.
 *
 * Rises rather than slides sideways: a horizontal slide implies a direction
 * between tabs, and the bottom nav has no meaningful left-to-right order.
 */
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

/**
 * Press feedback for anything tappable.
 *
 * Spread onto a `motion` element. The dip is small on purpose — a card that
 * shrinks noticeably reads as broken rather than responsive — but it is the
 * difference between a tappable card feeling like a button and feeling like a
 * picture, which matters now that most cards navigate somewhere.
 */
export const pressable = {
  whileTap: { scale: 0.975 },
  transition: spring,
} as const
