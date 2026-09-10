import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Meter } from '@/components/ui/Meter'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ClipboardIcon, PlusIcon } from '@/components/ui/icons'
import { listPeerEvaluations } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { countdownTo, timeAgo } from '@/lib/time'
import type { PeerEvaluationListItem } from '@/lib/types'
import { PeerComposer } from './PeerComposer'
import { PeerGroups } from './PeerGroups'

type PeerTab = 'evaluations' | 'groups'

/**
 * The instructor's peer evaluation console.
 *
 * Two tabs in the `/teach/redemptions` style, mirrored to `?tab=` so a deep
 * link and the browser's back button both work. Groups is the same screen
 * Phase 1 shipped, hosted here rather than duplicated — it was reachable at
 * `/teach/peer` on its own for one phase and this is where it always belonged.
 *
 * This is deliberately NOT a fifth bottom tab. Four is the stated limit, and
 * `/teach/redemptions`, `/teach/ops` and `/teach/space` all reach their screens
 * from the Shell's `actions` slot or a card.
 */
export function PeerConsole() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial: PeerTab = searchParams.get('tab') === 'groups' ? 'groups' : 'evaluations'
  const [tab, setTab] = useState<PeerTab>(initial)

  function changeTab(next: PeerTab) {
    setTab(next)
    setSearchParams(next === 'groups' ? { tab: 'groups' } : {}, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Peer evaluation"
        subtitle="Students rate the classmates they worked with. Nothing here touches points."
        fallback="/teach"
      />

      <SegmentedControl
        label="Peer evaluation view"
        className="mb-4"
        value={tab}
        onChange={changeTab}
        options={[
          { value: 'evaluations', label: 'Evaluations' },
          { value: 'groups', label: 'Groups' },
        ]}
      />

      {tab === 'evaluations' ? <EvaluationList /> : <PeerGroups embedded />}
    </div>
  )
}

function EvaluationList() {
  const [items, setItems] = useState<PeerEvaluationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

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

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          icon={<PlusIcon className="h-4 w-4" />}
          onClick={() => setComposerOpen(true)}
        >
          New evaluation
        </Button>
      </div>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : loadError ? (
        <ErrorState onRetry={() => void load()}>{loadError}</ErrorState>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon />}
          description="Build your groups first if you want students rating their own team rather than the whole section."
        >
          No evaluations this semester.
        </EmptyState>
      ) : (
        items.map((e) => <EvaluationCard key={e.id} item={e} />)
      )}

      <PeerComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={() => {
          setComposerOpen(false)
          void load()
        }}
      />
    </div>
  )
}

function EvaluationCard({ item }: { item: PeerEvaluationListItem }) {
  const open = item.status === 'open'
  // Guarded, because a group-scoped evaluation where nobody has been placed on
  // a team expects zero — and Meter would divide by it.
  const expected = Math.max(1, item.expectedCount)

  return (
    <Link to={`/teach/peer/${item.id}`} className="block">
      <Card interactive>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{item.title}</h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {item.subjectCode} · {item.sectionNames.join(', ') || 'No sections'}
            </p>
          </div>
          <Chip tone={open ? 'accent' : 'neutral'} size="sm">
            {open ? 'Open' : 'Closed'}
          </Chip>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted">
              {item.scope === 'group' ? 'Within groups' : 'Whole section'} ·{' '}
              {item.criteriaCount} criteri{item.criteriaCount === 1 ? 'on' : 'a'}
            </span>
            <span className="font-semibold tabular-nums">
              {item.submittedCount} / {item.expectedCount}
            </span>
          </div>
          <Meter value={item.submittedCount} max={expected} />
        </div>

        <p className="mt-2 text-xs text-muted">
          {open
            ? item.closesAt
              ? `Closes in ${countdownTo(new Date(item.closesAt))}`
              : 'No deadline — close it by hand.'
            : item.resultsReleasedAt
              ? `Results released ${timeAgo(item.resultsReleasedAt)}`
              : 'Closed. Results are not released yet.'}
        </p>
      </Card>
    </Link>
  )
}
