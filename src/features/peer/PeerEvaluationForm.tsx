import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { PageHeader } from '@/components/ui/PageHeader'
import { StickyBar } from '@/components/ui/StickyBar'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { PeerCard } from '@/components/peer/PeerCard'
import { getPeerEvaluation, submitPeerEvaluation } from '@/lib/api'
import { useStudentData } from '@/features/student/StudentData'
import { errorText } from '@/lib/errors'
import { countdownTo } from '@/lib/time'
import { PEER_COMMENT_MAX, type PeerCommentInput, type PeerEvaluationForm as FormData, type PeerRatingInput } from '@/lib/types'

/** rateeId → { criterionId → score }. */
type Scores = Record<string, Record<string, number>>
/** rateeId → comment. */
type Comments = Record<string, string>

interface Draft {
  scores: Scores
  comments: Comments
}

/**
 * The draft key carries the STUDENT ID as well as the evaluation.
 *
 * A shared phone must never hand one student another's half-finished opinion of
 * their classmates. Same precedent as `cp_seen_level_${studentId}_${semesterId}`,
 * and it matters more here than it did there.
 */
function draftKey(studentId: string, evaluationId: string): string {
  return `cp_peer_draft_${studentId}_${evaluationId}_v1`
}

/**
 * The evaluation form.
 *
 * ── DRAFTS LIVE IN localStorage AND NOWHERE ELSE (decision 6) ──────────────
 * No draft table, which has one consequence worth stating plainly: the
 * instructor cannot see partial progress. The completion view answers
 * "submitted or not", never "60% done". That is the trade for never keeping a
 * server-side copy of an unsent judgement about a classmate.
 *
 * ── SUBMISSION IS FINAL (the instructor's call) ────────────────────────────
 * The ConfirmDialog says so before it sends, because the database will not let
 * anyone take it back afterwards and the student has no other warning.
 */
export function PeerEvaluationForm() {
  const { evaluationId = '' } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { me } = useStudentData()

  const [form, setForm] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [scores, setScores] = useState<Scores>({})
  const [comments, setComments] = useState<Comments>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const studentId = me?.id ?? ''
  // A ref as well, so the save effect below does not have to list it and
  // re-run whenever the provider hands out a new object.
  const restored = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setForm(await getPeerEvaluation(evaluationId))
    } catch (e) {
      setLoadError(errorText(e, "Couldn't open that evaluation."))
    } finally {
      setLoading(false)
    }
  }, [evaluationId])

  useEffect(() => {
    void load()
  }, [load])

  // Restore the draft once, after both the form and the student id are known.
  useEffect(() => {
    if (restored.current || !form || !studentId) return
    restored.current = true
    try {
      const raw = localStorage.getItem(draftKey(studentId, evaluationId))
      if (!raw) return
      const d = JSON.parse(raw) as Draft
      if (d && typeof d === 'object') {
        setScores(d.scores ?? {})
        setComments(d.comments ?? {})
      }
    } catch {
      // A corrupt or unreadable draft is not worth a message. Starting empty is
      // exactly what the student would get anyway, and localStorage throws
      // outright in some private-browsing modes.
    }
  }, [form, studentId, evaluationId])

  // Save on every change. Cheap, and the alternative is deciding when a student
  // is "done typing" moments before their phone is locked.
  useEffect(() => {
    if (!restored.current || !studentId) return
    try {
      localStorage.setItem(draftKey(studentId, evaluationId), JSON.stringify({ scores, comments }))
    } catch {
      // Quota or a blocked store. Losing the draft is bad; a toast about it on
      // every keystroke is worse.
    }
  }, [scores, comments, studentId, evaluationId])

  const submitted = form?.submittedAt != null
  const closed = form?.status === 'closed'
  const locked = submitted || closed

  const totals = useMemo(() => {
    if (!form) return { done: 0, total: 0 }
    const total = form.peers.length
    const done = form.peers.filter(
      (p) => form.criteria.every((c) => scores[p.id]?.[c.id] !== undefined),
    ).length
    return { done, total }
  }, [form, scores])

  const overLongComment = useMemo(
    () => Object.values(comments).some((c) => c.length > PEER_COMMENT_MAX),
    [comments],
  )

  const canSubmit =
    form !== null &&
    !locked &&
    totals.total > 0 &&
    totals.done === totals.total &&
    !overLongComment

  function setScore(rateeId: string, criterionId: string, value: number) {
    setScores((prev) => ({ ...prev, [rateeId]: { ...(prev[rateeId] ?? {}), [criterionId]: value } }))
  }

  async function submit() {
    if (!form) return
    setBusy(true)
    try {
      const ratings: PeerRatingInput[] = []
      for (const p of form.peers) {
        for (const c of form.criteria) {
          const v = scores[p.id]?.[c.id]
          // canSubmit already guarantees this, but building the payload from
          // the peer and criteria lists rather than from whatever is in state
          // is what keeps a stale draft from sending a criterion that no
          // longer exists.
          if (v === undefined) continue
          ratings.push({ ratee_id: p.id, criterion_id: c.id, score: v })
        }
      }
      const body: PeerCommentInput[] = form.peers
        .map((p) => ({ ratee_id: p.id, body: (comments[p.id] ?? '').trim() }))
        .filter((c) => c.body.length > 0)

      await submitPeerEvaluation(form.id, ratings, body)
      try {
        localStorage.removeItem(draftKey(studentId, evaluationId))
      } catch {
        // Nothing to do. The draft is now stale but harmless: the form is
        // locked from here on and will never read it again.
      }
      toast('Submitted. Thanks for being honest.', 'success')
      navigate('/app/peer', { replace: true })
    } catch (e) {
      // The RPC's rejections are real sentences ("Rate every peer before
      // submitting"), so they are shown as-is.
      toast(errorText(e, "Couldn't submit that."), 'error')
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <ListSkeleton />
  if (loadError) {
    return (
      <ErrorState onRetry={() => void load()} detail="Your draft is saved on this device.">
        {loadError}
      </ErrorState>
    )
  }
  if (!form) return null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title={form.title}
        subtitle={`${form.subjectCode} · ${form.subjectName}`}
        fallback="/app/peer"
      />

      <div className="space-y-4">
        {form.instructions && (
          <Card pad="tight">
            <p className="text-sm text-muted">{form.instructions}</p>
          </Card>
        )}

        {submitted ? (
          <Card pad="tight" className="border-success/30 bg-success-solid/8">
            <p className="text-sm font-semibold text-success">You already submitted this.</p>
            <p className="mt-0.5 text-xs text-muted">
              Answers are final, so this is now read-only.
            </p>
          </Card>
        ) : closed ? (
          <Card pad="tight" className="border-danger/30 bg-danger-solid/8">
            <p className="text-sm font-semibold text-danger">This closed before you submitted.</p>
            <p className="mt-0.5 text-xs text-muted">Talk to your instructor if that is a problem.</p>
          </Card>
        ) : (
          form.closesAt && (
            <p className="px-1 text-xs text-muted">
              Closes in {countdownTo(new Date(form.closesAt))}
            </p>
          )
        )}

        {form.peers.length === 0 ? (
          <EmptyState description="Ask your instructor if that looks wrong.">
            You have not been placed in a group for this one.
          </EmptyState>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-muted">Your classmates</h2>
              <Chip tone={totals.done === totals.total ? 'success' : 'neutral'} size="sm">
                {totals.done} of {totals.total} done
              </Chip>
            </div>

            <div className="space-y-3">
              {form.peers.map((p) => (
                <PeerCard
                  key={p.id}
                  peer={p}
                  criteria={form.criteria}
                  scores={scores[p.id] ?? {}}
                  comment={comments[p.id] ?? ''}
                  open={openId === p.id}
                  disabled={locked}
                  // One card open at a time. With six peers and four criteria
                  // each, all of them open is a screen nobody can find their
                  // place in.
                  onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
                  onScore={(cid, v) => setScore(p.id, cid, v)}
                  onComment={(body) => setComments((prev) => ({ ...prev, [p.id]: body }))}
                />
              ))}
            </div>

            {!locked && (
              <StickyBar>
                <Button
                  className="w-full"
                  disabled={!canSubmit}
                  onClick={() => setConfirm(true)}
                >
                  {totals.done === totals.total
                    ? 'Submit'
                    : `Rate ${totals.total - totals.done} more`}
                </Button>
              </StickyBar>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        title="Send these answers?"
        message={`You are rating ${totals.total} classmate${totals.total === 1 ? '' : 's'}. Your name is never shown to them.`}
        // The one thing they cannot find out afterwards, said before it happens.
        detail="This cannot be changed or taken back once it is sent."
        confirmLabel="Submit"
        busy={busy}
        onConfirm={() => void submit()}
        onClose={() => setConfirm(false)}
      />
    </div>
  )
}
