import { motion } from 'framer-motion'
import { listVariants, rowVariants } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { DEMO_POINTS, DEMO_RANK } from './ScoreboardDemo'

interface Row {
  rank: number
  name: string
  points: number
  you?: boolean
}

const ROWS: Row[] = [
  { rank: 5, name: 'A. Reyes', points: 214 },
  { rank: 6, name: 'J. Cruz', points: 198 },
  { rank: DEMO_RANK, name: 'You', points: DEMO_POINTS, you: true },
  { rank: 8, name: 'M. Santos', points: 176 },
]

export function BoardPreview({ className }: { className?: string }) {
  return (
    <motion.ul
      variants={listVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      className={cn('divide-y divide-line overflow-hidden rounded-xl border border-line bg-card', className)}
    >
      {ROWS.map((row) => (
        <motion.li
          key={row.rank}
          variants={rowVariants}
          className={cn(
            'flex items-center gap-3 px-4 py-3',

            row.you && 'bg-accent-solid/8',
          )}
        >

          <span
            className={cn(
              'w-7 shrink-0 font-display text-lg font-bold tabular-nums',
              row.you ? 'text-accent' : 'text-muted',
            )}
          >
            {row.rank}
          </span>

          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-500 text-2xs font-bold text-brand-950"
          >
            {initials(row.name)}
          </span>

          <span className={cn('min-w-0 flex-1 truncate text-sm', row.you && 'font-semibold')}>
            {row.name}
          </span>

          <span className="shrink-0 font-display text-sm font-bold tabular-nums text-reward">
            {row.points}
          </span>
        </motion.li>
      ))}
    </motion.ul>
  )
}

function initials(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
