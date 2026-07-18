import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { XpBar } from '@/components/ui/XpBar'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { BoltIcon, StarIcon, TicketIcon, TrophyIcon } from '@/components/ui/icons'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { BadgeArt } from '@/components/achievements/BadgeArt'
import { getLevelProgress } from '@/lib/leveling'
import { snapshotLabel, timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { AchievementState, PointEvent } from '@/lib/types'
import { useStudentData } from './StudentData'

/** Time-of-day greeting for a warmer welcome. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Group the feed into Today / Yesterday / dated sections (preserving order). */
function groupByDay(events: PointEvent[]): { label: string; items: PointEvent[] }[] {
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86_400_000).toDateString()
  const groups: { label: string; items: PointEvent[] }[] = []
  const byKey = new Map<string, { label: string; items: PointEvent[] }>()
  for (const e of events) {
    const key = new Date(e.created_at).toDateString()
    let group = byKey.get(key)
    if (!group) {
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : new Date(e.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      group = { label, items: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.items.push(e)
  }
  return groups
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

export function Dashboard() {
  const navigate = useNavigate()
  const {
    loading,
    error,
    me,
    events,
    live,
    rank,
    capturedAt,
    sectionName,
    refresh,
    achievements,
    hasUnseenAchievements,
  } = useStudentData()

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
    <PullToRefresh onRefresh={refresh}>
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={item} className="flex items-center gap-3">
        <Avatar name={me.display_name} url={me.avatar_url} className="h-11 w-11" />
        <p className="min-w-0 flex-1 text-sm text-muted">
          {greeting()}, <span className="font-semibold text-ink">{me.display_name}</span> ·{' '}
          {sectionName(me.section_id)}
        </p>
        <LiveBadge live={live} />
      </motion.div>

      {/* Level / XP hero */}
      <motion.div variants={item}>
        <Card className="overflow-hidden">
          <div className="relative bg-linear-to-br from-brand-500 to-brand-700 p-5 text-white sm:p-6">
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
                <span className="font-semibold text-white">
                  {progress.expToNext} pts to Level {progress.level + 1}
                </span>
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
          value={
            <motion.span
              // The colour/scale pop still fires on change; the number itself
              // now rolls up via AnimatedNumber instead of snapping.
              key={me.lifetime_points}
              initial={{ scale: 1.35, color: 'var(--color-gold-500)' }}
              animate={{ scale: 1, color: 'var(--color-ink)' }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="inline-block"
            >
              <AnimatedNumber value={me.lifetime_points} />
            </motion.span>
          }
          tone="gold"
        />
        <StatTile
          icon={<TrophyIcon className="h-5 w-5" />}
          label="Overall rank"
          value={rank ? `#${rank}` : '—'}
          note={rank ? `as of ${snapshotLabel(capturedAt)}` : 'settles 12:30 & 7:30 PM'}
          tone="brand"
        />
      </motion.div>

      {/* Use points — the only home-screen entry point to /app/points. */}
      <motion.div variants={item}>
        <UsePointsTeaser
          balance={me.lifetime_points}
          onOpen={() => navigate('/app/points')}
        />
      </motion.div>

      {/* Achievements teaser — the only home-screen entry point to the trophy case. */}
      {achievements.length > 0 && (
        <motion.div variants={item}>
          <AchievementsTeaser
            achievements={achievements}
            hasUnseen={hasUnseenAchievements}
            onOpen={() => navigate('/app/achievements')}
          />
        </motion.div>
      )}

      {/* Recent points feed — grouped by day. */}
      <motion.div variants={item}>
        <h2 className="mb-2 text-sm font-semibold text-muted">Recent points</h2>
        {events.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-600 dark:text-gold-400">
              <BoltIcon className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium">No points yet</p>
            <p className="max-w-xs text-xs text-muted">
              They'll show up here the moment your instructor awards them. Speak up in class to earn
              your first!
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {groupByDay(events).map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 px-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted/80">
                  {group.label}
                </p>
                <Card className="divide-y divide-line">
                  {group.items.map((e) => (
                    <FeedRow key={e.id} event={e} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </motion.div>
      </motion.div>
    </PullToRefresh>
  )
}

/** Home-screen entry point to the trophy case: a few badges + unlock count. */
function AchievementsTeaser({
  achievements,
  hasUnseen,
  onOpen,
}: {
  achievements: AchievementState[]
  hasUnseen: boolean
  onOpen: () => void
}) {
  const unlocked = achievements.filter((a) => a.unlockedAt)
  // Newest unlocked first; fall back to the first few locked ones to entice.
  const showcase = (
    unlocked.length
      ? [...unlocked].sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
      : achievements
  ).slice(0, 4)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open achievements"
      className="block w-full text-left"
    >
      <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-card-2">
        <div className="flex -space-x-3">
          {showcase.map((a) => (
            <BadgeArt
              key={a.code}
              code={a.code}
              category={a.category}
              state={a.unlockedAt ? 'unlocked' : a.secret ? 'secret' : 'locked'}
              isTitleGrantor={!!a.titleText}
              size="sm"
              className="rounded-2xl ring-2 ring-canvas"
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            Achievements
            {hasUnseen && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="New" />
            )}
          </p>
          <p className="text-xs text-muted">
            {unlocked.length} / {achievements.length} unlocked
          </p>
        </div>
        <span className="shrink-0 text-lg text-muted">›</span>
      </Card>
    </button>
  )
}

/** One row in the recent-points feed. */
function FeedRow({ event: e }: { event: PointEvent }) {
  const negative = e.points < 0
  return (
    <div className="flex items-center gap-3 p-4">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
          negative
            ? 'bg-red-500/10 text-red-500'
            : e.category === 'activity'
              ? 'bg-brand-500/10 text-brand-500'
              : 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
        )}
      >
        {negative ? e.points : `+${e.points}`}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {e.note ?? (negative ? 'Deduction' : 'Class points')}
        </p>
        <p className="text-xs capitalize text-muted">
          {e.category} · {timeAgo(e.created_at)}
        </p>
      </div>
    </div>
  )
}

/**
 * Home-screen entry to Use Points. Deliberately a card and not a 5th bottom
 * tab — four is the comfortable limit on a phone.
 */
function UsePointsTeaser({ balance, onOpen }: { balance: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-4 text-left transition-colors hover:bg-card-2"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-600 dark:text-gold-400">
        <TicketIcon className="h-5.5 w-5.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-bold">Use your points</span>
        <span className="block text-xs text-muted">
          {balance > 0
            ? `Put some of your ${balance} toward a quiz or activity grade.`
            : 'Earn points first, then cash them in for a better grade.'}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-brand-500">Open →</span>
    </button>
  )
}

/** Small pill that signals scores are updating in real time. */
function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider',
        live ? 'bg-brand-500/10 text-brand-500' : 'bg-card-2 text-muted',
      )}
      title={live ? 'Scores update instantly' : 'Reconnecting…'}
    >
      <span className="relative flex h-2 w-2">
        {live && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-brand-500"
            animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            live ? 'bg-brand-500' : 'bg-muted',
          )}
        />
      </span>
      {live ? 'Live' : 'Offline'}
    </span>
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
