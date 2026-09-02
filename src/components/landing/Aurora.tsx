import { motion, type MotionValue } from 'framer-motion'
import { cn } from '@/lib/cn'

export function Aurora({
  className,
  offset,
}: {
  className?: string
  offset?: MotionValue<number>
}) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <motion.div className="absolute inset-0" style={{ y: offset }}>
        <div className="cp-aurora-a absolute -left-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-gold-400/25 blur-3xl dark:bg-gold-400/20" />
       
        <div className="cp-aurora-b absolute -bottom-40 -right-28 h-[30rem] w-[30rem] rounded-full bg-accent-solid/15 blur-3xl dark:bg-accent-solid/20" />
      </motion.div>
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  )
}
