import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { PageHeader } from '@/components/ui/PageHeader'
import { StickyBar } from '@/components/ui/StickyBar'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon } from '@/components/ui/icons'
import { PeerCard, peerCardId } from '@/components/peer/PeerCard'
import { PeerReviewSheet } from '@/components/peer/PeerReviewSheet'
import { getPeerEvaluation, submitPeerEvaluation } from '@/lib/api'
import { useStudentData } from '@/features/student/StudentData'
import { errorText } from '@/lib/errors'
import { countdownTo } from '@/lib/time'
import { cn } from '@/lib/cn'
import {
  PEER_COMMENT_MAX,
  type PeerCommentInput,
  type PeerEvaluationForm as FormData,
  type PeerRatingInput,
} from '@/lib/types'

/** rateeId → { criterionId → score }. */
type Scores = Record<string, Record<string, number>>
/** rateeId → comment. */
type Comments = Record<string, string>

interface Draft {
  scores: Scores
  comments: Comments
}

const SCROLL_AFTER_MS = 260

function draftKey(studentId: string, evaluationId: string): string {
  return `cp_peer_draft_${studentId}_${evaluationId}_v1`
}

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
  const [reviewing, setReviewing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const studentId = me?.id ?? ''
  const restored = useRef(false)
  const scrollTimer = useRef<number | null>(null)

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

  useEffect(
    () => () => {
      if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current)
    },
    [],
  )

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
    }
  }, [form, studentId, evaluationId])

  const [savedOk, setSavedOk] = useState(true)
  useEffect(() => {
    if (!restored.current || !studentId) return
    try {
      localStorage.setItem(draftKey(studentId, evaluationId), JSON.stringify({ scores, comments }))
      setSavedOk(true)
    } catch {
      setSavedOk(false)
    }
  }, [scores, comments, studentId, evaluationId])

  const submitted = form?.submittedAt != null
  const closed = form?.status === 'closed'
  const locked = submitted || closed

  const isDone = useCallback(
    (peerId: string) =>
      !!form &&
      form.criteria.length > 0 &&
      form.criteria.every((c) => scores[peerId]?.[c.id] !== undefined),
    [form, scores],
  )

  const totals = useMemo(() => {
    if (!form) return { done: 0, total: 0 }
    return { done: form.peers.filter((p) => isDone(p.id)).length, total: form.peers.length }
  }, [form, isDone])

  const hasAnswers =
    Object.values(scores).some((s) => Object.keys(s).length > 0) ||
    Object.values(comments).some((c) => c.trim().length > 0)

  const longComment = useMemo(
    () => form?.peers.find((p) => (comments[p.id] ?? '').length > PEER_COMMENT_MAX) ?? null,
    [form, comments],
  )

  function setScore(rateeId: string, criterionId: string, value: number) {
    setScores((prev) => ({ ...prev, [rateeId]: { ...(prev[rateeId] ?? {}), [criterionId]: value } }))
  }

  function openPeer(peerId: string) {
    setReviewing(false)
    setOpenId(peerId)
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current)
    scrollTimer.current = window.setTimeout(() => {
      document
        .getElementById(peerCardId(peerId))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, SCROLL_AFTER_MS)
  }

  function nextUnfinished(fromId: string | null) {
    if (!form) return null
    const peers = form.peers
    const start = fromId ? peers.findIndex((p) => p.id === fromId) + 1 : 0
    for (let k = 0; k < peers.length; k++) {
      const p = peers[(start + k) % peers.length]
      if (p.id !== fromId && !isDone(p.id)) return p
    }
    return null
  }

  async function submit() {
    if (!form) return
    setBusy(true)
    try {
      const ratings: PeerRatingInput[] = []
      for (const p of form.peers) {
        for (const c of form.criteria) {
          const v = scores[p.id]?.[c.id]
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
      }
      toast('Submitted. Thanks for being honest.', 'success')
      navigate('/app/peer', { replace: true })
    } catch (e) {
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

  const firstWaiting = nextUnfinished(null)
  const allDone = totals.total > 0 && totals.done === totals.total

  const primary = longComment
    ? {
        label: `Shorten your comment for ${longComment.displayName}`,
        onClick: () => openPeer(longComment.id),
      }
    : allDone
      ? { label: 'Review and submit', onClick: () => setReviewing(true) }
      : firstWaiting
        ? {
            label:
              totals.total - totals.done > 1
                ? `Rate ${firstWaiting.displayName} · ${totals.total - totals.done} left`
                : `Rate ${firstWaiting.displayName}`,
            onClick: () => openPeer(firstWaiting.id),
          }
        : null

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
            <div>
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-muted">Your classmates</h2>
                <Chip tone={allDone ? 'success' : 'neutral'} size="sm">
                  {totals.done} of {totals.total} done
                </Chip>
              </div>

              {!locked && (
                <div
                  className="mt-3 flex gap-3 overflow-x-auto px-1 pb-1"
                  role="group"
                  aria-label="Jump to a classmate"
                >
                  {form.peers.map((p) => {
                    const done = isDone(p.id)
                    const active = openId === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openPeer(p.id)}
                        aria-label={`${p.displayName}${done ? ', done' : ''}`}
                        className="flex w-14 shrink-0 flex-col items-center gap-1"
                      >
                        <span className="relative">
                          <Avatar
                            name={p.displayName}
                            url={p.avatarUrl}
                            className={cn(
                              'h-11 w-11 ring-2 ring-offset-2 ring-offset-canvas',
                              active ? 'ring-accent-solid' : done ? 'ring-success-solid' : 'ring-transparent',
                            )}
                          />
                          {done && (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-success-solid text-white ring-2 ring-canvas">
                              <CheckIcon className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            'w-full truncate text-center text-2xs',
                            done ? 'text-ink' : 'text-muted',
                          )}
                        >
                          {p.displayName}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {!locked && hasAnswers && (
                <p
                  className={cn(
                    'mt-2 flex items-center gap-1.5 px-1 text-xs',
                    savedOk ? 'text-muted' : 'text-danger',
                  )}
                  aria-live="polite"
                >
                  {savedOk ? (
                    <>
                      <CheckIcon className="h-3.5 w-3.5" />
                      Saved on this device. You can close the app and come back.
                    </>
                  ) : (
                    'Couldn’t save on this device. Finish before closing the app.'
                  )}
                </p>
              )}
            </div>

            <div className="space-y-3">
              {form.peers.map((p) => {
                const after = nextUnfinished(p.id)
                return (
                  <PeerCard
                    key={p.id}
                    peer={p}
                    criteria={form.criteria}
                    scores={scores[p.id] ?? {}}
                    comment={comments[p.id] ?? ''}
                    open={openId === p.id}
                    disabled={locked}
                    next={
                      after
                        ? { label: `Next: ${after.displayName}`, onClick: () => openPeer(after.id) }
                        : {
                            label: 'Review and submit',
                            onClick: () => {
                              setOpenId(null)
                              setReviewing(true)
                            },
                          }
                    }
                    onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
                    onScore={(cid, v) => setScore(p.id, cid, v)}
                    onComment={(body) => setComments((prev) => ({ ...prev, [p.id]: body }))}
                  />
                )
              })}
            </div>

            {!locked && primary && (
              <StickyBar>
                <Button className="w-full truncate" onClick={primary.onClick}>
                  {primary.label}
                </Button>
              </StickyBar>
            )}
          </>
        )}
      </div>

      <PeerReviewSheet
        open={reviewing}
        peers={form.peers}
        criteria={form.criteria}
        scores={scores}
        comments={comments}
        onEdit={openPeer}
        onSubmit={() => setConfirm(true)}
        onClose={() => setReviewing(false)}
      />

      <ConfirmDialog
        open={confirm}
        title="Send these answers?"
        message={`You are rating ${totals.total} classmate${totals.total === 1 ? '' : 's'}. Your name is never shown to them.`}
        detail="This cannot be changed or taken back once it is sent."
        confirmLabel="Submit"
        busy={busy}
        onConfirm={() => void submit()}
        onClose={() => setConfirm(false)}
      />
    </div>
  )
}
