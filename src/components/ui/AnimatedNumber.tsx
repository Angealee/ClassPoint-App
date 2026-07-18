import { useEffect } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'

interface AnimatedNumberProps {
  /** The target value. Rolls from its previous value to this on change. */
  value: number
  /** Optional prefix/suffix rendered as plain text around the number (e.g. "#", "%"). */
  prefix?: string
  suffix?: string
  className?: string
  /** Seconds; the roll is intentionally quick. */
  duration?: number
}

/**
 * A number that rolls up/down to its new value instead of snapping. Uses a
 * MotionValue so only a text node updates each frame — no React re-render per
 * tick. Reduced-motion users get the final value immediately.
 */
export function AnimatedNumber({
  value,
  prefix,
  suffix,
  className,
  duration = 0.5,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(value)
  const rounded = useTransform(mv, (v) => Math.round(v))

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration, ease: 'easeOut' })
    return controls.stop
  }, [value, duration, reduce, mv])

  return (
    <span className={className}>
      {prefix}
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  )
}
