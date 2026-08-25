import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { XpBar } from '@/components/ui/XpBar'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import {
  BoltIcon,
  FlameIcon,
  StarIcon,
  TargetIcon,
  TicketIcon,
  TrophyIcon,
} from '@/components/ui/icons'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { RankDelta } from '@/components/leaderboard/RankSignals'
import { getLevelProgress } from '@/lib/leveling'
import { snapshotLabel, timeAgo } from '@/lib/time'
import { termCalendar, termLabel, termOf, weekOf } from '@/lib/term'
import { cn } from '@/lib/cn'
import { listVariants, pressable, rowVariants } from '@/lib/motion'
import { NEUTRAL_STATUSES } from '@/lib/types'
import type { LeaderboardEntry, PointEvent } from '@/lib/types'
import { LiveClassBanner } from './LiveClassBanner'
import { SemesterEndedBanner } from './SemesterEndedBanner'
import { useStudentData } from './StudentData'

/** How many ledger rows the home feed shows before handing off to /app/history. */
const FEED_LIMIT = 5

/**
 * "1st Sem AY 2026–2027 · Midterm · Week 9".
 *
 * Outside every term — semester break, or a gap the instructor left when moving
 * dates around a holiday — the semester name stands alone. `weekOf` keeps
 * counting past the last term (it has no end to clamp to), so showing the week
 * there would read "Week 25" all through the break; and `termLabel(null)` is
 * the literal string "Outside term", which is true and unhelpful.
 */
function whereWeAre(): string {
  const now = new Date()
  const term = termOf(now)
  const name = termCalendar().semesterName
  return term ? `${name} · ${termLabel(term)} · Week ${weekOf(now)}` : name
}

/** Time-of-day greeting for a warmer welcome. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

/**
 * The student's home screen.
 *
 * Rebuilt around a shorter, harder hierarchy: ONE hero carrying level and
 * points together (they are the same quantity — points ARE the XP, so showing
 * them in separate cards split one idea in half), one dense strip of the three
 * "how am I doing" numbers, one row of places to go, and a short feed.
 *
 * The previous version stacked ten full-width blocks, four of which were
 * near-identical row cards in a row — so nothing stood out and the two numbers
 * that matter most sat seventh.
 */
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
    achievementProgress,
    attendance,
    leaderboard,
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

  // Level and XP track THIS SEMESTER (0029) — the race restarts each semester so
  // a new cohort isn't chasing totals banked over previous ones.
  const progress = getLevelProgress(me.semester_points)
  const streak = achievementProgress?.present_streak ?? null

  const countedClasses = attendance.filter((h) => !NEUTRAL_STATUSES.includes(h.status))
  const attendanceRate =
    countedClasses.length === 0
      ? null
      : Math.round(
          (countedClasses.filter((h) => h.status === 'present' || h.status === 'late').length /
            countedClasses.length) *
            100,
        )

  const myEntry = leaderboard.find((e) => e.student_id === me.id) ?? null
  const unlocked = achievements.filter((a) => a.unlockedAt).length

  return (
    <PullToRefresh onRefresh={refresh}>
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
        <motion.div variants={item} className="flex items-center gap-3">
          <Avatar name={me.display_name} url={me.avatar_url} className="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted">
              {greeting()}, <span className="font-semibold text-ink">{me.display_name}</span> ·{' '}
              {sectionName(me.section_id)}
            </p>
            {/* Where you are in the semester. The term drives the excuse window,
                the grading period and half the app's arithmetic. */}
            <p className="truncate text-[12px] text-muted/70">{whereWeAre()}</p>
          </div>
          <LiveBadge live={live} />
        </motion.div>

        {/* Read-only, because their semester is over (0035). */}
        <motion.div variants={item}>
          <SemesterEndedBanner />
        </motion.div>

        {/* Class is running right now (0033) — renders nothing when it isn't.
            Above the hero because it's the only time-critical thing here:
            points can be read any time, a check-in window cannot. */}
        <motion.div variants={item}>
          <LiveClassBanner />
        </motion.div>

        {/* Hero: level AND points. Tappable straight to the full ledger. */}
        <motion.div variants={item}>
          <Card className="overflow-hidden">
            <div className="relative bg-linear-to-br from-brand-500 to-brand-700 p-5 text-white sm:p-6">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-white/70">
                      Level
                    </p>
                    <p className="font-display text-5xl font-bold leading-none sm:text-6xl">
                      {progress.level}
                    </p>
                    <p className="mt-2 text-sm text-white/90">
                      <motion.span
                        // The colour/scale pop still fires on change; the number
                        // rolls up via AnimatedNumber rather than snapping.
                        key={me.semester_points}
                        initial={{ scale: 1.35 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        className="inline-block font-display text-xl font-bold"
                      >
                        <AnimatedNumber value={me.semester_points} />
                      </motion.span>{' '}
                      points this semester
                    </p>
                    <p className="text-xs text-white/60">{me.all_time_points} all-time</p>
                  </div>
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
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

        {/* The single nearest thing to chase. */}
        <motion.div variants={item}>
          <NextMilestone
            toNextLevel={progress.expToNext}
            nextLevel={progress.level + 1}
            myEntry={myEntry}
            leaderboard={leaderboard}
          />
        </motion.div>

        {/* The three "how am I doing" numbers, each a way in to its own screen. */}
        <motion.div variants={item}>
          <Card className="grid grid-cols-3 divide-x divide-line p-0">
            <StatCell
              label="Rank"
              onClick={() => navigate('/app/leaderboard')}
              value={rank ? `#${rank}` : '—'}
              note={rank ? snapshotLabel(capturedAt) : 'settles 12:30 & 7:30'}
              extra={myEntry ? <RankDelta entry={myEntry} /> : null}
            />
            <StatCell
              label="Streak"
              onClick={() => navigate('/app/attendance/stats')}
              value={streak === null ? '—' : `${streak}`}
              icon={streak !== null && streak > 0 ? <FlameIcon aria-hidden className="h-4 w-4 text-orange-500" /> : undefined}
              note={streak && streak > 0 ? 'in a row' : 'be present next class'}
            />
            <StatCell
              label="Attended"
              onClick={() => navigate('/app/attendance/stats')}
              value={attendanceRate === null ? '—' : `${attendanceRate}%`}
              note={
                countedClasses.length === 0
                  ? 'no classes yet'
                  : `${countedClasses.length} classes`
              }
            />
          </Card>
        </motion.div>

        {/* Places to go. Was four stacked full-width cards. */}
        <motion.div variants={item}>
          <div className="grid grid-cols-3 gap-3">
            <ActionTile
              icon={<TicketIcon className="h-5 w-5" />}
              label="Use points"
              note={me.semester_points > 0 ? `${me.semester_points} to spend` : 'earn first'}
              tone="gold"
              onClick={() => navigate('/app/points')}
            />
            <ActionTile
              icon={<TrophyIcon className="h-5 w-5" />}
              label="Badges"
              note={achievements.length > 0 ? `${unlocked} of ${achievements.length}` : '—'}
              tone="brand"
              dot={hasUnseenAchievements}
              onClick={() => navigate('/app/achievements')}
            />
            <ActionTile
              icon={<BoltIcon className="h-5 w-5" />}
              label="Stats"
              note="attendance"
              tone="emerald"
              onClick={() => navigate('/app/attendance/stats')}
            />
          </div>
        </motion.div>

        {/* Recent points — the five most recent, then hand off to the full ledger. */}
        <motion.div variants={item}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-muted">Recent points</h2>
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/app/history')}
                className="text-[13px] font-semibold text-brand-500"
              >
                See all →
              </button>
            )}
          </div>
          {events.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-600 dark:text-gold-400">
                <BoltIcon className="h-6 w-6" />
              </span>
              <p className="text-[15px] font-medium">No points yet</p>
              <p className="max-w-xs text-[13px] text-muted">
                They'll show up here the moment your instructor awards them. Speak up in class to
                earn your first!
              </p>
            </Card>
          ) : (
            <Card className="divide-y divide-line">
              {/* Flat, not grouped by day: across five rows, Today/Yesterday
                  headers cost a line each and say less than the per-row time.
                  Rows reveal one after another — five is few enough that the
                  stagger reads as deliberate rather than slow. */}
              <motion.div variants={listVariants} initial="hidden" animate="show">
                {events.slice(0, FEED_LIMIT).map((e) => (
                  <FeedRow key={e.id} event={e} />
                ))}
              </motion.div>
            </Card>
          )}
        </motion.div>
      </motion.div>
    </PullToRefresh>
  )
}

/**
 * The nearest target, whichever it happens to be.
 *
 * Compares the points needed to level up against the points needed to overtake
 * the student directly above on the board, and names the smaller one. Always
 * showing the level would hide the fact that a single recitation sometimes
 * gains a place — which is the more motivating of the two.
 */
function NextMilestone({
  toNextLevel,
  nextLevel,
  myEntry,
  leaderboard,
}: {
  toNextLevel: number
  nextLevel: number
  myEntry: LeaderboardEntry | null
  leaderboard: LeaderboardEntry[]
}) {
  let overtake: { pts: number; rank: number } | null = null
  if (myEntry) {
    const idx = leaderboard.findIndex((e) => e.student_id === myEntry.student_id)
    const above = idx > 0 ? leaderboard[idx - 1] : null
    // +1 because matching their total isn't passing it.
    if (above) overtake = { pts: Math.max(1, above.points - myEntry.points + 1), rank: above.rank }
  }

  const useOvertake = overtake !== null && overtake.pts <= toNextLevel
  const text = useOvertake
    ? `${overtake!.pts} more point${overtake!.pts === 1 ? '' : 's'} to pass #${overtake!.rank}`
    : `${toNextLevel} more point${toNextLevel === 1 ? '' : 's'} to reach Level ${nextLevel}`

  return (
    <div className="flex items-center gap-2 rounded-xl bg-card-2 px-4 py-2.5">
      <TargetIcon aria-hidden className="h-4 w-4 shrink-0 text-brand-500" />
      <p className="min-w-0 flex-1 truncate text-[13px]">
        <span className="font-semibold">Next up:</span>{' '}
        <span className="text-muted">{text}</span>
      </p>
    </div>
  )
}

/** One cell of the three-up stat strip. Tapping opens the screen it summarises. */
function StatCell({
  label,
  value,
  note,
  icon,
  extra,
  onClick,
}: {
  label: string
  value: string
  note?: string
  icon?: React.ReactNode
  extra?: React.ReactNode
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      {...pressable}
      className="flex flex-col items-center justify-center px-1 py-4 transition-colors hover:bg-card-2"
    >
      <span className="flex items-center gap-1">
        {icon && <span aria-hidden>{icon}</span>}
        <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
      </span>
      {extra}
      <span className="mt-0.5 text-[13px] font-medium">{label}</span>
      {note && <span className="text-[11px] text-muted/80">{note}</span>}
    </motion.button>
  )
}

const TILE_TONE = {
  gold: 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
  brand: 'bg-brand-500/10 text-brand-500',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
} as const

/** One quick-action tile. Replaces what used to be a full-width teaser card. */
function ActionTile({
  icon,
  label,
  note,
  tone,
  dot,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  note: string
  tone: keyof typeof TILE_TONE
  dot?: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      {...pressable}
      className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-card p-3 transition-colors hover:bg-card-2"
    >
      {dot && (
        <span
          className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-500"
          aria-label="New"
        />
      )}
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          TILE_TONE[tone],
        )}
      >
        {icon}
      </span>
      <span className="text-[13px] font-semibold leading-tight">{label}</span>
      <span className="text-[11px] leading-tight text-muted/80">{note}</span>
    </motion.button>
  )
}

/** One row in the recent-points feed. */
function FeedRow({ event: e }: { event: PointEvent }) {
  const negative = e.points < 0
  return (
    <motion.div variants={rowVariants} className="flex items-center gap-3 p-4">
      <span
        className={cn(
          'flex h-9 w-11 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold tabular-nums',
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
        <p className="truncate text-[15px] font-medium">
          {e.note ?? (negative ? 'Deduction' : 'Class points')}
        </p>
        <p className="text-[13px] capitalize text-muted">{e.category}</p>
      </div>
      <span className="shrink-0 text-[13px] text-muted">{timeAgo(e.created_at)}</span>
    </motion.div>
  )
}

/** Small pill that signals scores are updating in real time. */
function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
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

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-4 w-48 rounded bg-card-2" />
      <div className="h-56 rounded-2xl bg-card-2" />
      <div className="h-10 rounded-xl bg-card-2" />
      <div className="h-24 rounded-2xl bg-card-2" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-24 rounded-2xl bg-card-2" />
        <div className="h-24 rounded-2xl bg-card-2" />
        <div className="h-24 rounded-2xl bg-card-2" />
      </div>
      <div className="h-56 rounded-2xl bg-card-2" />
    </div>
  )
}
