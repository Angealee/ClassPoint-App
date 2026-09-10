import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Meter } from '@/components/ui/Meter'
import { PageHeader } from '@/components/ui/PageHeader'
import { PersonRow } from '@/components/ui/PersonRow'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  closePeerEvaluation,
  extendPeerEvaluation,
  getPeerCompletion,
  listPeerEvaluations,
  reopenPeerEvaluation,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { countdownTo, timeAgo } from '@/lib/time'
import type { PeerCompletionRow, PeerEvaluationListItem } from '@/lib/types'

type Confirming = 'close' | 'reopen' | null

/**
 * One evaluation: who has submitted, and the controls that end it.
 *
 * ── RESULTS ARE NOT HERE YET ───────────────────────────────────────────────
 * Phase 3 adds the aggregation, the release and the export to this screen. The
 * name is already `PeerResultsBoard` so the route does not move under anyone
 * when it does. Until then the screen answers the only question the database
 * will answer: who has submitted, who has not, and who was never expected to.
 *
 * ── THREE STATES, NOT TWO ──────────────────────────────────────────────────
 * `applicable` is false for a student with nobody to rate — in a group-scoped
 * evaluation, someone who is on no team. They are NOT outstanding, and listing
 * them as missing sends the instructor chasing someone with nothing to do.
 */
export function PeerResultsBoard() {
  const { evaluationId = '' } = useParams()
  const { toast } = useToast()

  const [meta, setMeta] = useState<PeerEvaluationListItem | null>(null)
  const [rows, setRows] = useState<PeerCompletionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [busy, setBusy] = useState(false)
  const [deadline, setDeadline] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // In parallel. `list_peer_evaluations` is the only thing that carries the
      // title and status, and there is no per-evaluation read that would answer
      // both without a second RPC nothing else would use.
      const [all, completion] = await Promise.all([
        listPeerEvaluations(),
        getPeerCompletion(evaluationId),
      ])
      setMeta(all.find((e) => e.id === evaluationId) ?? null)
      setRows(completion)
    } catch (e) {
      setLoadError(errorText(e, "Couldn't load that evaluation."))
    } finally {
      setLoading(false)
    }
  }, [evaluationId])

  useEffect(() => {
    void load()
  }, [load])

  const split = useMemo(() => {
    const outstanding = rows.filter((r) => r.applicable && r.submittedAt === null)
    const done = rows.filter((r) => r.applicable && r.submittedAt !== null)
    const skipped = rows.filter((r) => !r.applicable)
    return { outstanding, done, skipped }
  }, [rows])

  async function act() {
    if (!meta) return
    setBusy(true)
    try {
      if (confirming === 'close') {
        const changed = await closePeerEvaluation(meta.id)
        // The cron may have beaten the tap by seconds. Saying "closed" either
        // way is honest; saying "you closed it" when you did not is not.
        toast(changed ? 'Closed.' : 'It was already closed.', 'success')
      } else if (confirming === 'reopen') {
        await reopenPeerEvaluation(meta.id)
        toast('Reopened. Set a new deadline if you want one.', 'success')
      }
      setConfirming(null)
      await load()
    } catch (e) {
      toast(errorText(e, "Couldn't do that."), 'error')
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

  async function saveDeadline() {
    if (!meta) return
    setBusy(true)
    try {
      await extendPeerEvaluation(meta.id, deadline ? new Date(deadline).toISOString() : null)
      toast(deadline ? 'Deadline updated.' : 'Deadline removed.', 'success')
      setDeadline('')
      await load()
    } catch (e) {
      toast(errorText(e, "Couldn't change the deadline."), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <ListSkeleton />
  if (loadError) {
    return <ErrorState onRetry={() => void load()}>{loadError}</ErrorState>
  }
  if (!meta) {
    return <EmptyState>That evaluation no longer exists.</EmptyState>
  }

  const open = meta.status === 'open'
  const expected = Math.max(1, meta.expectedCount)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title={meta.title}
        subtitle={`${meta.subjectCode} · ${meta.sectionNames.join(', ')}`}
        fallback="/teach/peer"
        actions={
          <Chip tone={open ? 'accent' : 'neutral'} size="sm">
            {open ? 'Open' : 'Closed'}
          </Chip>
        }
      />

      <div className="space-y-4">
        <Card>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Submitted</h2>
            <span className="text-sm font-semibold tabular-nums">
              {meta.submittedCount} / {meta.expectedCount}
            </span>
          </div>
          <Meter value={meta.submittedCount} max={expected} />
          <p className="mt-2 text-xs text-muted">
            {/* Stated rather than left to be inferred: with no draft table this
                is the ONLY progress signal that exists, and an instructor who
                expects a percentage will otherwise read the bar as one. */}
            Drafts stay on each student's own device, so this counts finished
            submissions only. There is no partial progress to show.
          </p>
        </Card>

        <Card>
          <SectionLabel>Deadline</SectionLabel>
          {open ? (
            <>
              <p className="mb-3 text-xs text-muted">
                {meta.closesAt
                  ? `Closes in ${countdownTo(new Date(meta.closesAt))}.`
                  : 'No deadline set — it stays open until you close it.'}
              </p>
              <div className="flex items-end gap-2">
                <Input
                  type="datetime-local"
                  wrapperClassName="min-w-0 flex-1"
                  aria-label="New deadline"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
                <Button variant="outline" loading={busy} onClick={() => void saveDeadline()}>
                  Save
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted">
              Closed {meta.closedAt ? timeAgo(meta.closedAt) : ''}.
            </p>
          )}

          <div className="mt-4">
            {open ? (
              <Button variant="danger" className="w-full" onClick={() => setConfirming('close')}>
                Close now
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                disabled={meta.resultsReleasedAt !== null}
                onClick={() => setConfirming('reopen')}
              >
                {meta.resultsReleasedAt !== null ? 'Released — cannot reopen' : 'Reopen'}
              </Button>
            )}
          </div>
        </Card>

        {split.outstanding.length > 0 && (
          <div>
            <SectionLabel>
              Still to submit ({split.outstanding.length})
            </SectionLabel>
            <Card pad="none" className="divide-y divide-line">
              {split.outstanding.map((r) => (
                <CompletionRow key={r.studentId} row={r} />
              ))}
            </Card>
          </div>
        )}

        {split.done.length > 0 && (
          <div>
            <SectionLabel>Submitted ({split.done.length})</SectionLabel>
            <Card pad="none" className="divide-y divide-line">
              {split.done.map((r) => (
                <CompletionRow key={r.studentId} row={r} />
              ))}
            </Card>
          </div>
        )}

        {split.skipped.length > 0 && (
          <div>
            <SectionLabel>Not applicable ({split.skipped.length})</SectionLabel>
            <Card pad="none" className="divide-y divide-line">
              {split.skipped.map((r) => (
                <CompletionRow key={r.studentId} row={r} />
              ))}
            </Card>
            <p className="mt-1.5 px-1 text-xs text-muted">
              Nobody to rate, so nothing is expected from them. In a group
              evaluation that means they are not on a team.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'close' ? 'Close this evaluation?' : 'Reopen this evaluation?'}
        message={
          confirming === 'close'
            ? `${split.outstanding.length} student${
                split.outstanding.length === 1 ? '' : 's'
              } have not submitted. They will not be able to after this.`
            : 'Students who have not submitted will be able to again. Anyone who already submitted still cannot change their answers.'
        }
        detail={
          confirming === 'reopen'
            ? 'The deadline is cleared, or the automatic close would shut it again within the minute.'
            : undefined
        }
        variant={confirming === 'close' ? 'danger' : 'default'}
        confirmLabel={confirming === 'close' ? 'Close it' : 'Reopen it'}
        busy={busy}
        onConfirm={() => void act()}
        onClose={() => setConfirming(null)}
      />
    </div>
  )
}

function CompletionRow({ row }: { row: PeerCompletionRow }) {
  return (
    <div className="p-3.5">
      <PersonRow
        name={row.fullName}
        avatarUrl={row.avatarUrl}
        meta={[row.sectionName, row.groupName ?? undefined].filter(Boolean).join(' · ')}
        trailing={
          row.submittedAt ? (
            <span className="shrink-0 text-xs text-muted">{timeAgo(row.submittedAt)}</span>
          ) : row.applicable ? (
            <Chip tone="warn" size="sm">
              Waiting
            </Chip>
          ) : (
            <Chip tone="neutral" size="sm">
              No team
            </Chip>
          )
        }
      />
    </div>
  )
}
