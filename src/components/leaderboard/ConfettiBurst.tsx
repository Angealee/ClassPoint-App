import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/** Gold + brand confetti, with a few white motes for sparkle. */
const COLORS = ['#ffba1f', '#ffcd4a', '#f29e0a', '#e11d2a', '#ffffff']

/**
 * A one-shot confetti burst that rains from the top-centre of its (relative)
 * parent. Pieces fan out and fall, then fade. No-ops under reduced-motion.
 * The parent controls lifetime (mount it, then unmount after ~2s).
 */
export function ConfettiBurst({ count = 28 }: { count?: number }) {
  const reduced = useReducedMotion() ?? false

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 340, // horizontal fan-out (px)
        y: 130 + Math.random() * 180, // fall distance (px)
        rot: (Math.random() - 0.5) * 540,
        delay: Math.random() * 0.25,
        dur: 0.9 + Math.random() * 0.8,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 5,
        round: i % 3 === 0,
      })),
    [count],
  )

  if (reduced) return null

  return (
    <div className="pointer-events-none absolute left-1/2 top-2 z-30 h-0 w-0" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: -10, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rot }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            borderRadius: p.round ? '9999px' : '2px',
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  )
}
