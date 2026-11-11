import { useEffect } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'

interface AnimatedNumberProps {
  value: number
  prefix?: string
  suffix?: string
  className?: string
  /** Seconds; the roll is intentionally quick. */
  duration?: number
}

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
