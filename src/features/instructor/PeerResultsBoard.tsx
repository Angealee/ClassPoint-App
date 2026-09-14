import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Meter } from '@/components/ui/Meter'
import { PageHeader } from '@/components/ui/PageHeader'
import { PersonRow } from '@/components/ui/PersonRow'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { DownloadIcon } from '@/components/ui/icons'
import { PeerResultCard } from '@/components/peer/PeerResultCard'
import {
  closePeerEvaluation,
  deletePeerEvaluation,
  extendPeerEvaluation,
  getPeerCompletion,
  getPeerResults,
  listPeerEvaluations,
  releasePeerResults,
  reopenPeerEvaluation,
  setPeerCommentHidden,
} from '@/lib/api'
import { exportPeerScores } from '@/lib/export-peer'
import { errorText } from '@/lib/errors'
import { countdownTo, timeAgo } from '@/lib/time'
import type { PeerCompletionRow, PeerEvaluationListItem, PeerResultRow } from '@/lib/types'

type Confirming = 'close' | 'reopen' | 'release' | null
type BoardTab = 'results' | 'completion'

/**
 * One evaluation: who has submitted, and the controls that end it.
 *
 * ── TWO VIEWS, AND WHICH ONE OPENS DEPENDS ON THE STATE ────────────────────
 * Results are LIVE as soon as anyone submits (the instructor's call,
 * 2026-09-14) — `get_peer_results` is instructor-gated and never cared about
 * status, so only this screen was holding them back. While it is open,
 * Completion stays the default tab because that is the list you chase, and the
 * Results tab says plainly that its numbers are still moving. Once it closes,
 * Results opens by default. Release to STUDENTS still requires closing, so
 * nothing a student sees can move. Aggregation happens in SQL: a section-wide
 * evaluation is thousands of rating rows and PostgREST truncates at 1000
 * silently.
 *
 * ── DELETE LIVES AT THE BOTTOM, AND ONLY HERE ─────────────────────────────
 * A Danger zone card below everything else (the instructor's call), so the
 * submissions about to be destroyed are on screen above the button, and never
 * on the console list where one look-alike card is a tap away from another.
 * The server allows it only when CLOSED and NOT RELEASED and checks the typed
 * title itself; the button explains whichever rule is blocking it rather than
 * disappearing.
 *
 * The results fetch sits in its OWN try, the 0034 SectionGrid precedent. Its
 * RPC ships in 0051, so before that migration is applied only this tab is
 * missing rather than the whole screen.
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
  const [results, setResults] = useState<PeerResultRow[]>([])
  const [tab, setTab] = useState<BoardTab>('completion')
  const [exporting, setExporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [busy, setBusy] = useState(false)
  const [deadline, setDeadline] = useState('')
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  // What was actually TYPED, sent to the server so it can compare it itself.
  // Never substitute the stored title: that would make the check unable to fail.
  const [typedTitle, setTypedTitle] = useState('')

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
      const found = all.find((e) => e.id === evaluationId) ?? null
      setMeta(found)
      setRows(completion)

      // Results are a SEPARATE try, the 0034 SectionGrid precedent: this RPC
      // ships in 0051, so until that migration is applied the call throws and
      // only the Results tab is missing. Folding it into the fetch above would
      // take the completion view down with it.
      //
      // Fetched whenever anyone has submitted, open or closed. With nobody
      // submitted every row would read "Not rated", which is the completion
      // view restated with less information.
      if (found && found.submittedCount > 0) {
        try {
          const r = await getPeerResults(evaluationId)
          setResults(r)
          // Only a closed evaluation opens on Results. While it is open the
          // outstanding list is what needs doing.
          if (found.status === 'closed') setTab('results')
        } catch {
          setResults([])
        }
      } else {
        setResults([])
      }
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
      } else if (confirming === 'release') {
        const n = await releasePeerResults(meta.id)
        // Report what the SERVER reached, not what we predicted. Zero means it
        // was already released, which is worth saying plainly.
        toast(
          n === 0
            ? 'Results were already released.'
            : `Released to ${n} student${n === 1 ? '' : 's'}.`,
          'success',
        )
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

  async function hideComment(submissionId: string, rateeId: string, hidden: boolean) {
    try {
      await setPeerCommentHidden(submissionId, rateeId, hidden)
      // Patch in place rather than refetching: the instructor is mid-read on an
      // expanded card, and a reload collapses everything they had open.
      setResults((prev) =>
        prev.map((r) =>
          r.studentId !== rateeId
            ? r
            : {
                ...r,
                comments: r.comments.map((c) =>
                  c.submissionId === submissionId
                    ? { ...c, hiddenAt: hidden ? new Date().toISOString() : null }
                    : c,
                ),
              },
        ),
      )
      toast(hidden ? 'Hidden from that student.' : 'Restored.', 'success')
    } catch (e) {
      toast(errorText(e, "Couldn't change that comment."), 'error')
    }
  }

  async function onDelete() {
    if (!meta) return
    setDeleteBusy(true)
    try {
      const n = await deletePeerEvaluation(meta.id, typedTitle)
      toast(
        n === 0
          ? `Deleted ${meta.title}.`
          : `Deleted ${meta.title} and its ${n} submission${n === 1 ? '' : 's'}.`,
        'success',
      )
      setDeleting(false)
      // Replace, not push: Back must not return to a screen for something that
      // no longer exists.
      navigate('/teach/peer', { replace: true })
    } catch (e) {
      // The server's refusals are real sentences ("Close the evaluation before
      // deleting it", "The title you typed does not match"), shown verbatim.
      toast(errorText(e, "Couldn't delete that evaluation."), 'error')
      setDeleting(false)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function runExport() {
    if (!meta) return
    setExporting(true)
    try {
      await exportPeerScores(meta)
    } catch (e) {
      toast(errorText(e, "Couldn't build that workbook."), 'error')
    } finally {
      setExporting(false)
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
  const released = meta.resultsReleasedAt !== null
  const expected = Math.max(1, meta.expectedCount)
  // Mirrors the server's rule. The server decides; this only explains it.
  const canDelete = !open && !released
  const showResults = results.length > 0 && meta.submittedCount > 0

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title={meta.title}
        subtitle={[meta.subjectCode, meta.sectionNames.join(', '), meta.groupNames.join(', ')]
          .filter(Boolean)
          .join(' · ')}
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

        {!open && (
          <Card>
            <SectionLabel>Results</SectionLabel>
            {meta.resultsReleasedAt ? (
              <p className="text-xs text-muted">
                Released {timeAgo(meta.resultsReleasedAt)}. Every student who was
                rated can read their own feedback.
              </p>
            ) : (
              <p className="text-xs text-muted">
                Students cannot see anything until you release. You can read
                everything below first.
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                className="min-w-0 flex-1"
                disabled={meta.resultsReleasedAt !== null}
                onClick={() => setConfirming('release')}
              >
                {meta.resultsReleasedAt !== null ? 'Released' : 'Release to students'}
              </Button>
              <Button
                variant="outline"
                loading={exporting}
                icon={<DownloadIcon className="h-4 w-4" />}
                onClick={() => void runExport()}
              >
                Export
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              {/* Said here rather than discovered later: an instructor who
                  expects the comments in the sheet will otherwise mail it
                  believing the words travelled with it. */}
              The workbook holds scores only. Comments stay in the app.
            </p>
          </Card>
        )}

        {showResults && (
          <SegmentedControl
            label="Board view"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'results', label: 'Results' },
              { value: 'completion', label: 'Completion' },
            ]}
          />
        )}

        {tab === 'results' && showResults && (
          <div className="space-y-3">
            {open && (
              <Card pad="tight" className="border-warn/30 bg-warn-solid/8">
                <p className="text-sm font-semibold text-warn">Live, still changing</p>
                <p className="mt-0.5 text-xs text-muted">
                  These move as more students submit. Students see nothing until you close
                  it and release.
                </p>
              </Card>
            )}
            {results.map((r) => (
              <PeerResultCard
                key={r.studentId}
                row={r}
                onToggleComment={(submissionId, hidden) =>
                  void hideComment(submissionId, r.studentId, hidden)
                }
              />
            ))}
            <p className="px-1 text-xs text-muted">
              Lowest first. A student nobody rated sorts last, because that is a
              gap in the data rather than a low score.
            </p>
          </div>
        )}

        {(tab === 'completion' || !showResults) && split.outstanding.length > 0 && (
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

        {(tab === 'completion' || !showResults) && split.done.length > 0 && (
          <div>
            <SectionLabel>Submitted ({split.done.length})</SectionLabel>
            <Card pad="none" className="divide-y divide-line">
              {split.done.map((r) => (
                <CompletionRow key={r.studentId} row={r} />
              ))}
            </Card>
          </div>
        )}

        {(tab === 'completion' || !showResults) && split.skipped.length > 0 && (
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

        <Card className="border-danger/30">
          <SectionLabel>Danger zone</SectionLabel>
          <p className="px-1 text-xs text-muted">
            {open
              ? 'Close it first. Deleting an open evaluation would pull the form out from under anyone filling it in.'
              : released
                ? 'Results have been released, so students have already read this feedback. It can no longer be deleted.'
                : 'Deletes the evaluation, its questions, every submission, rating and comment, and the notifications it sent. A full copy is kept in the audit log for a year.'}
          </p>
          <Button
            variant="danger"
            className="mt-3 w-full"
            disabled={!canDelete}
            onClick={() => {
              setTypedTitle('')
              setDeleting(true)
            }}
          >
            Delete evaluation
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === 'close'
            ? 'Close this evaluation?'
            : confirming === 'release'
              ? 'Release these results?'
              : 'Reopen this evaluation?'
        }
        message={
          confirming === 'close'
            ? `${split.outstanding.length} student${
                split.outstanding.length === 1 ? '' : 's'
              } have not submitted. They will not be able to after this.`
            : confirming === 'release'
              ? 'Every student who was rated gets a notification and can read their own scores and comments from then on.'
              : 'Students who have not submitted will be able to again. Anyone who already submitted still cannot change their answers.'
        }
        detail={
          confirming === 'reopen'
            ? 'The deadline is cleared, or the automatic close would shut it again within the minute.'
            : confirming === 'release'
              ? 'This cannot be undone, and the evaluation can no longer be reopened. Hide any comment you do not want sent on, first.'
              : undefined
        }
        variant={confirming === 'close' ? 'danger' : 'default'}
        confirmLabel={
          confirming === 'close'
            ? 'Close it'
            : confirming === 'release'
              ? 'Release'
              : 'Reopen it'
        }
        busy={busy}
        onConfirm={() => void act()}
        onClose={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={deleting}
        title="Delete this evaluation for good?"
        message={
          meta.submittedCount === 0
            ? 'Nobody submitted, so only the evaluation and its questions are removed.'
            : `${meta.submittedCount} submission${meta.submittedCount === 1 ? '' : 's'}, with every rating and comment in them, will be permanently deleted.`
        }
        detail="This cannot be undone from the app. The audit log keeps a full copy for a year."
        variant="danger"
        confirmLabel="Delete permanently"
        challengeText={meta.title}
        onChallengeChange={setTypedTitle}
        busy={deleteBusy}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleting(false)}
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
