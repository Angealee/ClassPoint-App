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

/**
 * FOUR NAMED ROLES, so no component invents its own spring.
 *
 * Before this there were six unrelated definitions written inline at six call
 * sites (260/24, 320/32, 400/30, 500/32, 380/22, 120/20, 600/20), which meant
 * "how does this app move" had no answer and retuning it meant finding them
 * all. Each role below is the behaviour, not the component: pick by what the
 * thing IS doing, and a new component never needs a new number.
 *
 * Reduced motion is handled globally by MotionConfig in App.tsx; none of these
 * need their own guard.
 */

/** UI state feedback: a toast arriving, a switch flipping, a tick confirming. */
export const snap: Transition = { type: 'spring', stiffness: 400, damping: 30 }

/** A large surface moving: sheets and side panels. Softer, because the eye has
 *  to track a big object rather than register a small state change. */
export const glide: Transition = { type: 'spring', stiffness: 320, damping: 32 }

/** A value coming to rest: XP rails, meters, animated figures. Deliberately the
 *  slowest of the four, because a number that snaps is a number you cannot read
 *  on the way. */
export const settle: Transition = { type: 'spring', stiffness: 120, damping: 20 }

/** Direct manipulation of a small target: the bottom-tab glyph dipping under a
 *  thumb. Much stiffer than `snap` on purpose. This one is felt rather than
 *  watched, and any softness at all reads as input lag. */
export const tap: Transition = { type: 'spring', stiffness: 600, damping: 20 }

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
