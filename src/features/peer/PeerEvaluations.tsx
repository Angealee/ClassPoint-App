import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip } from '@/components/ui/Chip'
import { Rows } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ChevronDownIcon, ClipboardIcon } from '@/components/ui/icons'
import { PeerPlate } from '@/components/peer/PeerPlate'
import { getMyPeerEvaluations } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorText } from '@/lib/errors'
import { TONE } from '@/lib/tone'
import { deadlineLabel, isOpenable, listSummary, rowState, type PeerRowState } from '@/lib/peer-list'
import type { PeerEvaluationSummary } from '@/lib/types'

export function PeerEvaluations() {
  const [items, setItems] = useState<PeerEvaluationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // One clock for the whole screen, so every row's deadline is worded against the same "now".
  const [now] = useState(() => Date.now())

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

  const todo = items.filter((i) => rowState(i) === 'todo')
  const rest = items.filter((i) => rowState(i) !== 'todo')

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
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
          detail="Nothing you have filled in is lost, this is just the connection."
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
        <>
          <Summary items={items} now={now} />

          {todo.length > 0 && (
            <section>
              <SectionLabel>To do</SectionLabel>
              <Rows className="mt-2">
                {todo.map((e) => (
                  <EvalRow key={e.id} item={e} now={now} />
                ))}
              </Rows>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              {todo.length > 0 && <SectionLabel>Everything else</SectionLabel>}
              <Rows className={todo.length > 0 ? 'mt-2' : undefined}>
                {rest.map((e) => (
                  <EvalRow key={e.id} item={e} now={now} />
                ))}
              </Rows>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Summary({ items, now }: { items: PeerEvaluationSummary[]; now: number }) {
  const s = listSummary(items)
  const total = s.todo + s.submitted

  if (s.todo > 0) {
    return (
      <PeerPlate
        eyebrow="Peer eval"
        figure={String(s.todo)}
        unit="to do"
        progress={total > 0 ? s.submitted / total : null}
        progressLabel={`${s.submitted} of ${total} submitted`}
        meta={
          <>
            <span>{s.submitted} submitted</span>
            {s.nextClosesAt && <span>{deadlineLabel(s.nextClosesAt, now)}</span>}
          </>
        }
      />
    )
  }
  if (s.results > 0) {
    return (
      <PeerPlate
        eyebrow="Peer eval"
        figure={String(s.results)}
        unit={s.results === 1 ? 'feedback ready' : 'feedbacks ready'}
        meta={<span>Open one to read what your classmates said.</span>}
      />
    )
  }
  return (
    <PeerPlate
      eyebrow="Peer eval"
      figure="All done"
      meta={<span>Nothing waiting on you right now.</span>}
    />
  )
}

const DOT: Record<PeerRowState, string> = {
  todo: TONE.warn.dot,
  submitted: TONE.success.dot,
  results: TONE.reward.dot,
  missed: TONE.danger.dot,
  unplaced: TONE.neutral.dot,
}

const CHIP: Record<PeerRowState, { label: string; tone: 'warn' | 'success' | 'reward' | 'danger' | 'neutral' }> = {
  todo: { label: 'To do', tone: 'warn' },
  submitted: { label: 'Submitted', tone: 'success' },
  results: { label: 'Results in', tone: 'reward' },
  missed: { label: 'Missed', tone: 'danger' },
  unplaced: { label: 'Not your class', tone: 'neutral' },
}

function caption(item: PeerEvaluationSummary, state: PeerRowState, now: number): string {
  switch (state) {
    case 'results':
      return 'Feedback is ready to read'
    case 'submitted':
      return 'Answers sent, and final'
    case 'unplaced':
      return 'You are not in a group for this'
    case 'missed':
      return 'Closed before you sent yours'
    case 'todo':
      return `${item.peerCount} to rate${
        item.closesAt ? ` · ${deadlineLabel(item.closesAt, now)}` : ''
      }`
  }
}

function EvalRow({ item, now }: { item: PeerEvaluationSummary; now: number }) {
  const state = rowState(item)
  const openable = isOpenable(state)
  const chip = CHIP[state]
  const to = state === 'results' ? `/app/peer/${item.id}/results` : `/app/peer/${item.id}`

  const body = (
    <>
      <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[state])} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={item.title}>
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {item.subjectCode} · {caption(item, state, now)}
        </p>
      </div>
      <Chip tone={chip.tone} size="sm">
        {chip.label}
      </Chip>
      {openable && <ChevronDownIcon aria-hidden className="h-4 w-4 shrink-0 -rotate-90 text-muted" />}
    </>
  )

  const row = 'flex min-h-16 items-center gap-3 px-4 py-3'
  if (!openable) return <div className={cn(row, 'opacity-70')}>{body}</div>
  return (
    <Link
      to={to}
      className={cn(
        row,
        'transition-colors hover:bg-card-2 focus:outline-none focus-visible:bg-card-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
      )}
    >
      {body}
    </Link>
  )
}
