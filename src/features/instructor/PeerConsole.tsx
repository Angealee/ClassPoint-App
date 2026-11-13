import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Meter } from '@/components/ui/Meter'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ClipboardIcon, PlusIcon } from '@/components/ui/icons'
import { getPeerEvaluationTemplate, listPeerEvaluations } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { errorText } from '@/lib/errors'
import { countdownTo, timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { ToneName } from '@/lib/tone'
import type { PeerEvaluationListItem, PeerEvaluationTemplate } from '@/lib/types'
import { PeerComposer } from './PeerComposer'
import { PeerGroups } from './PeerGroups'

type PeerTab = 'evaluations' | 'groups'

const TABS: ReadonlyArray<{ value: PeerTab; label: string }> = [
  { value: 'evaluations', label: 'Evaluations' },
  { value: 'groups', label: 'Groups' },
]

export function PeerConsole() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: PeerTab = searchParams.get('tab') === 'groups' ? 'groups' : 'evaluations'

  function changeTab(next: PeerTab) {
    setSearchParams(next === 'groups' ? { tab: 'groups' } : {}, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <PageHeader
        title="Peer evaluation"
        subtitle="Students rate the classmates they worked with. Nothing here touches points."
        fallback="/teach"
      />

      {/* Underlined tabs: navigation between two areas, not a filter. */}
      <div
        role="tablist"
        aria-label="Peer evaluation view"
        className="flex gap-6 border-b border-line"
      >
        {TABS.map((t) => {
          const active = t.value === tab
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => changeTab(t.value)}
              className={cn(
                'cp-tap-y -mb-px border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-semibold transition-colors',
                active
                  ? 'border-accent-solid text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'evaluations' ? (
        <EvaluationList onOpenGroups={() => changeTab('groups')} />
      ) : (
        <PeerGroups embedded />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status model — one place decides what an evaluation "is" for the list.
// ---------------------------------------------------------------------------
type StatusKey = 'open' | 'review' | 'released'
type Filter = 'all' | StatusKey

function statusOf(e: PeerEvaluationListItem): StatusKey {
  if (e.status === 'open') return 'open'
  return e.resultsReleasedAt ? 'released' : 'review'
}

const STATUS_META: Record<StatusKey, { label: string; tone: ToneName; action: string }> = {
  open: { label: 'Open', tone: 'accent', action: 'View progress' },
  review: { label: 'Needs release', tone: 'warn', action: 'Review & release' },
  released: { label: 'Released', tone: 'success', action: 'View results' },
}

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'review', label: 'Needs release' },
  { value: 'released', label: 'Released' },
]

function EvaluationList({ onOpenGroups }: { onOpenGroups: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const [template, setTemplate] = useState<PeerEvaluationTemplate | null>(null)
  const [items, setItems] = useState<PeerEvaluationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  // Read once: "closes in under a day" does not need to tick.
  const [now] = useState(() => Date.now())

  // The filter lives in the URL so Back from an evaluation keeps it.
  const filterParam = searchParams.get('status')
  const filter: Filter =
    filterParam === 'open' || filterParam === 'review' || filterParam === 'released'
      ? filterParam
      : 'all'
  function changeFilter(next: Filter) {
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('status')
    else params.set('status', next)
    setSearchParams(params, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setItems(await listPeerEvaluations())
    } catch (e) {
      setLoadError(errorText(e, "Couldn't load your evaluations."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const duplicateId = searchParams.get('duplicate')
  useEffect(() => {
    if (!duplicateId) return
    let cancelled = false
    void (async () => {
      try {
        const t = await getPeerEvaluationTemplate(duplicateId)
        if (cancelled) return
        setTemplate(t)
        setComposerOpen(true)
      } catch (e) {
        if (!cancelled) toast(errorText(e, "Couldn't copy that evaluation."), 'error')
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams)
          next.delete('duplicate')
          setSearchParams(next, { replace: true })
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateId])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, open: 0, review: 0, released: 0 }
    for (const e of items) c[statusOf(e)]++
    return c
  }, [items])

  const shown = filter === 'all' ? items : items.filter((e) => statusOf(e) === filter)

  function openComposer() {
    setTemplate(null)
    setComposerOpen(true)
  }

  return (
    <div className="space-y-4">
      {!loading && !loadError && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Filter evaluations"
            className="flex min-w-0 flex-1 flex-wrap gap-1.5"
          >
            {FILTERS.map((f) => {
              const active = f.value === filter
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => changeFilter(f.value)}
                  className={cn(
                    'cp-tap-y flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                    active
                      ? 'border-accent-solid bg-accent-solid/10 text-accent'
                      : 'border-line text-muted hover:text-ink',
                  )}
                >
                  {f.label}
                  <span className="tabular-nums opacity-70">{counts[f.value]}</span>
                </button>
              )
            })}
          </div>
          <Button
            size="sm"
            className="shrink-0"
            icon={<PlusIcon className="h-4 w-4" />}
            onClick={openComposer}
          >
            <span className="hidden sm:inline">New evaluation</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : loadError ? (
        <ErrorState onRetry={() => void load()}>{loadError}</ErrorState>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon />}
          description="Want students rating their own team instead of the whole section? Set up teams first."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button icon={<PlusIcon className="h-4 w-4" />} onClick={openComposer}>
                Create your first evaluation
              </Button>
              <button
                type="button"
                onClick={onOpenGroups}
                className="cp-tap-y text-xs font-semibold text-accent"
              >
                Set up teams first
              </button>
            </div>
          }
        >
          No evaluations this semester.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState compact>
          Nothing{' '}
          {filter === 'open'
            ? 'open right now'
            : filter === 'review'
              ? 'waiting for release'
              : 'released yet'}
          .
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {shown.map((e) => (
            <EvaluationCard key={e.id} item={e} now={now} />
          ))}
        </div>
      )}

      <PeerComposer
        open={composerOpen}
        template={template}
        onClose={() => setComposerOpen(false)}
        onCreated={() => {
          setComposerOpen(false)
          void load()
        }}
      />
    </div>
  )
}

function EvaluationCard({ item, now }: { item: PeerEvaluationListItem; now: number }) {
  const key = statusOf(item)
  const meta = STATUS_META[key]
  const expected = Math.max(1, item.expectedCount)
  const complete = item.expectedCount > 0 && item.submittedCount >= item.expectedCount

  // "Closes in …" turns red inside the last 24 hours.
  const closesMs = item.closesAt ? new Date(item.closesAt).getTime() - now : null
  const urgent = key === 'open' && closesMs !== null && closesMs < 24 * 3600_000

  const when =
    key === 'open'
      ? item.closesAt
        ? `Closes in ${countdownTo(new Date(item.closesAt))}`
        : 'No deadline — close it by hand'
      : key === 'released'
        ? `Released ${timeAgo(item.resultsReleasedAt as string)}`
        : item.closedAt
          ? `Closed ${timeAgo(item.closedAt)}`
          : 'Closed'

  return (
    <Link to={`/teach/peer/${item.id}`} className="block">
      <Card interactive>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{item.title}</h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {item.subjectCode} · {item.scope === 'group' ? 'Within teams' : 'Whole section'} ·{' '}
              {item.criteriaCount} criteri{item.criteriaCount === 1 ? 'on' : 'a'}
            </p>
          </div>
          <Chip tone={meta.tone} size="sm">
            {meta.label}
          </Chip>
        </div>

        {(item.sectionNames.length > 0 || item.groupNames.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.sectionNames.map((n) => (
              <Chip key={`s-${n}`} tone="neutral" size="sm">
                {n}
              </Chip>
            ))}
            {item.groupNames.map((n) => (
              <Chip key={`g-${n}`} tone="info" size="sm">
                {n}
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted">Submitted</span>
            <span
              className={cn(
                'font-semibold tabular-nums',
                key === 'open' && !complete && 'text-warn',
              )}
            >
              {item.submittedCount} / {item.expectedCount}
            </span>
          </div>
          <Meter value={item.submittedCount} max={expected} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5 text-xs">
          <span
            className={cn('min-w-0 truncate', urgent ? 'font-semibold text-danger' : 'text-muted')}
          >
            {when}
          </span>
          <span className="shrink-0 font-semibold text-accent">{meta.action} ›</span>
        </div>
      </Card>
    </Link>
  )
}
