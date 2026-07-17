import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { TicketIcon, WarningIcon } from '@/components/ui/icons'
import { cancelRedemption, listMyRedemptions, requestRedemption } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useStudentData } from './StudentData'
import {
  MAX_PENDING_REDEMPTIONS,
  MAX_REDEEM_POINTS,
  type Redemption,
  type RedemptionKind,
  type RedemptionStatus,
} from '@/lib/types'

const KINDS: Array<{ value: RedemptionKind; label: string }> = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'activity', label: 'Activity' },
  { value: 'exam', label: 'Exam' },
  { value: 'other', label: 'Other' },
]

const KIND_LABEL: Record<RedemptionKind, string> = {
  quiz: 'Quiz',
  activity: 'Activity',
  exam: 'Exam',
  other: 'Other',
}

const STATUS_META: Record<RedemptionStatus, { label: string; cls: string }> = {
  pending: { label: 'Waiting', cls: 'bg-gold-400/15 text-gold-700 dark:text-gold-300' },
  approved: { label: 'Approved', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'Declined', cls: 'bg-brand-500/10 text-brand-600 dark:text-brand-400' },
  cancelled: { label: 'Cancelled', cls: 'bg-card-2 text-muted' },
}

function errorText(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m && m.length <= 160 ? m : fallback
}

/** Put your class points toward a grade — request, instructor decides. */
export function UsePoints() {
  const { me, refresh } = useStudentData()
  const { toast } = useToast()
  const studentId = me?.id

  const [history, setHistory] = useState<Redemption[]>([])
  const [loading, setLoading] = useState(true)
  const [points, setPoints] = useState(5)
  const [kind, setKind] = useState<RedemptionKind>('quiz')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Redemption | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    try {
      setHistory(await listMyRedemptions(studentId))
    } catch {
      /* non-fatal — the page just shows its last-known state */
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    void load()
  }, [load])

  // Page-scoped channel: a decision lands live while this screen is open.
  // Subscribed on mount, removed on unmount — the durable student-self channel
  // in StudentData stays untouched.
  useEffect(() => {
    if (!studentId) return
    const channel = supabase
      .channel(`redemptions-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'point_redemptions',
          filter: `student_id=eq.${studentId}`,
        },
        () => {
          void load()
          void refresh() // an approval just changed their points
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [studentId, load, refresh])

  const balance = me?.lifetime_points ?? 0
  const pending = useMemo(() => history.filter((r) => r.status === 'pending'), [history])
  const decided = useMemo(() => history.filter((r) => r.status !== 'pending'), [history])
  const pendingPoints = useMemo(() => pending.reduce((n, r) => n + r.points, 0), [pending])
  const spent = useMemo(
    () => history.filter((r) => r.status === 'approved').reduce((n, r) => n + r.points, 0),
    [history],
  )

  /** Points already promised to waiting requests can't be spent twice. */
  const available = Math.max(0, balance - pendingPoints)
  const gaugePct = spent + balance > 0 ? (spent / (spent + balance)) * 100 : 0

  const tooMany = pending.length >= MAX_PENDING_REDEMPTIONS
  const noteRequired = kind === 'other'
  const noteOk = !noteRequired || note.trim().length > 0
  const amountOk = points >= 1 && points <= MAX_REDEEM_POINTS && points <= available
  const canSubmit = amountOk && noteOk && !tooMany && !submitting

  async function onSubmit() {
    setSubmitting(true)
    try {
      await requestRedemption({ points, kind, note })
      toast('Request sent — your instructor will decide.', 'success')
      setConfirming(false)
      setNote('')
      setPoints(5)
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not send that request. Try again.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function onCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelRedemption(cancelTarget.id)
      toast('Request withdrawn.', 'info')
      setCancelTarget(null)
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not cancel that request.'), 'error')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Use points</h1>
        <p className="text-sm text-muted">Put your points toward a quiz or activity grade.</p>
      </div>

      {/* Balance + the spent gauge */}
      <Card className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Available to spend</p>
            <p className="font-display text-3xl font-bold tabular-nums">{available}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Spent all-time</p>
            <p className="font-display text-xl font-bold tabular-nums text-gold-600 dark:text-gold-400">
              {spent}
            </p>
          </div>
        </div>

        {/* The "spent" counterpart to the XP bar — fills as points are used. */}
        <div className="mt-3">
          <div
            className="relative h-3 w-full overflow-hidden rounded-full bg-card-2 ring-1 ring-line"
            role="progressbar"
            aria-valuenow={Math.round(gaugePct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Points spent, out of everything you've ever earned"
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold-600 via-gold-500 to-gold-300"
              initial={{ width: 0 }}
              animate={{ width: `${gaugePct}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {spent === 0
              ? 'Nothing spent yet — your points are all still on the board.'
              : `You've cashed in ${spent} of the ${spent + balance} points you've earned.`}
          </p>
        </div>

        {pendingPoints > 0 && (
          <p className="mt-2 rounded-lg bg-gold-400/10 px-3 py-2 text-xs font-medium text-gold-700 dark:text-gold-300">
            {pendingPoints} point{pendingPoints === 1 ? '' : 's'} held by{' '}
            {pending.length} waiting request{pending.length === 1 ? '' : 's'}.
          </p>
        )}
      </Card>

      {/* The warning — spending is real and it costs rank */}
      <div className="flex gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/5 p-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-500">
          <WarningIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-brand-600 dark:text-brand-400">
            Spending points lowers your XP, level and rank
          </p>
          <p className="mt-0.5 text-xs text-muted">
            It counts exactly like losing points. You’re trading leaderboard standing for a better
            grade — worth it, but it doesn’t come back.
          </p>
        </div>
      </div>

      {/* Request form */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-400/15 text-gold-600 dark:text-gold-400">
            <TicketIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-bold">New request</p>
            <p className="text-xs text-muted">Up to {MAX_REDEEM_POINTS} points at a time.</p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">What’s it for?</p>
          <div className="grid grid-cols-4 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={cn(
                  'h-9 rounded-lg text-sm font-semibold transition-colors',
                  kind === k.value
                    ? 'bg-brand-500 text-white'
                    : 'bg-card-2 text-muted hover:text-ink',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">How many points?</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Fewer points"
              onClick={() => setPoints((p) => Math.max(1, p - 1))}
              className="h-11 w-11 shrink-0 rounded-xl bg-card-2 text-lg font-bold text-muted transition-colors hover:text-ink"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_REDEEM_POINTS}
              value={points}
              onChange={(e) =>
                setPoints(
                  Math.min(MAX_REDEEM_POINTS, Math.max(1, parseInt(e.target.value, 10) || 1)),
                )
              }
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas text-center font-display text-xl font-bold tabular-nums outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <button
              type="button"
              aria-label="More points"
              onClick={() => setPoints((p) => Math.min(MAX_REDEEM_POINTS, p + 1))}
              className="h-11 w-11 shrink-0 rounded-xl bg-card-2 text-lg font-bold text-muted transition-colors hover:text-ink"
            >
              +
            </button>
          </div>
          <p
            className={cn(
              'mt-1.5 text-xs',
              points > available ? 'font-semibold text-brand-500' : 'text-muted',
            )}
          >
            {points > available
              ? `You only have ${available} available.`
              : `You'd have ${available - points} left after this.`}
          </p>
        </div>

        <Input
          label={noteRequired ? 'Note (required)' : 'Note (optional)'}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 120))}
          placeholder="e.g. Quiz 2 — missed the bonus"
          hint={
            noteRequired
              ? 'Tell your instructor what this is for.'
              : 'Helps your instructor know which one.'
          }
        />

        {tooMany && (
          <p className="rounded-lg bg-card-2 px-3 py-2 text-xs text-muted">
            You already have {MAX_PENDING_REDEMPTIONS} requests waiting. Cancel one to ask for
            more.
          </p>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={!canSubmit}
          onClick={() => setConfirming(true)}
        >
          Request to use {points} point{points === 1 ? '' : 's'}
        </Button>
      </Card>

      {/* Waiting */}
      {pending.length > 0 && (
        <div>
          <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Waiting on your instructor</h2>
          <Card className="divide-y divide-line">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3.5">
                <RedemptionSummary r={r} />
                <button
                  type="button"
                  onClick={() => setCancelTarget(r)}
                  className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-brand-500"
                >
                  Cancel
                </button>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* History */}
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted">History</h2>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : decided.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            Nothing yet — your decided requests show up here.
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {decided.map((r) => (
              <div key={r.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <RedemptionSummary r={r} />
                </div>
                {r.decisionNote && (
                  <p className="mt-1.5 rounded-lg bg-card-2 px-2.5 py-1.5 text-xs text-muted">
                    “{r.decisionNote}”
                  </p>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        variant="danger"
        title={`Use ${points} point${points === 1 ? '' : 's'}?`}
        message={
          <>
            You’re asking to put{' '}
            <span className="font-semibold text-ink">
              {points} point{points === 1 ? '' : 's'}
            </span>{' '}
            toward your {KIND_LABEL[kind].toLowerCase()}. Nothing is spent until your instructor
            approves it.
          </>
        }
        detail={`If approved, your total drops to ${Math.max(0, balance - points)} — your level and leaderboard rank drop with it.`}
        confirmLabel="Send request"
        busy={submitting}
        onConfirm={onSubmit}
        onClose={() => setConfirming(false)}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        title="Withdraw this request?"
        message={
          <>
            Your {cancelTarget?.points} point{cancelTarget?.points === 1 ? '' : 's'} stay yours.
            You can always ask again.
          </>
        }
        confirmLabel="Withdraw"
        busy={cancelling}
        onConfirm={onCancel}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  )
}

function RedemptionSummary({ r }: { r: Redemption }) {
  const meta = STATUS_META[r.status]
  return (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card-2 font-display text-sm font-bold tabular-nums">
        {r.points}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {KIND_LABEL[r.kind]}
          {r.note ? ` · ${r.note}` : ''}
        </p>
        <p className="text-xs text-muted">{timeAgo(r.requestedAt)}</p>
      </div>
      <span
        className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', meta.cls)}
      >
        {meta.label}
      </span>
    </>
  )
}
