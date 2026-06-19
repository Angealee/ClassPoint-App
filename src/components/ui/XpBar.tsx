import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface XpBarProps {
  /** Progress through the current level, 0–100. */
  value: number
  className?: string
  showShimmer?: boolean
}

/** Animated gold EXP bar with a moving shimmer. */
export function XpBar({ value, className, showShimmer = true }: XpBarProps) {
  const pct = Math.max(0, Math.min(100, value))

  return (
    <div
      className={cn(
        'relative h-3 w-full overflow-hidden rounded-full bg-card-2 ring-1 ring-line',
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="relative h-full rounded-full bg-gradient-to-r from-gold-500 via-gold-400 to-gold-300"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      >
        {showShimmer && (
          <span className="cp-shimmer absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        )}
      </motion.div>
    </div>
  )
}
