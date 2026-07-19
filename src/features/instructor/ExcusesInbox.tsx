import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SuccessTick } from '@/components/ui/SuccessTick'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon } from '@/components/ui/icons'
import { decideAbsenceExcuse, listExcuses } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { useInstructor } from './InstructorLayout'
import type { ExcuseRequest, ExcuseStatus } from '@/lib/types'

const STATUS_META: Record<ExcuseStatus, { label: string; cls: string }> = {
  pending: { label: 'Waiting', cls: 'bg-gold-400/15 text-gold-700 dark:text-gold-300' },
  approved: { label: 'Excused', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'Rejected', cls: 'bg-brand-500/10 text-brand-600 dark:text-brand-400' },
  cancelled: { label: 'Cancelled', cls: 'bg-card-2 text-muted' },
}

const sessionLabel = (r: ExcuseRequest) =>
  r.sessionTopic ||
  (r.sessionStartedAt
    ? new Date(r.sessionStartedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'a class')

function errorText(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m && m.length <= 160 ? m : fallback
}

/** Absence excuses — slip-holders sorted first (the excuse-on-sight queue). */
export function ExcusesInbox() {
  const { sections } = useInstructor()
  const { toast } = useToast()
  const [all, setAll] = useState<ExcuseRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [decision, setDecision] = useState<{ req: ExcuseRequest; approve: boolean } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(false)

  const sectionName = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setAll(await listExcuses({ limit: 100 }))
    } catch {
      toast('Could not load excuses.', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  // Live: a new request, or a student flipping "I have my slip", re-sorts the
  // queue in front of you. Page-scoped channel via uniqueChannel.
  useEffect(() => {
    const channel = uniqueChannel('excuses-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absence_excuses' }, () =>
        load(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  const pending = useMemo(
    () =>
      all
        .filter((r) => r.status === 'pending')
        // Slip-holders first (ready to excuse on sight), then oldest-first.
        .sort((a, b) => {
          if (a.hasSlip !== b.hasSlip) return a.hasSlip ? -1 : 1
          return a.requestedAt.localeCompare(b.requestedAt)
        }),
    [all],
  )
  const decided = useMemo(() => all.filter((r) => r.status !== 'pending').slice(0, 30), [all])

  async function onDecide() {
    if (!decision) return
    setBusy(true)
    try {
      await decideAbsenceExcuse(decision.req.id, decision.approve, note)
      toast(decision.approve ? 'Excused.' : 'Excuse rejected.', decision.approve ? 'success' : 'info')
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

  if (loading) return <ListSkeleton rows={4} />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted">
          Waiting{pending.length > 0 ? ` (${pending.length})` : ''}
        </h2>
        {pending.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-8 text-center">
            <CheckIcon className="h-7 w-7 text-muted" />
            <p className="text-sm text-muted">No excuse requests. All caught up.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={r.studentName} url={r.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.studentName}</p>
                    <p className="text-xs text-muted">
                      {sectionName(r.sectionId)} · {sessionLabel(r)} · {timeAgo(r.requestedAt)}
                    </p>
                  </div>
                  {r.hasSlip ? (
                    <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Has slip
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-card-2 px-2.5 py-1 text-xs font-medium text-muted">
                      No slip yet
                    </span>
                  )}
                </div>

                <p className="mt-3 rounded-lg bg-card-2 px-3 py-2 text-sm">{r.reason}</p>

                {!r.hasSlip && (
                  <p className="mt-2 text-xs text-muted">
                    The student hasn’t marked their admission slip as received. Excuse once they
                    present it.
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
                    Reject
                  </Button>
                  <Button
                    onClick={() => {
                      setNote('')
                      setDecision({ req: r, approve: true })
                    }}
                  >
                    Excuse
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div>
          <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Recent decisions</h2>
          <Card className="divide-y divide-line">
            {decided.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3.5">
                <Avatar name={r.studentName} url={r.avatarUrl} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.studentName}</p>
                  <p className="truncate text-xs text-muted">
                    {sessionLabel(r)}
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
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={!!decision}
        variant={decision?.approve ? 'danger' : 'default'}
        title={decision?.approve ? 'Excuse this absence?' : 'Reject this excuse?'}
        message={
          decision?.approve ? (
            <>
              <span className="font-semibold text-ink">{decision.req.studentName}</span>’s absence
              for {sessionLabel(decision.req)} becomes Excused.
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">{decision?.req.studentName}</span>’s absence
              stays as-is. They’ll be notified.
            </>
          )
        }
        detail={
          decision?.approve
            ? 'Any penalty for this absence is reversed and their points are restored.'
            : undefined
        }
        confirmLabel={decision?.approve ? 'Excuse' : 'Reject'}
        busy={busy}
        onConfirm={onDecide}
        onClose={() => setDecision(null)}
      >
        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          placeholder={
            decision?.approve ? 'e.g. medical certificate on file' : 'e.g. no valid admission slip'
          }
          hint="They'll see this in their history and notification."
        />
      </ConfirmDialog>

      <SuccessTick show={tick} onDone={() => setTick(false)} />
    </div>
  )
}
