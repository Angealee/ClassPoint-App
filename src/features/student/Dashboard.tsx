import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Card, Rows } from '@/components/ui/Card'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Avatar } from '@/components/ui/Avatar'
import { BoltIcon, CheckIcon, TicketIcon } from '@/components/ui/icons'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { Meter } from '@/components/ui/Meter'
import { BadgeArt } from '@/components/achievements/BadgeArt'
import { snapshotLabel, timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { rateTone, tally } from '@/lib/attendance'
import type { AchievementState, MyAttendanceEntry, PointEvent } from '@/lib/types'
import { useStudentData } from './StudentData'
import { HomeHero, NextMilestone } from './HomeHero'
import { LiveClassBanner } from './LiveClassBanner'
import { SemesterEndedBanner } from './SemesterEndedBanner'

/** How many feed rows the home screen shows before "See all". */
const FEED_ROWS = 5

/** Time-of-day greeting for a warmer welcome. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
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
    leaderboard,
    capturedAt,
    sectionName,
    refresh,
    achievements,
    hasUnseenAchievements,
    achievementProgress,
    attendance,
  } = useStudentData()

  if (loading) return <DashboardSkeleton />

  if (error) {
    return (
      <ErrorState
        onRetry={() => void refresh()}
        detail="Your points are safe — this is just the connection."
      >
        Couldn't load your dashboard.
      </ErrorState>
    )
  }

  if (!me) {
    return (
      <EmptyState>
        We couldn't find your student record. Ask your CEO to check your class list entry.
      </EmptyState>
    )
  }

  // Points needed to pass the student ranked directly above. Null when we can't
  // tell (unranked, already first, or the board hasn't settled yet) — in which
  // case NextMilestone falls back to the level, which is always knowable.
  const above = rank && rank > 1 ? leaderboard.find((e) => e.rank === rank - 1) : undefined
  const pointsToOvertake = above ? Math.max(1, above.points - me.semester_points + 1) : null

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

        {/* Conditional alerts. Both render nothing when they don't apply, so they
            cost no space on an ordinary day — and Home previously had no
            live-class signal at all, only a realtime-connection pill. */}
        <SemesterEndedBanner />
        <LiveClassBanner onScan={() => navigate('/app/attendance?scan=1')} />

        {/* The scoreboard: level, points, XP, rank and streak as ONE object. */}
        <motion.div variants={item}>
          <HomeHero
            points={me.semester_points}
            allTimePoints={me.all_time_points}
            rank={rank}
            rankNote={rank ? `as of ${snapshotLabel(capturedAt)}` : undefined}
            streak={achievementProgress?.present_streak ?? null}
          />
        </motion.div>

        <motion.div variants={item}>
          <NextMilestone points={me.semester_points} pointsToOvertake={pointsToOvertake} />
        </motion.div>

        <motion.div variants={item}>
          <AttendanceCard
            attendance={attendance}
            onOpen={() => navigate('/app/attendance/stats')}
          />
        </motion.div>

        {/* The only home-screen entry point to /app/points. */}
        <motion.div variants={item}>
          <UsePointsTeaser balance={me.semester_points} onOpen={() => navigate('/app/points')} />
        </motion.div>

        {/* The only home-screen entry point to the trophy case. */}
        {achievements.length > 0 && (
          <motion.div variants={item}>
            <AchievementsTeaser
              achievements={achievements}
              hasUnseen={hasUnseenAchievements}
              onOpen={() => navigate('/app/achievements')}
            />
          </motion.div>
        )}

        {/* Recent points. FLAT, not grouped by day: across five rows the
            Today/Yesterday headers cost a line each and say less than the
            per-row relative time already does. */}
        <motion.div variants={item}>
          <SectionLabel
            action={
              events.length > FEED_ROWS ? (
                <button
                  type="button"
                  onClick={() => navigate('/app/history')}
                  className="shrink-0 text-xs font-semibold text-accent"
                >
                  See all
                </button>
              ) : undefined
            }
          >
            Recent points
          </SectionLabel>
          {events.length === 0 ? (
            <EmptyState
              icon={
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/15 text-reward">
                  <BoltIcon className="h-6 w-6" />
                </span>
              }
              description="They'll show up here the moment your instructor awards them. Speak up in class to earn your first!"
            >
              No points yet
            </EmptyState>
          ) : (
            <Rows>
              {events.slice(0, FEED_ROWS).map((e) => (
                <FeedRow key={e.id} event={e} />
              ))}
            </Rows>
          )}
        </motion.div>
      </motion.div>
    </PullToRefresh>
  )
}

/**
 * Show-up rate at a glance, linking to the full stats screen.
 *
 * Reads `attendance` off StudentData, which already loads it off the critical
 * path — this card fires no query of its own.
 */
function AttendanceCard({
  attendance,
  onOpen,
}: {
  attendance: MyAttendanceEntry[]
  onOpen: () => void
}) {
  const t = tally(attendance)
  if (t.counted === 0) return null
  const showed = t.present + t.late

  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <Card interactive>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-solid/10 text-success">
            <CheckIcon className="h-5.5 w-5.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">Attendance</p>
            <p className="text-xs text-muted">
              {showed} of {t.counted} classes
            </p>
          </div>
          <span className="shrink-0 font-display text-xl font-bold tabular-nums">{t.rate}%</span>
        </div>
        <Meter value={t.rate} tone={rateTone(t.rate)} size="sm" label="Show-up rate" className="mt-3" />
      </Card>
    </button>
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
      <Card interactive>
        <div className="flex items-center gap-3">
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
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-accent-solid"
                  aria-label="New"
                />
              )}
            </p>
            <p className="text-xs text-muted">
              {unlocked.length} / {achievements.length} unlocked
            </p>
          </div>
          <span className="shrink-0 text-lg text-muted">›</span>
        </div>
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
            ? 'bg-danger-solid/10 text-danger'
            : e.category === 'activity'
              ? 'bg-accent-solid/10 text-accent'
              : 'bg-gold-400/15 text-reward',
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
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <Card interactive>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-reward">
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
          <span className="shrink-0 text-lg text-muted">›</span>
        </div>
      </Card>
    </button>
  )
}

/** Small pill that signals scores are updating in real time. */
function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider',
        live ? 'bg-success-solid/10 text-success' : 'bg-card-2 text-muted',
      )}
      title={live ? 'Scores update instantly' : 'Reconnecting…'}
    >
      <span className="relative flex h-2 w-2">
        {live && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-success-solid"
            animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            live ? 'bg-success-solid' : 'bg-muted',
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
      <div className="h-11 w-full rounded-lg bg-card-2" />
      <div className="h-56 rounded-2xl bg-card-2" />
      <div className="h-4 w-48 rounded-lg bg-card-2" />
      <div className="h-20 rounded-2xl bg-card-2" />
      <div className="h-20 rounded-2xl bg-card-2" />
      <div className="h-64 rounded-2xl bg-card-2" />
    </div>
  )
}
