import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ReportsInbox } from './ReportsInbox'
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
import {
  decideRedemption,
  listGradeBoosts,
  listRedemptions,
  listTopSpenders,
  reverseGradeBoost,
} from '@/lib/api'
import { boostGain, formatMarks } from '@/lib/grade-boost'
import { cellKey, COMPONENT_LABEL } from '@/lib/grading'
import { timeAgo } from '@/lib/time'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { TONE } from '@/lib/tone'
import { useInstructor } from './InstructorLayout'
import { ExcusesInbox } from './ExcusesInbox'
import { RewardsCatalog } from './RewardsCatalog'
import type {
  GradeBoost,
  RedemptionKind,
  RedemptionRequest,
  RedemptionStatus,
  SpenderStat,
} from '@/lib/types'

type RequestsTab = 'points' | 'excuses' | 'rewards' | 'reports'

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
  // 0062 — an approved grade boost that was later undone.
  reversed: { label: 'Reversed', cls: TONE.neutral.chip },
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
  // An approved grade boost the instructor is about to undo (0062).
  const [reversing, setReversing] = useState<RedemptionRequest | null>(null)
  // EVERY approved boost (not just the recent ones) and its receipt, so any of
  // them can be reversed. Own state, own fetch, own try/catch: before 0062 there
  // is no such column, and that must cost this list and nothing else.
  const [boosts, setBoosts] = useState<RedemptionRequest[]>([])
  const [receipts, setReceipts] = useState<Map<string, GradeBoost>>(() => new Map())

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

    // Separate from the inbox above, deliberately. The inbox shows the newest 100
    // requests and "Recent decisions" the newest 30 of those, so a boost approved
    // a month ago was out of reach of Reverse. This asks for every approved boost.
    try {
      const applied = await listRedemptions({ status: 'approved', gradeLinked: true, limit: 500 })
      const itemIds = [...new Set(applied.map((r) => r.gradeItemId as string))]
      const rows = await listGradeBoosts(itemIds)
      setBoosts(applied)
      setReceipts(new Map(rows.map((b) => [cellKey(b.itemId, b.studentId), b])))
    } catch {
      setBoosts([])
      setReceipts(new Map())
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

  async function onReverse() {
    if (!reversing?.gradeItemId) return
    setBusy(true)
    try {
      const result = await reverseGradeBoost(reversing.gradeItemId, reversing.studentId)
      toast(
        result.markRestored
          ? `Points assist reversed — ${result.pointsRefunded} points returned.`
          : `${result.pointsRefunded} points returned. The mark had been edited since, so it was left as typed.`,
        'success',
      )
      setReversing(null)
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not reverse that points assist.'), 'error')
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
          { value: 'reports', label: 'Reports' },
        ]}
      />

      {tab === 'excuses' && <ExcusesInbox />}

      {tab === 'rewards' && <RewardsCatalog />}

      {tab === 'reports' && <ReportsInbox />}

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

                    {r.grade ? (
                      <BoostDetail r={r} />
                    ) : (
                      <p className="mt-3 rounded-lg bg-card-2 px-3 py-2 text-sm">
                        <span className="font-semibold">{KIND_LABEL[r.kind]}</span>
                        {r.note ? <span className="text-muted"> · {r.note}</span> : null}
                      </p>
                    )}

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

          {/* Every boost that is currently applied. Reversal used to be reachable
              only from the newest 30 decisions, so an older boost could not be
              undone from the app at all. */}
          {boosts.length > 0 && (
            <BoostsApplied boosts={boosts} receipts={receipts} onReverse={setReversing} />
          )}

          {/* Top spenders */}
          {spenders.length > 0 && (
            <Card className="p-5">
              <p className="font-display font-bold">Top spenders</p>
              {/* Same figures, same order, same settle as the board students
                  see — this card and /app/spenders read one row each from
                  `leaderboard_snapshot`. */}
              <p className="mb-3 text-xs text-muted">
                This semester, from the board students see.
              </p>
              <div className="space-y-2">
                {spenders.map((s) => (
                  <div key={s.studentId} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-center font-display text-sm font-bold text-muted">
                      {s.rank}
                    </span>
                    <Avatar name={s.studentName} url={s.avatarUrl} className="h-8 w-8" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {s.studentName}
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
                        {r.points} pts ·{' '}
                        {r.grade ? `Points assist · ${r.grade.itemName}` : KIND_LABEL[r.kind]}
                        {r.decidedAt ? ` · ${timeAgo(r.decidedAt)}` : ''}
                      </p>
                    </div>
                    {/* The one place a boost can be undone. Only an APPROVED one
                        has anything to undo: pending is declined instead, and a
                        reversed one is already back. */}
                    {r.status === 'approved' && r.gradeItemId && (
                      <Button size="sm" variant="outline" onClick={() => setReversing(r)}>
                        Reverse
                      </Button>
                    )}
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
            decision.req.grade ? (
              <>
                <span className="font-semibold text-ink">{decision.req.studentName}</span> spends{' '}
                <span className="font-semibold text-ink">{decision.req.points} points</span> to
                raise <span className="font-semibold text-ink">{decision.req.grade.itemName}</span>
                {decision.req.grade.currentScore !== null && (
                  <>
                    {' '}
                    from{' '}
                    <span className="font-semibold text-ink">
                      {formatMarks(decision.req.grade.currentScore)}
                    </span>{' '}
                    to{' '}
                    <span className="font-semibold text-ink">
                      {formatMarks(
                        decision.req.grade.currentScore +
                          boostGain(
                            decision.req.grade.currentScore,
                            decision.req.grade.maxScore,
                            decision.req.grade.bonus,
                          ),
                      )}
                    </span>
                  </>
                )}
                . Their total drops to{' '}
                {Math.max(0, decision.req.semesterPoints - decision.req.points)}.
              </>
            ) : (
              <>
                <span className="font-semibold text-ink">{decision.req.studentName}</span> spends{' '}
                <span className="font-semibold text-ink">{decision.req.points} points</span> on
                their {KIND_LABEL[decision.req.kind].toLowerCase()}. Their total drops to{' '}
                {Math.max(0, decision.req.semesterPoints - decision.req.points)}.
              </>
            )
          ) : (
            <>
              <span className="font-semibold text-ink">{decision?.req.studentName}</span> keeps
              their {decision?.req.points} points. They’ll be notified.
            </>
          )
        }
        detail={
          decision?.approve
            ? decision.req.grade
              ? 'This deducts the points AND rewrites their mark — their level and rank drop with it. You can reverse it afterwards from Recent decisions.'
              : 'This deducts the points for real — their level and rank drop with it.'
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

      <ConfirmDialog
        open={!!reversing}
        title="Reverse this points assist?"
        message={
          reversing ? (
            <>
              <span className="font-semibold text-ink">{reversing.studentName}</span> gets{' '}
              <span className="font-semibold text-ink">{reversing.points} points</span> back, and
              {reversing.grade ? <> {reversing.grade.itemName}</> : ' the column'} goes back to the
              mark it had before — unless you have edited it since, in which case your edit stays.
            </>
          ) : null
        }
        detail="They are told, and can ask for a points assist on this column again."
        confirmLabel="Reverse points assist"
        busy={busy}
        onConfirm={onReverse}
        onClose={() => setReversing(null)}
      />

      <SuccessTick show={tick} onDone={() => setTick(false)} />
    </div>
  )
}

/** Rows shown before "Show all" — the list is for finding one, not for reading. */
const BOOSTS_PREVIEW = 8

/**
 * Every grade boost that is currently applied, newest first, each with Reverse.
 *
 * Collapsed by default: most weeks you never need it, and a list that grows all
 * semester should not push the inbox you came here for down the page. The
 * name filter appears once there are enough rows to need one.
 *
 * The mark change comes from the RECEIPT (`17 → 20`), not from the request: the
 * request only knows the bonus the student agreed to, and the receipt knows what
 * was actually written after the cap. A boost whose receipt could not be read
 * still lists, without the arrow — Reverse works off the item and the student,
 * not the receipt.
 */
function BoostsApplied({
  boosts,
  receipts,
  onReverse,
}: {
  boosts: RedemptionRequest[]
  receipts: Map<string, GradeBoost>
  onReverse: (r: RedemptionRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const matching = needle
    ? boosts.filter(
        (r) =>
          r.studentName.toLowerCase().includes(needle) ||
          (r.grade?.itemName ?? '').toLowerCase().includes(needle),
      )
    : boosts
  const visible = showAll || needle ? matching : matching.slice(0, BOOSTS_PREVIEW)

  return (
    <div>
      <SectionLabel
        action={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="cp-tap-y shrink-0 text-xs font-semibold text-accent"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        }
      >
        Points assists applied ({boosts.length})
      </SectionLabel>

      {open && (
        <div className="space-y-2">
          {boosts.length > BOOSTS_PREVIEW && (
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a student or column"
              aria-label="Find a points assist"
            />
          )}

          {matching.length === 0 ? (
            <EmptyState compact>No points assist matches that.</EmptyState>
          ) : (
            <Rows>
              {visible.map((r) => {
                const receipt = r.gradeItemId
                  ? receipts.get(cellKey(r.gradeItemId, r.studentId))
                  : undefined
                return (
                  <div key={r.id} className="flex items-center gap-3 p-3.5">
                    <Avatar name={r.studentName} url={r.avatarUrl} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.studentName}</p>
                      <p className="truncate text-xs tabular-nums text-muted">
                        {r.grade?.itemName ?? 'A column'}
                        {receipt
                          ? ` · ${formatMarks(receipt.scoreBefore)} → ${formatMarks(receipt.scoreAfter)} (+${formatMarks(receipt.marksGranted)})`
                          : ''}
                        {` · ${r.points} pts`}
                        {r.decidedAt ? ` · ${timeAgo(r.decidedAt)}` : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => onReverse(r)}>
                      Reverse
                    </Button>
                  </div>
                )
              })}
            </Rows>
          )}

          {!needle && matching.length > BOOSTS_PREVIEW && (
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Show fewer' : `Show all ${matching.length}`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * What approving a grade boost will do, stated as the mark it changes.
 *
 * The student's mark is read FRESH when the inbox loads (see
 * `attachGradeContext`), not remembered from the request: it can be entered,
 * retyped or cleared between asking and deciding, and an approve screen is only
 * honest if it shows what approval will do today. The server re-checks all of
 * this itself — these two warnings exist so the instructor hears about a doomed
 * approval before pressing the button rather than after.
 */
function BoostDetail({ r }: { r: RedemptionRequest }) {
  const g = r.grade
  if (!g) return null

  const gain = g.currentScore === null ? 0 : boostGain(g.currentScore, g.maxScore, g.bonus)

  return (
    <div className="mt-3 space-y-1.5 rounded-lg bg-card-2 px-3 py-2 text-sm">
      <p>
        <span className="font-semibold">Points assist</span>
        <span className="text-muted">
          {' '}
          · {g.itemName} · {COMPONENT_LABEL[g.component]}
        </span>
      </p>
      {g.currentScore === null ? (
        <p className="text-xs font-semibold text-warn">
          Their mark has been cleared — approving will fail until it is back.
        </p>
      ) : gain <= 0 ? (
        <p className="text-xs font-semibold text-warn">
          They already have full marks ({formatMarks(g.currentScore)} / {formatMarks(g.maxScore)}) —
          approving will fail. Decline it.
        </p>
      ) : (
        <p className="text-xs tabular-nums text-muted">
          Mark{' '}
          <span className="font-semibold text-ink">
            {formatMarks(g.currentScore)} → {formatMarks(g.currentScore + gain)}
          </span>{' '}
          out of {formatMarks(g.maxScore)} (+{formatMarks(gain)}
          {gain < g.bonus ? `, capped from +${formatMarks(g.bonus)}` : ''})
        </p>
      )}
    </div>
  )
}
