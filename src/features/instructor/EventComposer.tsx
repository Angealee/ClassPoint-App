import { useCallback, useEffect, useState } from 'react'
import { Card, Rows } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  awardEventAnswer,
  closeLoungeEvent,
  createLoungeEvent,
  getEventAnswers,
  listLoungeEvents,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { pickWinners } from '@/lib/lounge-answers'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import {
  MAX_EVENT_POINTS,
  type LoungeEventAnswer,
  type LoungeEventSummary,
} from '@/lib/types'

/**
 * Random Events, on /teach/space.
 *
 * ── THE PREVIEW IS THE RISKY PART ──────────────────────────────────────────
 * Before closing an answer-key event this screen shows who WOULD be paid, using
 * `pickWinners` from lib/lounge-answers.ts — a mirror of `cp_event_normalize()`
 * in 0045, pinned by a test. If the two ever drift, this preview becomes a lie
 * about real points. It is a preview only: the database decides.
 */

const HOURS = [
  { label: 'No deadline', value: '' },
  { label: '15 minutes', value: '0.25' },
  { label: '1 hour', value: '1' },
  { label: '3 hours', value: '3' },
  { label: '1 day', value: '24' },
]

export function EventComposer() {
  const { toast } = useToast()
  const [events, setEvents] = useState<LoungeEventSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const [question, setQuestion] = useState('')
  const [points, setPoints] = useState('5')
  const [cap, setCap] = useState('5')
  const [key, setKey] = useState('')
  const [hours, setHours] = useState('')

  const [openFor, setOpenFor] = useState<LoungeEventSummary | null>(null)
  const [answers, setAnswers] = useState<LoungeEventAnswer[]>([])
  const [answerKeyEcho, setAnswerKeyEcho] = useState('')
  const [closeTarget, setCloseTarget] = useState<LoungeEventSummary | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setEvents(await listLoungeEvents())
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function post() {
    const q = question.trim()
    const p = Number(points)
    if (!q || !p) return
    setBusy(true)
    try {
      await createLoungeEvent({
        question: q,
        points: p,
        winnerCap: Number(cap) || 5,
        answerKey: key.trim() || null,
        closesAt: hours ? new Date(Date.now() + Number(hours) * 3600_000) : null,
      })
      setQuestion('')
      setKey('')
      toast('Posted. Everyone in the beta has been notified.', 'success')
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not post that event.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function openAnswers(ev: LoungeEventSummary) {
    setOpenFor(ev)
    setAnswerKeyEcho('')
    try {
      setAnswers(await getEventAnswers(ev.id))
    } catch (e) {
      toast(errorText(e, 'Could not load answers.'), 'error')
    }
  }

  async function confirmClose() {
    if (!closeTarget) return
    setBusy(true)
    try {
      const paid = await closeLoungeEvent(closeTarget.id)
      toast(
        paid > 0
          ? `Closed. ${paid} ${paid === 1 ? 'student' : 'students'} paid.`
          : 'Closed. Award the answers you like.',
        'success',
      )
      setCloseTarget(null)
      await load()
      if (openFor?.id === closeTarget.id) await openAnswers(closeTarget)
    } catch (e) {
      toast(errorText(e, 'Could not close that event.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function award(a: LoungeEventAnswer) {
    setBusy(true)
    try {
      const paid = await awardEventAnswer(a.id)
      setAnswers((list) =>
        list.map((x) => (x.id === a.id ? { ...x, awardedPoints: paid, isCorrect: true } : x)),
      )
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not award that.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  // Preview only — the database decides. See the header.
  const wouldWin =
    openFor && openFor.hasKey && openFor.status === 'open' && answerKeyEcho.trim()
      ? new Set(pickWinners(answers, answerKeyEcho, openFor.winnerCap).map((a) => a.id))
      : null

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>New Random Event</SectionLabel>
        <Card pad="roomy">
          <div className="space-y-3">
            <Textarea
              label="Question"
              rows={2}
              maxLength={600}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What's the hardest thing about Platform Tech this week?"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Points each"
                type="number"
                min={1}
                max={MAX_EVENT_POINTS}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
              <Input
                label="Winners"
                type="number"
                min={1}
                max={200}
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
            </div>
            <Input
              label="Answer key (leave blank for open-ended)"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="runtime polymorphism"
              hint="Case, spacing and punctuation are ignored when matching."
            />
            <Select
              label="Closes"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              wrapperClassName="w-full"
            >
              {HOURS.map((h) => (
                <option key={h.label} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted">
              {key.trim()
                ? 'Correct answers are paid automatically when it closes — by the deadline, or when you close it.'
                : 'Open-ended: answers reveal on close and you award the ones you like.'}
            </p>
            <Button
              className="w-full"
              loading={busy}
              disabled={!question.trim() || !Number(points) || busy}
              onClick={() => void post()}
            >
              Post event
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <SectionLabel>Events</SectionLabel>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : failed ? (
          <ErrorState onRetry={() => void load()}>Could not load events.</ErrorState>
        ) : events.length === 0 ? (
          <EmptyState>No events yet.</EmptyState>
        ) : (
          <Rows>
            {events.map((ev) => (
              <div key={ev.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={ev.status === 'open' ? 'success' : 'neutral'} size="sm" dot>
                    {ev.status === 'open' ? 'Open' : 'Closed'}
                  </Chip>
                  <Chip tone="reward" size="sm">
                    {ev.points} pts
                  </Chip>
                  <Chip tone="neutral" size="sm">
                    {ev.hasKey ? `Auto · first ${ev.winnerCap}` : 'Open-ended'}
                  </Chip>
                  <span className="ml-auto shrink-0 text-2xs text-muted">
                    {timeAgo(ev.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium">{ev.question}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {ev.answerCount} {ev.answerCount === 1 ? 'answer' : 'answers'} ·{' '}
                  {ev.awardedCount} paid
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void openAnswers(ev)}>
                    Answers
                  </Button>
                  {ev.status === 'open' && (
                    <Button size="sm" variant="danger" onClick={() => setCloseTarget(ev)}>
                      Close &amp; pay
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Rows>
        )}
      </div>

      <Sheet open={!!openFor} onClose={() => setOpenFor(null)} title="Answers">
        <div className="space-y-3 pb-2">
          {openFor?.hasKey && openFor.status === 'open' && (
            <Input
              label="Preview winners"
              value={answerKeyEcho}
              onChange={(e) => setAnswerKeyEcho(e.target.value)}
              placeholder="Type the answer key to see who would win"
              hint="A preview only — the database decides when you close it."
            />
          )}

          {answers.length === 0 ? (
            <EmptyState>Nobody has answered yet.</EmptyState>
          ) : (
            <div className="space-y-1.5">
              {answers.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    'rounded-xl px-3 py-2',
                    a.awardedPoints
                      ? 'bg-reward-solid/12'
                      : wouldWin?.has(a.id)
                        ? 'bg-success-solid/10'
                        : 'bg-card-2',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-xs font-semibold">
                      {a.displayName}
                    </span>
                    {a.awardedPoints ? (
                      <Chip tone="reward" size="sm">
                        +{a.awardedPoints}
                      </Chip>
                    ) : wouldWin?.has(a.id) ? (
                      <Chip tone="success" size="sm">
                        Would win
                      </Chip>
                    ) : null}
                    <span className="ml-auto shrink-0 text-2xs text-muted">
                      {timeAgo(a.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{a.body}</p>
                  {openFor?.status === 'closed' && !a.awardedPoints && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1.5"
                      disabled={busy}
                      onClick={() => void award(a)}
                    >
                      Award {openFor.points}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!closeTarget}
        title="Close this event?"
        message={
          closeTarget?.hasKey
            ? `Correct answers are paid ${closeTarget.points} points each, up to ${closeTarget.winnerCap}.`
            : 'Answers reveal to everyone, and you can award the ones you like.'
        }
        detail="Closing cannot be undone, and points are real."
        confirmLabel="Close and pay"
        busy={busy}
        onConfirm={() => void confirmClose()}
        onClose={() => setCloseTarget(null)}
      />
    </div>
  )
}
