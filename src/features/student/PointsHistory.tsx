import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { listStudentEvents, type EventCursor } from '@/lib/api'
import { groupByWeek, weekLabel, termLabel } from '@/lib/term'
import { timeAgo } from '@/lib/time'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { TONE } from '@/lib/tone'
import type { PointCategory, PointEvent } from '@/lib/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { useStudentData } from './StudentData'

const PAGE = 40

/** Display metadata per ledger category. Mirrors the Dashboard feed's colours. */
const CATEGORY_META: Record<PointCategory, { label: string; dot: string; text: string }> = {
  recitation: { label: 'Recitation', dot: TONE.reward.dot, text: TONE.reward.text },
  activity: { label: 'Activities', dot: TONE.accent.dot, text: TONE.accent.text },
  penalty: { label: 'Penalties', dot: TONE.danger.dot, text: TONE.danger.text },
  redeem: { label: 'Spent', dot: TONE.neutral.dot, text: TONE.neutral.text },
}

/**
 * The full points ledger (Phase F).
 *
 * The Dashboard shows the most recent 20 and stops — there was no way to see
 * anything older, and no way to see the SHAPE of how you're doing. This screen
 * pages back through the whole semester and puts a per-week chart on top.
 */
export function PointsHistory() {
  const { me } = useStudentData()
  const [events, setEvents] = useState<PointEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // False once a page comes back short — that's the end of the ledger.
  const [hasMore, setHasMore] = useState(true)

  const load = useCallback(async () => {
    if (!me) return
    setLoading(true)
    setError(null)
    try {
      const first = await listStudentEvents(me.id, PAGE)
      setEvents(first)
      setHasMore(first.length === PAGE)
    } catch (e) {
      setError(errorText(e, "Couldn't load your points history."))
    } finally {
      setLoading(false)
    }
  }, [me])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore() {
    if (!me || loadingMore || events.length === 0) return
    setLoadingMore(true)
    setError(null)
    try {
      const last = events[events.length - 1]
      const cursor: EventCursor = { created_at: last.created_at, id: last.id }
      const next = await listStudentEvents(me.id, PAGE, cursor)
      // Defensive de-dupe: a keyset cursor shouldn't repeat a row, but appending
      // blind would render duplicate React keys if it ever did.
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...prev, ...next.filter((e) => !seen.has(e.id))]
      })
      setHasMore(next.length === PAGE)
    } catch (e) {
      setError(errorText(e, "Couldn't load older points."))
    } finally {
      setLoadingMore(false)
    }
  }

  /** Per-week net totals, oldest → newest, for the bar chart. */
  const weeks = useMemo(() => {
    const groups = groupByWeek(events, (e) => e.created_at)
    return groups
      .map((g) => ({
        week: g.week,
        term: g.term,
        net: g.items.reduce((sum, e) => sum + e.points, 0),
        earned: g.items.reduce((sum, e) => (e.points > 0 ? sum + e.points : sum), 0),
        lost: g.items.reduce((sum, e) => (e.points < 0 ? sum + e.points : sum), 0),
      }))
      .sort((a, b) => a.week - b.week)
  }, [events])

  /** Totals by category across everything loaded. */
  const split = useMemo(() => {
    const totals = { recitation: 0, activity: 0, penalty: 0, redeem: 0 } as Record<
      PointCategory,
      number
    >
    for (const e of events) totals[e.category] += e.points
    return totals
  }, [events])

  const netTotal = useMemo(() => events.reduce((s, e) => s + e.points, 0), [events])

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Points history"
          subtitle="Everything you’ve earned and spent this semester."
          fallback="/app"
        />
        <ListSkeleton />
      </div>
    )
  }

  if (error && events.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Points history"
          subtitle="Everything you’ve earned and spent this semester."
          fallback="/app"
        />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Points history"
          subtitle="Everything you’ve earned and spent this semester."
          fallback="/app"
        />
        <Card className="p-8 text-center text-sm text-muted">
          No points yet. They'll appear here the moment your instructor awards them.
        </Card>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={load}>
      <div className="space-y-5">
        <PageHeader
          title="Points history"
          subtitle="Everything you’ve earned and spent this semester."
          fallback="/app"
        />

        {/* Per-week bars. Height is scaled against the biggest week so the
            shape reads even when the numbers are small — which they are early
            in a semester. */}
        {weeks.length > 1 && <WeekChart weeks={weeks} />}

        {/* Where the points came from — and went. */}
        <Card className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Where your points came from</h2>
            <span
              className={cn(
                'font-display text-lg font-bold tabular-nums',
                netTotal < 0 ? 'text-danger' : 'text-ink',
              )}
            >
              {netTotal > 0 ? `+${netTotal}` : netTotal}
            </span>
          </div>
          <div className="space-y-2">
            {(Object.keys(CATEGORY_META) as PointCategory[])
              .filter((k) => split[k] !== 0)
              .map((k) => (
                <div key={k} className="flex items-center gap-2.5">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', CATEGORY_META[k].dot)} />
                  <span className="min-w-0 flex-1 truncate text-sm">{CATEGORY_META[k].label}</span>
                  <span
                    className={cn(
                      'font-display text-sm font-bold tabular-nums',
                      CATEGORY_META[k].text,
                    )}
                  >
                    {split[k] > 0 ? `+${split[k]}` : split[k]}
                  </span>
                </div>
              ))}
          </div>
        </Card>

        {/* The ledger itself, grouped by class week. */}
        <div className="space-y-4">
          {groupByWeek(events, (e) => e.created_at).map((g) => (
            <div key={g.week}>
              <p className="mb-1.5 flex items-baseline gap-2 px-1">
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted/80">
                  {weekLabel(g.week)}
                </span>
                {g.term && <span className="text-[0.65rem] text-muted/60">{termLabel(g.term)}</span>}
              </p>
              <Card className="divide-y divide-line">
                {g.items.map((e) => (
                  <LedgerRow key={e.id} event={e} />
                ))}
              </Card>
            </div>
          ))}
        </div>

        {error && <p className="px-1 text-center text-xs text-danger">{error}</p>}

        {hasMore ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Loading…' : 'Load older'}
          </Button>
        ) : (
          <p className="pb-2 text-center text-xs text-muted">That's your whole history.</p>
        )}
      </div>
    </PullToRefresh>
  )
}


/**
 * Per-week net points. Bars grow from a shared baseline; negative weeks hang
 * below it, because a week that cost you points should LOOK different from a
 * week where you earned nothing.
 */
function WeekChart({
  weeks,
}: {
  weeks: { week: number; net: number; earned: number; lost: number }[]
}) {
  const peak = Math.max(1, ...weeks.map((w) => Math.max(w.earned, Math.abs(w.lost))))

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">By week</h2>
      <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
        {weeks.map((w) => {
          const upPct = (w.earned / peak) * 100
          const downPct = (Math.abs(w.lost) / peak) * 100
          return (
            <div key={w.week} className="flex min-w-7 flex-1 flex-col items-center gap-1">
              <span className="text-[0.6rem] font-semibold tabular-nums text-muted">
                {w.net > 0 ? `+${w.net}` : w.net !== 0 ? w.net : ''}
              </span>
              {/* Fixed-height track so every bar shares a baseline. */}
              <div className="flex h-20 w-full flex-col justify-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${upPct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="w-full rounded-t bg-brand-500"
                />
                {downPct > 0 && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${downPct}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="w-full rounded-b bg-danger-solid/70"
                  />
                )}
              </div>
              <span className="text-[0.6rem] tabular-nums text-muted/70">{w.week}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-center text-[0.65rem] text-muted/70">Class week</p>
    </Card>
  )
}

function LedgerRow({ event: e }: { event: PointEvent }) {
  const negative = e.points < 0
  return (
    <div className="flex items-center gap-3 p-4">
      <span
        className={cn(
          'flex h-9 w-11 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold tabular-nums',
          negative
            ? 'bg-danger-solid/10 text-danger'
            : e.category === 'activity'
              ? 'bg-brand-500/10 text-brand-500'
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
