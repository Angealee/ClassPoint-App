import { ErrorState } from '@/components/ui/EmptyState'
import { useCallback, useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { Avatar } from '@/components/ui/Avatar'
import { getSemesterLeaderboard, listSemesters } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { PastLeaderboardEntry, Semester } from '@/lib/types'
import { useStudentData } from './StudentData'

/**
 * A past semester's final leaderboard (0035).
 *
 * Deliberately a separate sheet rather than another option in the live board's
 * picker: that picker chooses which SECTIONS to show, and folding a second,
 * unrelated axis into it makes both harder to read.
 *
 * The board is recomputed from the ledger by `get_semester_leaderboard`, so it
 * includes students who have since been archived — they were on that board when
 * it counted.
 */
export function PastSemesterBoard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useStudentData()
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [pick, setPick] = useState('')
  const [rows, setRows] = useState<PastLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Past semesters only — the live board already covers the active one.
  useEffect(() => {
    if (!open) return
    listSemesters()
      .then((all) => {
        const past = all.filter((s) => !s.isActive)
        setSemesters(past)
        setPick((cur) => cur || (past[0]?.id ?? ''))
      })
      .catch(() => setError("Couldn't load past semesters."))
  }, [open])

  const load = useCallback(async () => {
    if (!pick) return
    setLoading(true)
    setError(null)
    try {
      setRows(await getSemesterLeaderboard(pick))
    } catch (e) {
      setError(errorText(e, "Couldn't load that leaderboard."))
    } finally {
      setLoading(false)
    }
  }, [pick])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const mine = me ? rows.find((r) => r.studentId === me.id) : null

  return (
    <Sheet open={open} onClose={onClose} title="Past semesters">
      {semesters.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No past semesters yet — this is the first one.
        </p>
      ) : (
        <div className="space-y-4">
          <Select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label="Choose semester"
            className="w-full"
          >
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>

          {/* Their own final placing, pulled out so they don't have to hunt. */}
          {mine && (
            <div className="rounded-xl bg-gold-400/15 p-3">
              <p className="text-xs text-muted">You finished</p>
              <p className="font-display text-lg font-bold text-reward">
                #{mine.rank} · {mine.points} points
              </p>
            </div>
          )}

          {loading ? (
            <ListSkeleton rows={5} />
          ) : error ? (
            <ErrorState inline onRetry={() => void load()}>
              {error}
            </ErrorState>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No points were recorded that semester.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {rows.map((r) => (
                <li
                  key={r.studentId}
                  className={cn(
                    'flex items-center gap-3 py-2.5',
                    r.studentId === me?.id && 'bg-gold-400/10',
                  )}
                >
                  <span className="w-7 shrink-0 text-center font-display text-sm font-bold tabular-nums text-muted">
                    {r.rank}
                  </span>
                  <Avatar name={r.displayName} url={r.avatarUrl} className="h-8 w-8 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.displayName}</p>
                    <p className="truncate text-xs text-muted">{r.sectionName}</p>
                  </div>
                  <span className="shrink-0 font-display text-sm font-bold tabular-nums">
                    {r.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  )
}
