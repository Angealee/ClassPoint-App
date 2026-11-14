import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, Rows } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon } from '@/components/ui/icons'
import { PeerCard, PEER_FOCUS_ID } from '@/components/peer/PeerCard'
import { PeerReviewSheet } from '@/components/peer/PeerReviewSheet'
import { PeerStrip } from '@/components/peer/PeerStrip'
import { getPeerEvaluation, submitPeerEvaluation } from '@/lib/api'
import { useStudentData } from '@/features/student/StudentData'
import { errorText } from '@/lib/errors'
import { deadlineLabel } from '@/lib/peer-list'
import { snap } from '@/lib/motion'
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

/** Which classmate is on screen, and which way the last move went (for the slide). */
interface View {
  id: string | null
  dir: 1 | -1
}

/** Long enough for the new card to mount before the page is scrolled to it. */
const SCROLL_AFTER_MS = 60

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
  const [view, setView] = useState<View>({ id: null, dir: 1 })
  const [reviewing, setReviewing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => Date.now())

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

  // Restore the draft ONCE, then land on the first classmate still waiting (or the first one).
  useEffect(() => {
    if (restored.current || !form || !studentId) return
    restored.current = true
    let restoredScores: Scores = {}
    try {
      const raw = localStorage.getItem(draftKey(studentId, evaluationId))
      if (raw) {
        const d = JSON.parse(raw) as Draft
        if (d && typeof d === 'object') {
          restoredScores = d.scores ?? {}
          setScores(restoredScores)
          setComments(d.comments ?? {})
        }
      }
    } catch {
      // A corrupt draft is the same as no draft.
    }
    const waiting = form.peers.find(
      (p) => !form.criteria.every((c) => restoredScores[p.id]?.[c.id] !== undefined),
    )
    setView({ id: (waiting ?? form.peers[0])?.id ?? null, dir: 1 })
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
    if (!form) return
    const from = form.peers.findIndex((p) => p.id === view.id)
    const to = form.peers.findIndex((p) => p.id === peerId)
    setReviewing(false)
    setView({ id: peerId, dir: to < from ? -1 : 1 })
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current)
    scrollTimer.current = window.setTimeout(() => {
      document.getElementById(PEER_FOCUS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
        // The draft is already irrelevant once the server has the answers.
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

  const current = form.peers.find((p) => p.id === view.id) ?? null
  const index = current ? form.peers.indexOf(current) : -1
  const allDone = totals.total > 0 && totals.done === totals.total

  // What the footer under the comment offers, worked out in one place so it never contradicts the
  // strip above it: Back is always there after the first; forward appears only once THIS classmate
  // is finished (a greyed-out Next teaches nothing, a sentence about what is left does).
  const currentDone = current ? isDone(current.id) : false
  const currentOver = current ? (comments[current.id] ?? '').length > PEER_COMMENT_MAX : false
  const blocker = longComment && longComment.id !== current?.id ? longComment : null
  const after = current ? nextUnfinished(current.id) : null
  const left = current ? form.criteria.filter((c) => scores[current.id]?.[c.id] === undefined).length : 0

  const forward =
    !current || !currentDone || currentOver
      ? null
      : blocker
        ? { label: `Shorten ${blocker.displayName}'s comment`, onClick: () => openPeer(blocker.id) }
        : allDone
          ? { label: 'Review and submit', onClick: () => setReviewing(true) }
          : after
            ? { label: `Next: ${after.displayName}`, onClick: () => openPeer(after.id) }
            : null
  const hint = forward
    ? null
    : current && !currentDone
      ? `${left} question${left === 1 ? '' : 's'} left for ${current.displayName}`
      : null
  const back = index > 0 ? { label: 'Back', onClick: () => openPeer(form.peers[index - 1].id) } : null

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
              {deadlineLabel(form.closesAt, now).replace(/^c/, 'C')}
            </p>
          )
        )}

        {form.peers.length === 0 ? (
          <EmptyState description="Ask your instructor if that looks wrong.">
            You have not been placed in a group for this one.
          </EmptyState>
        ) : locked ? (
          <div>
            <h2 className="px-1 text-sm font-semibold text-muted">Your classmates</h2>
            <Rows className="mt-2">
              {form.peers.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={p.displayName} url={p.avatarUrl} className="h-9 w-9 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.displayName}</span>
                </div>
              ))}
            </Rows>
          </div>
        ) : !current ? (
          // The draft is still being read; a frame of the wrong classmate would be worse than this.
          <ListSkeleton rows={3} />
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-muted">Your classmates</h2>
                <Chip tone={allDone ? 'success' : 'neutral'} size="sm">
                  {totals.done} of {totals.total} done
                </Chip>
              </div>
              <div className="mt-3">
                <PeerStrip peers={form.peers} activeId={current.id} isDone={isDone} onPick={openPeer} />
              </div>

              {hasAnswers && (
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

            {/* Keyed so each classmate arrives fresh; enter-only, since a leaving card would hold
                the layout open for the length of its exit. */}
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: view.dir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={snap}
            >
              <PeerCard
                peer={current}
                position={{ index, total: form.peers.length }}
                criteria={form.criteria}
                scores={scores[current.id] ?? {}}
                comment={comments[current.id] ?? ''}
                back={back}
                forward={forward}
                hint={hint}
                onScore={(cid, v) => setScore(current.id, cid, v)}
                onComment={(body) => setComments((prev) => ({ ...prev, [current.id]: body }))}
              />
            </motion.div>
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
