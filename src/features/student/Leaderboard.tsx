import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import { useStudentData } from './StudentData'

const rankStyles = ['text-gold-400', 'text-zinc-400', 'text-amber-700']

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function Leaderboard() {
  const { loading, leaderboard, me, sectionName } = useStudentData()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-muted">All sections · ranked by total points</p>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : leaderboard.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No students ranked yet.</Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {leaderboard.map((s, i) => {
            const isMe = me?.id === s.id
            const level = getLevelProgress(s.lifetime_points).level
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className={cn('flex items-center gap-3 p-4', isMe && 'bg-brand-500/5')}
              >
                <span
                  className={cn(
                    'w-7 text-center font-display text-lg font-bold',
                    rankStyles[i] ?? 'text-muted',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-2 font-display text-sm font-bold">
                  {initials(s.display_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.display_name} {isMe && <span className="text-brand-500">(you)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {sectionName(s.section_id)} · Lv {level}
                  </p>
                </div>
                <span className="font-display text-base font-bold text-gold-600 dark:text-gold-400">
                  {s.lifetime_points}
                </span>
              </motion.div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
