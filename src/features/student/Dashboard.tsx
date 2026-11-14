import { useState } from 'react'
import { motion } from 'framer-motion'
import { pop, settle, spring } from '@/lib/motion'
import { useNavigate } from 'react-router-dom'
import { Card, Rows } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { BoltIcon, TableIcon, TicketIcon } from '@/components/ui/icons'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { BadgeArt } from '@/components/achievements/BadgeArt'
import { PointEventRow } from '@/components/points/PointEventRow'
import { snapshotLabel } from '@/lib/time'
import { cn } from '@/lib/cn'
import { rateTone, tally } from '@/lib/attendance'
import { TONE } from '@/lib/tone'
import type { AchievementState, MyAttendanceEntry } from '@/lib/types'
import { useStudentData } from './StudentData'
import { HomeGreeting } from '@/components/home/HomeGreeting'
import { dayPart } from '@/lib/time-of-day'
import { homeMessage } from '@/lib/home-message'
import { HomeHero } from './HomeHero'
import { LiveClassBanner } from './LiveClassBanner'
import { EventStartingBanner } from './EventStartingBanner'
import { SemesterEndedBanner } from './SemesterEndedBanner'

/** How many feed rows the home screen shows before "See all". */
const FEED_ROWS = 5

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
/** Tiles lift 2px with a soft glow, like the Student Space tiles. */
const TILE =
  'block w-full rounded-2xl text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-info-solid/15 active:translate-y-0'

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring },
}

export function Dashboard() {
  const navigate = useNavigate()
  const {
    loading,
    error,
    me,
    events,
    rank,
    leaderboard,
    capturedAt,
    sectionName,
    refresh,
    achievements,
    hasUnseenAchievements,
    achievementProgress,
    attendance,
    grades,
  } = useStudentData()

  // Read once on mount: the sky and greeting reflect when you opened the app.
  const [hour] = useState(() => new Date().getHours())

  if (loading) return <DashboardSkeleton />

  if (error) {
    return (
      <ErrorState
        onRetry={() => void refresh()}
        detail="Your points are safe, this is just the connection."
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

  const above = rank && rank > 1 ? leaderboard.find((e) => e.rank === rank - 1) : undefined
  const pointsToOvertake = above ? Math.max(1, above.points - me.semester_points + 1) : null

  // Grades are "up" when the instructor has switched figures on. The full grades
  // card is gone from Home; this one strip just says so and routes to the screen.
  const gradesUp = !!grades?.enabled && !!grades.figures

  const streak = achievementProgress?.present_streak ?? null
  const message = homeMessage({ rank, streak, part: dayPart(hour) })

  return (
    <PullToRefresh onRefresh={refresh}>
      {/* The reading column, 4px wider than the shell gives it (2px a side). */}
      <motion.div variants={container} initial="hidden" animate="show" className="-mx-0.5 space-y-5">
        <motion.div variants={item}>
          <HomeGreeting
            hour={hour}
            name={me.display_name}
            sectionId={me.section_id}
            sectionName={sectionName(me.section_id)}
            message={message}
          />
        </motion.div>

        <SemesterEndedBanner />
        <EventStartingBanner />
        <LiveClassBanner onScan={() => navigate('/app/attendance?scan=1')} />

        {/* z-20: the rank card's popover hangs below the scoreboard and must paint over what follows. */}
        <motion.div variants={item} className="relative z-20">
          <HomeHero
            points={me.semester_points}
            avatarName={me.display_name}
            avatarUrl={me.avatar_url}
            rank={rank}
            rankNote={rank ? `as of ${snapshotLabel(capturedAt)}` : undefined}
            pointsToOvertake={pointsToOvertake}
            streak={streak}
          />
        </motion.div>

        <motion.div variants={item}>
          <AttendanceCard attendance={attendance} onOpen={() => navigate('/app/attendance/stats')} />
        </motion.div>

        {gradesUp && (
          <motion.div variants={item}>
            <GradesUpStrip onOpen={() => navigate('/app/grades')} />
          </motion.div>
        )}

        <motion.div variants={item}>
          <UsePointsTeaser balance={me.semester_points} onOpen={() => navigate('/app/points')} />
        </motion.div>

        {achievements.length > 0 && (
          <motion.div variants={item}>
            <AchievementsTeaser
              achievements={achievements}
              hasUnseen={hasUnseenAchievements}
              onOpen={() => navigate('/app/achievements')}
            />
          </motion.div>
        )}

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
                <PointEventRow key={e.id} event={e} />
              ))}
            </Rows>
          )}
        </motion.div>
      </motion.div>
    </PullToRefresh>
  )
}

/** Ring stroke by rate band: complete literals so Tailwind can see them. */
const RING_STROKE = {
  success: 'stroke-success-solid',
  warn: 'stroke-warn-solid',
  danger: 'stroke-danger-solid',
} as const

const DOT_CLASS: Record<MyAttendanceEntry['status'], string> = {
  present: 'bg-success-solid',
  late: 'bg-warn-solid',
  absent: 'bg-danger-solid',
  excused: 'bg-muted/40',
  irregular: 'bg-muted/40',
}

const RECENT_DOTS = 8

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
  const tone = rateTone(t.rate)

  // Oldest to newest, so the newest class sits at the right edge.
  const recent = [...attendance]
    .sort((x, y) => x.startedAt.localeCompare(y.startedAt))
    .slice(-RECENT_DOTS)
  const recentWords = recent.map((e) => e.status).join(', ')

  return (
    <button type="button" onClick={onOpen} className={TILE}>
      <Card interactive>
        <div className="flex items-center gap-4">
          <div
            className="relative h-14 w-14 shrink-0"
            role="img"
            aria-label={`Attendance rate ${t.rate} percent`}
          >
            <svg viewBox="0 0 56 56" className="h-full w-full" aria-hidden>
              <circle cx="28" cy="28" r="24" fill="none" strokeWidth="5" className="stroke-line" />
              <motion.circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                className={RING_STROKE[tone]}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: Math.max(0.02, t.rate / 100) }}
                transition={settle}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold tabular-nums">
              {t.rate}%
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">Attendance</p>
            <p className="text-xs text-muted">
              {showed} of {t.counted} classes
            </p>
          </div>
          <span className="shrink-0 text-lg text-muted">›</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted">
            Last {recent.length} {recent.length === 1 ? 'class' : 'classes'}
          </span>
          <span className="flex items-center gap-1.5" role="img" aria-label={recentWords}>
            {recent.map((e, i) => (
              <motion.span
                key={e.recordId}
                aria-hidden
                className={cn('h-2.5 w-2.5 rounded-full', DOT_CLASS[e.status])}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...pop, delay: 0.3 + i * 0.045 }}
              />
            ))}
          </span>
        </div>
      </Card>
    </button>
  )
}

/** One line that says grades are up. No figures here; the grades screen owns those. */
function GradesUpStrip({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={TILE}>
      <div
        className={cn(
          'relative flex items-center gap-3 overflow-hidden rounded-2xl border border-info-solid/30 px-4 py-3',
          'bg-gradient-to-r from-info-solid/15 via-info-solid/8 to-transparent',
        )}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="cp-sheen absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
        <span
          className={cn(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            TONE.info.chip,
          )}
        >
          <TableIcon className="h-5 w-5" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block font-display text-sm font-bold">Your grades are up</span>
          <span className="block text-xs text-muted">Tap to see how you did.</span>
        </span>
        <span className="relative shrink-0 text-lg text-muted">›</span>
      </div>
    </button>
  )
}

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
      className={TILE}
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

/**
 * The "use your points" door, drawn as a ticket stub: icon stub, a dashed
 * perforation, then the action. Same shape as the sign-in ClaimDoor. It does NOT
 * quote a balance: this screen has no pending-request data, so any figure here
 * could disagree with the smaller "available" number on the next screen.
 */
function UsePointsTeaser({ balance, onOpen }: { balance: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={cn(TILE, 'group')}>
      <span
        className={cn(
          'flex items-stretch overflow-hidden rounded-2xl border border-reward-solid/35',
          'bg-gradient-to-r from-reward-solid/15 to-reward-solid/5',
          'transition-colors group-hover:from-reward-solid/25 group-hover:to-reward-solid/10',
        )}
      >
        <span className="flex w-16 shrink-0 items-center justify-center bg-reward-solid/10 text-reward">
          <TicketIcon className="h-7 w-7 transition-transform group-hover:-rotate-6" />
        </span>
        <span aria-hidden className="w-0 shrink-0 border-l border-dashed border-reward-solid/40" />
        <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4">
          <span className="min-w-0">
            <span className="block font-display text-sm font-bold text-reward">Use your points</span>
            <span className="block text-xs text-muted">
              {balance > 0
                ? 'Put points toward a quiz or activity grade.'
                : 'Earn points first, then cash them in for a better grade.'}
            </span>
          </span>
          <span className="ml-auto shrink-0 text-lg text-reward transition-transform group-hover:translate-x-0.5">
            ›
          </span>
        </span>
      </span>
    </button>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}
