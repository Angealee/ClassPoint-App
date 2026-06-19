import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { XpBar } from '@/components/ui/XpBar'
import { BoltIcon, StarIcon, TrophyIcon } from '@/components/ui/icons'
import { getLevelProgress } from '@/lib/leveling'
import { mockFeed, mockLeaderboard, mockMe } from '@/lib/mock'
import { cn } from '@/lib/cn'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

export function Dashboard() {
  const progress = getLevelProgress(mockMe.points)
  const rank = mockLeaderboard.findIndex((s) => s.id === 'me') + 1

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      <motion.p variants={item} className="text-sm text-muted">
        Welcome back, <span className="font-semibold text-ink">{mockMe.name}</span> · {mockMe.section}
      </motion.p>

      {/* Level / XP hero */}
      <motion.div variants={item}>
        <Card className="overflow-hidden">
          <div className="relative bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/70">Level</p>
                <p className="font-display text-5xl font-bold leading-none">{progress.level}</p>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                <StarIcon className="h-9 w-9 text-gold-300" />
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between text-xs text-white/80">
                <span>{progress.expIntoLevel} / {progress.expForLevel} XP</span>
                <span>{progress.expToNext} to next</span>
              </div>
              <XpBar value={progress.progressPct} />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Stat tiles */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        <StatTile icon={<BoltIcon className="h-5 w-5" />} label="Total points" value={mockMe.points} tone="gold" />
        <StatTile icon={<TrophyIcon className="h-5 w-5" />} label="Overall rank" value={`#${rank}`} tone="brand" />
      </motion.div>

      {/* Recent points feed */}
      <motion.div variants={item}>
        <h2 className="mb-2 text-sm font-semibold text-muted">Recent points</h2>
        <Card className="divide-y divide-line">
          {mockFeed.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-4">
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                  e.category === 'activity'
                    ? 'bg-brand-500/10 text-brand-500'
                    : 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
                )}
              >
                +{e.points}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.note ?? 'Class points'}</p>
                <p className="text-xs capitalize text-muted">{e.category} · {e.at}</p>
              </div>
            </div>
          ))}
        </Card>
      </motion.div>

      <motion.p variants={item} className="pt-1 text-center text-xs text-muted">
        Showing demo data — live points arrive once Supabase is connected.
      </motion.p>
    </motion.div>
  )
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tone: 'gold' | 'brand'
}) {
  return (
    <Card className="p-4">
      <div
        className={cn(
          'mb-2 flex h-9 w-9 items-center justify-center rounded-lg',
          tone === 'gold' ? 'bg-gold-400/15 text-gold-600 dark:text-gold-400' : 'bg-brand-500/10 text-brand-500',
        )}
      >
        {icon}
      </div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  )
}
