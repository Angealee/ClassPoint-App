import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { spring } from '@/lib/motion'

/**
 * A section that rises into place the first time it is scrolled to.
 *
 * ── WHY VIEWPORT-TRIGGERED AND NOT ON MOUNT ────────────────────────────────
 * The landing page is a scrolling story, so most of it is below the fold at
 * load. An `animate` entrance would play every section's arrival while nobody
 * is looking at it, and by the time you scrolled down the page would be a wall
 * of already-settled blocks — the animation budget spent on an empty room.
 *
 * `once: true` is load-bearing: re-animating on every pass turns scrolling back
 * up into a flicker, and it would also keep the observer paying attention for
 * the life of the page. One shot, then framer detaches.
 *
 * This is still one-shot entrance motion — the ambient half of the page is CSS
 * (see the `cp-aurora-*` / `cp-sheen` keyframes). Nothing here runs a spring
 * after the section has arrived.
 *
 * `margin: '-80px'` fires it slightly BEFORE the block reaches the viewport
 * edge, so the movement is finishing as it comes into view rather than starting
 * from nothing once it is already on screen.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  /** Seconds. Use to stagger siblings that reveal as one group. */
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ ...spring, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
