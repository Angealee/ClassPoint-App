import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { XpBar } from '@/components/ui/XpBar'
import { Button } from '@/components/ui/Button'
import { BoltIcon, StarIcon, TrophyIcon } from '@/components/ui/icons'
import { getLevelProgress } from '@/lib/leveling'
import { snapshotLabel, timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { useStudentData } from './StudentData'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

export function Dashboard() {
  const { loading, error, me, events, rank, capturedAt, sectionName, refresh } = useStudentData()

  if (loading) return <DashboardSkeleton />

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted">Couldn't load your dashboard.</p>
        <Button variant="outline" className="mt-4" onClick={() => void refresh()}>
          Try again
        </Button>
      </Card>
    )
  }

  if (!me) {
    return (
      <Card className="p-8 text-center text-sm text-muted">
        We couldn't find your student record. Ask your instructor to check your class list entry.
      </Card>
    )
  }

  const progress = getLevelProgress(me.lifetime_points)

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      <motion.p variants={item} className="text-sm text-muted">
        Welcome back, <span className="font-semibold text-ink">{me.display_name}</span> ·{' '}
        {sectionName(me.section_id)}
      </motion.p>

      {/* Level / XP hero */}
      <motion.div variants={item}>
        <Card className="overflow-hidden">
          <div className="relative bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/70">Level</p>
                <p className="font-display text-5xl font-bold leading-none sm:text-6xl">
                  {progress.level}
                </p>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                <StarIcon className="h-9 w-9 text-gold-300" />
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between text-xs text-white/80">
                <span>
                  {progress.expIntoLevel} / {progress.expForLevel} XP
                </span>
                <span>{progress.expToNext} to next</span>
              </div>
              <XpBar value={progress.progressPct} />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Stat tiles */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<BoltIcon className="h-5 w-5" />}
          label="Total points"
          value={me.lifetime_points}
          tone="gold"
        />
        <StatTile
          icon={<TrophyIcon className="h-5 w-5" />}
          label="Overall rank"
          value={rank ? `#${rank}` : '—'}
          note={rank ? `as of ${snapshotLabel(capturedAt)}` : 'settles 7:30 AM/PM'}
          tone="brand"
        />
      </motion.div>

      {/* Recent points feed */}
      <motion.div variants={item}>
        <h2 className="mb-2 text-sm font-semibold text-muted">Recent points</h2>
        {events.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            No points yet — they'll show up here the moment your instructor awards them.
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {events.map((e) => (
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
                  <p className="text-xs capitalize text-muted">
                    {e.category} · {timeAgo(e.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </motion.div>
    </motion.div>
  )
}

function StatTile({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  note?: string
  tone: 'gold' | 'brand'
}) {
  return (
    <Card className="p-4">
      <div
        className={cn(
          'mb-2 flex h-9 w-9 items-center justify-center rounded-lg',
          tone === 'gold'
            ? 'bg-gold-400/15 text-gold-600 dark:text-gold-400'
            : 'bg-brand-500/10 text-brand-500',
        )}
      >
        {icon}
      </div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
      {note && <p className="mt-0.5 text-[0.65rem] text-muted/80">{note}</p>}
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-4 w-48 rounded bg-card-2" />
      <div className="h-44 rounded-2xl bg-card-2" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-2xl bg-card-2" />
        <div className="h-24 rounded-2xl bg-card-2" />
      </div>
      <div className="h-56 rounded-2xl bg-card-2" />
    </div>
  )
}
