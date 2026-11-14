import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

/*
 * Mission-control counter: each digit is a drum of 0-9 that rolls to its value. It replaces a
 * number ticking up, which is what every leaderboard does. Transform-only (the drum is
 * translated), so it costs no layout. Reduced motion shows the final value at once.
 */
const ROLL = [0.22, 1, 0.36, 1] as const

export function Odometer({
  value,
  reduced,
  delay = 0,
  className,
}: {
  value: number
  reduced: boolean
  delay?: number
  className?: string
}) {
  const text = String(Math.max(0, Math.round(value)))
  const digits = text.split('').map(Number)

  return (
    <span className={cn('inline-flex tabular-nums', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {digits.map((d, i) => (
          <span
            key={i}
            className="relative inline-block h-[1.1em] w-[0.62em] overflow-hidden text-center leading-[1.1em]"
          >
            <motion.span
              className="flex flex-col"
              initial={reduced ? false : { y: '0%' }}
              animate={{ y: `${-d * 10}%` }}
              transition={{ duration: 0.85 + i * 0.12, ease: ROLL, delay }}
            >
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n} className="block h-[1.1em]">
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        ))}
      </span>
    </span>
  )
}
