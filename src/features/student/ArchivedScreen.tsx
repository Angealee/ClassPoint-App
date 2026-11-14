import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorState } from '@/components/ui/EmptyState'
import { Logo } from '@/components/ui/Logo'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Stat } from '@/components/ui/Stat'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { SilentBoard } from '@/components/leaderboard/SilentBoard'
import { getSemesterLeaderboard, listSections, listSemesters } from '@/lib/api'
import { tally } from '@/lib/attendance'
import { errorText } from '@/lib/errors'
import { getLevelProgress } from '@/lib/leveling'
import { useAuth } from '@/lib/auth'
import type { Semester } from '@/lib/types'
import { ArchivedFarewell } from './ArchivedFarewell'
import { useStudentData } from './StudentData'

export function ArchivedScreen() {
  const { me, leaderboard, achievements, attendance } = useStudentData()
  const { signOut } = useAuth()

  const [semester, setSemester] = useState<Semester | null>(null)
  const [sectionName, setSectionName] = useState<string | null>(null)
  const [finalPoints, setFinalPoints] = useState<number | null>(null)
  const [finalRank, setFinalRank] = useState<number | null>(null)
  const [rankedTotal, setRankedTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [farewellDone, setFarewellDone] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const load = useCallback(async () => {
    if (!me) return
    setLoading(true)
    setLoadError(null)
    try {
      const [sections, semesters] = await Promise.all([listSections(), listSemesters()])
      const mine = sections.find((s) => s.id === me.section_id) ?? null
      setSectionName(mine?.name ?? null)

      const sem = mine ? (semesters.find((s) => s.id === mine.semesterId) ?? null) : null
      setSemester(sem)

      if (sem) {
        const board = await getSemesterLeaderboard(sem.id)
        setRankedTotal(board.length)
        const row = board.find((r) => r.studentId === me.id) ?? null
        setFinalPoints(row?.points ?? 0)
        setFinalRank(row?.rank ?? null)
      }
    } catch (e) {
      setLoadError(errorText(e, 'Could not load your record.'))
    } finally {
      setLoading(false)
    }
  }, [me])

  useEffect(() => {
    void load()
  }, [load])

  const rate = useMemo(() => {
    if (!semester || semester.terms.length === 0) return tally(attendance).rate
    const from = semester.terms[0].startsOn
    const to = semester.terms[semester.terms.length - 1].endsOn
    const mine = attendance.filter((h) => {
      const day = h.startedAt.slice(0, 10)
      return day >= from && day <= to
    })
    return tally(mine).rate
  }, [attendance, semester])

  const badges = useMemo(
    () => achievements.filter((a) => a.unlockedAt !== null).length,
    [achievements],
  )

  const top = leaderboard.slice(0, 10)
  const silent = top.length === 0 || top.every((e) => e.points === 0)

  if (!farewellDone) {
    return (
      <ArchivedFarewell
        semesterName={semester?.name ?? null}
        message={semester?.farewellMessage ?? null}
        onDone={() => setFarewellDone(true)}
      />
    )
  }

  const level = getLevelProgress(finalPoints ?? 0).level

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-4 pb-16 pt-6 md:px-8">
      <header className="flex items-center gap-3">
        <Logo className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold leading-tight">
            {me?.display_name ?? 'Your record'}
          </h1>
          <p className="truncate text-sm text-muted">
            {[sectionName, semester?.name].filter(Boolean).join(' · ') || 'Archived'}
          </p>
        </div>
      </header>

      {loadError ? (
        <ErrorState className="mt-6" onRetry={() => void load()}>
          {loadError}
        </ErrorState>
      ) : loading ? (
        <div className="mt-6">
          <ListSkeleton rows={4} />
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-plate-2 to-plate shadow-lg shadow-black/25 ring-1 ring-white/10">
            <div className="relative p-5">
              <div
                aria-hidden
                className="pointer-events-none absolute -left-8 -top-12 h-36 w-36 rounded-full bg-gold-400/12 blur-3xl"
              />
              <p className="relative text-2xs font-semibold uppercase tracking-widest text-white/60">
                How you finished
              </p>
              <div className="relative mt-1 flex items-end justify-between gap-4">
                <p className="min-w-0 font-display text-5xl font-bold leading-none text-white">
                  {finalRank !== null ? (
                    <span className="tabular-nums">#{finalRank}</span>
                  ) : (
                    <span className="text-2xl">Unranked</span>
                  )}
                </p>
                <p className="min-w-0 text-right">
                  <span className="block text-2xs font-semibold uppercase tracking-widest text-white/60">
                    Points
                  </span>
                  <span className="block font-display text-3xl font-bold leading-none tabular-nums text-gold-300">
                    {finalPoints ?? 0}
                  </span>
                </p>
              </div>
              <p className="relative mt-3 border-t border-white/10 pt-3 text-2xs text-white/55">
                {finalRank !== null
                  ? `Level ${level} · out of ${rankedTotal} on the board`
                  : `Level ${level}`}
              </p>
            </div>
          </div>

          <Card pad="none" className="mt-4">
            <div className="grid grid-cols-3 divide-x divide-line py-4">
              <Stat value={me?.all_time_points ?? 0} label="All-time points" tone="reward" />
              <Stat value={badges} label={badges === 1 ? 'Badge' : 'Badges'} />
              <Stat value={`${rate}%`} label="Attendance rate" />
            </div>
          </Card>

          <SectionLabel className="mt-6">The board right now</SectionLabel>
          {silent ? (
            <SilentBoard
              className="mt-2"
              detail="A new semester has started. It fills up as points are awarded."
            />
          ) : (
            <div className="mt-2">
              <PodiumBoard entries={top} showSection rankSignals />
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted">
            Your record is kept. If you take a class with this instructor again, your
            account comes back with your badges and all-time points intact.
          </p>

          <Button
            variant="ghost"
            className="mt-4 w-full text-danger"
            onClick={() => setSignOutOpen(true)}
          >
            Sign out
          </Button>
        </>
      )}

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        message="You'll need your username and PIN to get back in."
        confirmLabel="Sign out"
        busy={signingOut}
        onConfirm={() => {
          setSigningOut(true)
          void signOut().finally(() => setSigningOut(false))
        }}
        onClose={() => setSignOutOpen(false)}
      />
    </div>
  )
}
