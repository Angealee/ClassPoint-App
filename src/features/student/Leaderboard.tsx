import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { getLevelProgress } from '@/lib/leveling'
import { mockLeaderboard } from '@/lib/mock'
import { cn } from '@/lib/cn'

const rankStyles = ['text-gold-400', 'text-zinc-400', 'text-amber-700']

export function Leaderboard() {
  const ranked = [...mockLeaderboard].sort((a, b) => b.points - a.points)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-muted">All sections · ranked by total points</p>
      </div>

      <Card className="divide-y divide-line overflow-hidden">
        {ranked.map((s, i) => {
          const isMe = s.id === 'me'
          const level = getLevelProgress(s.points).level
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
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
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card-2 font-display text-sm font-bold">
                {s.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {s.name} {isMe && <span className="text-brand-500">(you)</span>}
                </p>
                <p className="text-xs text-muted">{s.section} · Lv {level}</p>
              </div>
              <span className="font-display text-base font-bold text-gold-600 dark:text-gold-400">
                {s.points}
              </span>
            </motion.div>
          )
        })}
      </Card>
    </div>
  )
}
