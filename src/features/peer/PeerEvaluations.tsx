import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ClipboardIcon } from '@/components/ui/icons'
import { getMyPeerEvaluations } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { countdownTo } from '@/lib/time'
import type { PeerEvaluationSummary } from '@/lib/types'

/**
 * The student's peer evaluation list.
 *
 * ── THERE IS NO LOCKED SCREEN ──────────────────────────────────────────────
 * Unlike Student Space there is no beta roster: a student is eligible exactly
 * when an evaluation targets their section. So a student with nothing assigned
 * sees an empty state, never a "you don't have access" wall — which would be a
 * lie, since they will have access the moment the instructor creates one.
 *
 * The list fetches for itself and does NOT go through `StudentData`. That
 * provider is 1101 lines consumed by every student screen; peer evaluation has
 * no live surface and nothing else needs its data, so adding it there would
 * make every dashboard open pay for a feature used a few times a term. Same
 * call the Lounge made.
 */
export function PeerEvaluations() {
  const [items, setItems] = useState<PeerEvaluationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setItems(await getMyPeerEvaluations())
    } catch (e) {
      setLoadError(errorText(e, "Couldn't load your peer evaluations."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const todo = items.filter((i) => i.status === 'open' && i.submittedAt === null && i.peerCount > 0)
  const rest = items.filter((i) => !todo.includes(i))

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Peer eval"
        subtitle="Rate the classmates you worked with. They never see your name."
        fallback="/app"
      />

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <ErrorState
          onRetry={() => void load()}
          detail="Nothing you have filled in is lost — this is just the connection."
        >
          {loadError}
        </ErrorState>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon />}
          description="When your instructor opens one for your class, it shows up here and you get a notification."
        >
          Nothing to evaluate right now.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {todo.length > 0 && (
            <div>
              <SectionLabel>To do</SectionLabel>
              <div className="space-y-3">
                {todo.map((e) => (
                  <EvalRow key={e.id} item={e} />
                ))}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div>
              {todo.length > 0 && <SectionLabel>Everything else</SectionLabel>}
              <div className="space-y-3">
                {rest.map((e) => (
                  <EvalRow key={e.id} item={e} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One evaluation.
 *
 * The chip answers "what, if anything, do I do about this" in one word, and the
 * four states are genuinely different: an unplaced student is NOT behind on
 * anything, so they get a neutral explanation rather than an alarm.
 */
function EvalRow({ item }: { item: PeerEvaluationSummary }) {
  const closed = item.status === 'closed'
  const submitted = item.submittedAt !== null
  const unplaced = item.peerCount === 0

  const chip = submitted
    ? { label: 'Submitted', tone: 'success' as const }
    : unplaced
      ? { label: 'Not your class', tone: 'neutral' as const }
      : closed
        ? { label: 'Missed', tone: 'danger' as const }
        : { label: 'To do', tone: 'accent' as const }

  // Whether tapping it does anything. A closed one you never answered has
  // nothing behind it, and a card that opens onto a dead end is worse than one
  // that plainly does not open.
  const openable = !unplaced && (!closed || submitted)

  const body = (
    <Card interactive={openable} className={!openable ? 'opacity-70' : undefined}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {item.subjectCode} · {item.subjectName}
          </p>
        </div>
        <Chip tone={chip.tone} size="sm">
          {chip.label}
        </Chip>
      </div>

      <p className="mt-2 text-xs text-muted">
        {unplaced
          ? 'You have not been placed in a group for this one. Ask your instructor if that looks wrong.'
          : submitted
            ? 'Your answers are in. They cannot be changed.'
            : closed
              ? 'This closed before you submitted.'
              : `${item.peerCount} classmate${item.peerCount === 1 ? '' : 's'} to rate${
                  item.closesAt ? ` · closes in ${countdownTo(new Date(item.closesAt))}` : ''
                }`}
      </p>
    </Card>
  )

  if (!openable) return body
  return (
    <Link to={`/app/peer/${item.id}`} className="block">
      {body}
    </Link>
  )
}
