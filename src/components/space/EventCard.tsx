import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { getEventAnswers, submitEventAnswer } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { countdownTo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { MAX_POST_LENGTH, type LoungeEvent, type LoungeEventAnswer } from '@/lib/types'

/**
 * The Random Event, pinned above the Lounge feed.
 *
 * ── WHAT A STUDENT CAN SEE WHILE IT IS OPEN ────────────────────────────────
 * The question, the prize, how many people have answered, and their OWN
 * answer. Not one word of anyone else's — that is enforced twice server-side
 * (an RLS policy and the RPC), because the first correct answer being visible
 * is what would make auto-award pay the fastest copier rather than the fastest
 * thinker.
 *
 * Editing your answer while it is open is allowed on purpose: nobody can see
 * it, so there is nothing to game, and refusing an edit punishes a typo.
 */
export function EventCard({
  event,
  canAnswer,
  onAnswered,
}: {
  event: LoungeEvent
  canAnswer: boolean
  onAnswered?: () => void
}) {
  const { toast } = useToast()
  const [body, setBody] = useState(event.myAnswer ?? '')
  const [editing, setEditing] = useState(event.myAnswer === null)
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState<string | null>(null)

  // Live countdown. One interval, cleared on unmount — the deadline is the
  // whole reason an event feels like a race.
  useEffect(() => {
    if (!event.closesAt) {
      setLeft(null)
      return
    }
    const tick = () => setLeft(countdownTo(new Date(event.closesAt!)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [event.closesAt])

  async function submit() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      await submitEventAnswer(event.id, text)
      setEditing(false)
      toast('Answer locked in.', 'success')
      onAnswered?.()
    } catch (e) {
      // The text stays — a failed submit must not eat it.
      toast(errorText(e, 'Could not submit that.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const over = body.length > MAX_POST_LENGTH

  return (
    <Card pad="roomy" className="border-reward-solid/35 bg-reward-solid/5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="reward" size="sm">
          Random Event
        </Chip>
        <Chip tone="neutral" size="sm">
          {event.points} {event.points === 1 ? 'point' : 'points'}
        </Chip>
        {event.hasKey && (
          <Chip tone="neutral" size="sm">
            First {event.winnerCap}
          </Chip>
        )}
        {left && (
          <span className="ml-auto shrink-0 text-2xs font-semibold tabular-nums text-warn">
            {left}
          </span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words font-display text-base font-bold">
        {event.question}
      </p>

      <p className="mt-1 text-2xs text-muted">
        {event.answerCount} {event.answerCount === 1 ? 'answer' : 'answers'} so far · nobody can
        see them until it closes
      </p>

      {!canAnswer ? (
        <p className="mt-3 text-sm text-muted">You can&apos;t answer right now.</p>
      ) : editing ? (
        <div className="mt-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submit()
              }
            }}
            rows={2}
            placeholder="Your answer…"
            // text-base: below 16px iOS Safari zooms on focus and never zooms back.
            className={cn(
              'w-full resize-none rounded-xl border bg-card px-3.5 py-2.5 text-base text-ink',
              'placeholder:text-muted/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30',
              over ? 'border-danger' : 'border-line',
            )}
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-2xs text-muted">
              {event.myAnswer ? 'You can change it until it closes.' : 'One answer each.'}
            </span>
            <Button
              size="sm"
              className="shrink-0"
              loading={busy}
              disabled={body.trim().length === 0 || over || busy}
              onClick={() => void submit()}
            >
              {event.myAnswer ? 'Update' : 'Answer'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-card px-3 py-2">
          <p className="text-2xs font-semibold text-muted">Your answer</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{body}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 text-xs font-semibold text-accent"
          >
            Change it
          </button>
        </div>
      )}
    </Card>
  )
}

/** The revealed answers, once an event has closed. */
export function EventResults({ eventId }: { eventId: string }) {
  const [answers, setAnswers] = useState<LoungeEventAnswer[]>([])

  useEffect(() => {
    void getEventAnswers(eventId)
      .then(setAnswers)
      .catch(() => {
        /* the reveal just does not render */
      })
  }, [eventId])

  if (answers.length === 0) return null

  return (
    <div className="space-y-1.5">
      {answers.map((a) => (
        <div
          key={a.id}
          className={cn(
            'flex items-start gap-2.5 rounded-xl px-3 py-2',
            a.awardedPoints ? 'bg-reward-solid/10' : 'bg-card-2',
          )}
        >
          <Avatar
            name={a.displayName}
            url={a.avatarUrl}
            className="h-7 w-7"
            textClassName="text-2xs"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate text-xs font-semibold">{a.displayName}</span>
              {a.awardedPoints ? (
                <Chip tone="reward" size="sm">
                  +{a.awardedPoints}
                </Chip>
              ) : a.isCorrect ? (
                <Chip tone="success" size="sm">
                  Correct
                </Chip>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{a.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
