import { useState } from 'react'
import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import { useNavigate } from 'react-router-dom'
import { Card, Rows } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import {
  BoltIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  TableIcon,
  TicketIcon,
} from '@/components/ui/icons'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { Meter } from '@/components/ui/Meter'
import { BadgeArt } from '@/components/achievements/BadgeArt'
import { PointEventRow } from '@/components/points/PointEventRow'
import { snapshotLabel } from '@/lib/time'
import { cn } from '@/lib/cn'
import { rateTone, tally } from '@/lib/attendance'
import { displayGrade } from '@/lib/grading'
import { TERM_TITLE, boostableCount, latestSoFar, type TermSummary } from '@/lib/student-grades'
import { TONE } from '@/lib/tone'
import type { AchievementState, MyAttendanceEntry, MyGradeSubject, MyGrades } from '@/lib/types'
import { useStudentData } from './StudentData'
import { HomeHero, NextMilestone } from './HomeHero'
import { LiveClassBanner } from './LiveClassBanner'
import { EventStartingBanner } from './EventStartingBanner'
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
  show: { opacity: 1, y: 0, transition: spring },
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
    grades,
    semesterEnded,
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

        <SemesterEndedBanner />
        <EventStartingBanner />
        <LiveClassBanner onScan={() => navigate('/app/attendance?scan=1')} />

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

        <GradesCard
          grades={grades}
          boostEnabled={!semesterEnded}
          onOpen={() => navigate('/app/grades')}
        />

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
        <Meter value={t.rate} tone={rateTone(t.rate)} size="sm" label="Attendance rate" className="mt-3" />
      </Card>
    </button>
  )
}

const GRADES_CARD_ROWS = 2

function GradesCard({
  grades,
  boostEnabled,
  onOpen,
}: {
  grades: MyGrades | null
  boostEnabled: boolean
  onOpen: () => void
}) {
  // Hidden on every visit: the Home card never shows a grade until the eye is tapped.
  const [reveal, setReveal] = useState(false)
  if (!grades?.enabled || !grades.figures) return null

  const rows: Array<{ subject: MyGradeSubject; latest: TermSummary }> = []
  for (const subject of grades.subjects) {
    const latest = latestSoFar(subject)
    if (latest) rows.push({ subject, latest })
  }

  if (rows.length === 0) return null

  const boostable = boostEnabled ? boostableCount(grades.subjects) : 0

  return (
    <motion.div variants={item} className="relative">
      <IconButton
        label={reveal ? 'Hide grades' : 'Show grades'}
        aria-pressed={reveal}
        size="sm"
        className="absolute right-9 top-4 z-10"
        onClick={() => setReveal((v) => !v)}
        icon={
          reveal ? <EyeIcon className="h-4.5 w-4.5" /> : <EyeOffIcon className="h-4.5 w-4.5" />
        }
      />
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <Card interactive>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                TONE.info.chip,
              )}
            >
              <TableIcon className="h-5.5 w-5.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold">Grades</p>
              <p className="text-xs text-muted">
                {boostable > 0
                  ? `${boostable} column${boostable === 1 ? '' : 's'} open for points assist`
                  : 'Based on what’s marked so far'}
              </p>
            </div>
            <span className="shrink-0 text-lg text-muted">›</span>
          </div>

          <div className="mt-3 divide-y divide-line border-t border-line">
            {rows.slice(0, GRADES_CARD_ROWS).map(({ subject, latest }) => (
              <div key={subject.subjectId} className="flex items-center gap-3 py-2 first:pt-3">
                <p className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{subject.code}</span>
                  <span className="text-muted"> · {TERM_TITLE[latest.term]} so far</span>
                </p>
                <span className="shrink-0 font-display text-lg font-bold tabular-nums">
                  {reveal ? displayGrade(latest.soFar) : '•••'}
                </span>
              </div>
            ))}
          </div>
          {rows.length > GRADES_CARD_ROWS && (
            <p className="pt-1 text-xs text-muted">
              + {rows.length - GRADES_CARD_ROWS} more subject
              {rows.length - GRADES_CARD_ROWS === 1 ? '' : 's'}
            </p>
          )}
        </Card>
      </button>
    </motion.div>
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
                ? 'Put points toward a quiz or activity grade.'
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
