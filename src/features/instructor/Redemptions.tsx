import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Rows } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SuccessTick } from '@/components/ui/SuccessTick'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { TicketIcon } from '@/components/ui/icons'
import { decideRedemption, listRedemptions, listTopSpenders } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { TONE } from '@/lib/tone'
import { useInstructor } from './InstructorLayout'
import { ExcusesInbox } from './ExcusesInbox'
import { RewardsCatalog } from './RewardsCatalog'
import type { RedemptionKind, RedemptionRequest, RedemptionStatus, SpenderStat } from '@/lib/types'

type RequestsTab = 'points' | 'excuses' | 'rewards'

const KIND_LABEL: Record<RedemptionKind, string> = {
  quiz: 'Quiz',
  activity: 'Activity',
  exam: 'Exam',
  other: 'Other',
}

const STATUS_META: Record<RedemptionStatus, { label: string; cls: string }> = {
  pending: { label: 'Waiting', cls: TONE.warn.chip },
  approved: { label: 'Approved', cls: TONE.success.chip },
  rejected: { label: 'Declined', cls: TONE.danger.chip },
  cancelled: { label: 'Cancelled', cls: TONE.neutral.chip },
}

function errorText(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m && m.length <= 160 ? m : fallback
}

/** Students asking to spend points on a grade — approve or decline. */
export function Redemptions() {
  const { sections } = useInstructor()
  const { toast } = useToast()

  const [all, setAll] = useState<RedemptionRequest[]>([])
  const [spenders, setSpenders] = useState<SpenderStat[]>([])
  const [loading, setLoading] = useState(true)
  const [decision, setDecision] = useState<{ req: RedemptionRequest; approve: boolean } | null>(
    null,
  )
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(false)
  const [tab, setTab] = useState<RequestsTab>('points')

  const sectionName = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, top] = await Promise.all([listRedemptions({ limit: 100 }), listTopSpenders(5)])
      setAll(list)
      setSpenders(top)
    } catch {
      toast('Could not load requests.', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  // Page-scoped: new requests appear without a refresh. Removed on unmount.
  useEffect(() => {
    const channel = uniqueChannel('redemptions-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_redemptions' }, () => {
        void load()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  const pending = useMemo(() => all.filter((r) => r.status === 'pending'), [all])
  const decided = useMemo(() => all.filter((r) => r.status !== 'pending').slice(0, 30), [all])

  async function onDecide() {
    if (!decision) return
    setBusy(true)
    try {
      await decideRedemption(decision.req.id, decision.approve, note)
      toast(
        decision.approve
          ? `Approved — ${decision.req.points} points used.`
          : 'Request declined.',
        decision.approve ? 'success' : 'info',
      )
      if (decision.approve) setTick(true)
      setDecision(null)
      setNote('')
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not save that decision.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Reached from the header ticket icon, so no tab lights up — by design.
          The missing back affordance was the bug. */}
      <PageHeader
        title="Requests"
        subtitle={
          tab === 'points'
            ? 'Students asking to put points toward a grade. Nothing is spent until you approve.'
            : tab === 'excuses'
              ? 'Absence excuses. Tap Excuse once the student presents their admission slip.'
              : 'Your price list — what students can spend points on.'
        }
        fallback="/teach"
      />

      {/* Tabs — one inbox, two request types, plus the price list behind them. */}
      <SegmentedControl
        label="Request type"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'points', label: 'Points' },
          { value: 'excuses', label: 'Excuses' },
          { value: 'rewards', label: 'Rewards' },
        ]}
      />

      {tab === 'excuses' && <ExcusesInbox />}

      {tab === 'rewards' && <RewardsCatalog />}

      {tab === 'points' &&
        (loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          {/* Waiting */}
          <div>
            <SectionLabel>
              Waiting{pending.length > 0 ? ` (${pending.length})` : ''}
            </SectionLabel>
            {pending.length === 0 ? (
              <EmptyState icon={<TicketIcon />}>
                Nothing waiting. All caught up.
              </EmptyState>
            ) : (
              <div className="space-y-2">
                {pending.map((r) => (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.studentName} url={r.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{r.studentName}</p>
                        <p className="text-xs text-muted">
                          {sectionName(r.sectionId)} · has {r.semesterPoints} pts ·{' '}
                          {timeAgo(r.requestedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 font-display text-2xl font-bold tabular-nums text-accent">
                        {r.points}
                      </span>
                    </div>

                    <p className="mt-3 rounded-lg bg-card-2 px-3 py-2 text-sm">
                      <span className="font-semibold">{KIND_LABEL[r.kind]}</span>
                      {r.note ? <span className="text-muted"> · {r.note}</span> : null}
                    </p>

                    {r.points > r.semesterPoints && (
                      <p className="mt-2 text-xs font-semibold text-accent">
                        They only have {r.semesterPoints} points now — approving will fail.
                      </p>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setNote('')
                          setDecision({ req: r, approve: false })
                        }}
                      >
                        Decline
                      </Button>
                      <Button
                        onClick={() => {
                          setNote('')
                          setDecision({ req: r, approve: true })
                        }}
                      >
                        Approve −{r.points}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Top spenders */}
          {spenders.length > 0 && (
            <Card className="p-5">
              <p className="font-display font-bold">Top spenders</p>
              <p className="mb-3 text-xs text-muted">Points actually cashed in for grades.</p>
              <div className="space-y-2">
                {spenders.map((s, i) => (
                  <div key={s.studentId} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-center font-display text-sm font-bold text-muted">
                      {i + 1}
                    </span>
                    <Avatar name={s.studentName} url={s.avatarUrl} className="h-8 w-8" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {s.studentName}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {s.requests} request{s.requests === 1 ? '' : 's'}
                    </span>
                    <span className="shrink-0 font-display text-sm font-bold tabular-nums text-reward">
                      {s.spent}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Decided */}
          {decided.length > 0 && (
            <div>
              <SectionLabel>Recent decisions</SectionLabel>
              <Rows>
                {decided.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3.5">
                    <Avatar name={r.studentName} url={r.avatarUrl} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.studentName}</p>
                      <p className="truncate text-xs text-muted">
                        {r.points} pts · {KIND_LABEL[r.kind]}
                        {r.decidedAt ? ` · ${timeAgo(r.decidedAt)}` : ''}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                        STATUS_META[r.status].cls,
                      )}
                    >
                      {STATUS_META[r.status].label}
                    </span>
                  </div>
                ))}
              </Rows>
            </div>
          )}
        </>
      ))}

      <ConfirmDialog
        open={!!decision}
        variant={decision?.approve ? 'danger' : 'default'}
        title={decision?.approve ? `Approve ${decision.req.points} points?` : 'Decline this request?'}
        message={
          decision?.approve ? (
            <>
              <span className="font-semibold text-ink">{decision.req.studentName}</span> spends{' '}
              <span className="font-semibold text-ink">{decision.req.points} points</span> on their{' '}
              {KIND_LABEL[decision.req.kind].toLowerCase()}. Their total drops to{' '}
              {Math.max(0, decision.req.semesterPoints - decision.req.points)}.
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">{decision?.req.studentName}</span> keeps
              their {decision?.req.points} points. They’ll be notified.
            </>
          )
        }
        detail={
          decision?.approve
            ? 'This deducts the points for real — their level and rank drop with it.'
            : undefined
        }
        confirmLabel={decision?.approve ? 'Approve & deduct' : 'Decline'}
        busy={busy}
        onConfirm={onDecide}
        onClose={() => setDecision(null)}
      >
        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          placeholder={decision?.approve ? 'e.g. applied to Quiz 2' : 'e.g. already maxed this quiz'}
          hint="They'll see this in their history and notification."
        />
      </ConfirmDialog>

      <SuccessTick show={tick} onDone={() => setTick(false)} />
    </div>
  )
}
