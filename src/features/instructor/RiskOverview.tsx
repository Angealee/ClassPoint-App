import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { Avatar } from '@/components/ui/Avatar'
import { getAbsenceRisk } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { AbsenceRisk } from '@/lib/types'

/**
 * Who needs attention, across every section at once (Phase G).
 *
 * Ranked by what you can still DO about it: `actionable` counts absences still
 * inside the 7-day excuse window, so the top of this list is the set of
 * students an admission slip can still help today. A show-up-rate ranking would
 * put the unreachable cases first and make the list something to feel bad about
 * rather than act on.
 */
export function RiskOverview() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<AbsenceRisk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getAbsenceRisk()
      // Actionable first (something can still be done), then by how many
      // absences have piled up, then most recent.
      data.sort(
        (a, b) =>
          b.actionable - a.actionable ||
          b.unexcused - a.unexcused ||
          (b.lastAbsenceAt ?? '').localeCompare(a.lastAbsenceAt ?? ''),
      )
      setRows(data)
    } catch (e) {
      setError(errorText(e, "Couldn't load the risk overview."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const actionable = rows.filter((r) => r.actionable > 0)
  const shown = showAll ? rows : rows.slice(0, 8)

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Needs attention</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted">
        Unexcused absences across every section. “Can still excuse” means the
        7-day window is open — those are the ones worth chasing today.
      </p>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-accent">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nobody has an unexcused absence right now. Genuinely good.
        </p>
      ) : (
        <>
          {actionable.length > 0 && (
            <p className="mb-3 rounded-xl bg-gold-400/15 px-3 py-2 text-xs text-reward">
              {actionable.length} student{actionable.length === 1 ? '' : 's'} can still
              file an excuse. After the window closes the absence is permanent.
            </p>
          )}

          <div className="divide-y divide-line">
            {shown.map((r) => (
              <button
                key={r.studentId}
                type="button"
                onClick={() => navigate(`/teach/student/${r.studentId}`)}
                className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-card-2"
              >
                <Avatar name={r.displayName} url={null} className="h-8 w-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.displayName}</p>
                  <p className="truncate text-xs text-muted">{r.sectionName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      'font-display text-sm font-bold tabular-nums',
                      r.actionable > 0 ? 'text-reward' : 'text-muted',
                    )}
                  >
                    {r.unexcused}
                  </p>
                  <p className="text-2xs text-muted">
                    {r.actionable > 0 ? `${r.actionable} can still excuse` : 'window closed'}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {rows.length > 8 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </Button>
          )}
        </>
      )}
    </Card>
  )
}
