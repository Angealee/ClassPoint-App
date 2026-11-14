import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Textarea } from '@/components/ui/Textarea'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Rows } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  cancelAbsenceExcuse,
  listMyExcuses,
  requestAbsenceExcuse,
  setExcuseSlipStatus,
} from '@/lib/api'
import { excuseClosesLabel } from '@/lib/attendance'
import { supabase, uniqueChannel } from '@/lib/supabase'
import {
  EXCUSE_DEADLINE_DAYS,
  type AbsenceExcuse,
  type MyAttendanceEntry,
} from '@/lib/types'

const DAY_MS = 86_400_000

const sessionDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Is this absence still inside the 7-day request window? */
function withinWindow(startedAt: string): boolean {
  return Date.now() - new Date(startedAt).getTime() <= EXCUSE_DEADLINE_DAYS * DAY_MS
}

function errorText(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m && m.length <= 160 ? m : fallback
}

export function AbsenceExcuses({
  studentId,
  history,
  onChanged,
}: {
  studentId: string
  history: MyAttendanceEntry[]
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [excuses, setExcuses] = useState<AbsenceExcuse[]>([])
  const [guideOpen, setGuideOpen] = useState(false)
  // One clock reading per visit: the label is a date, so it need not tick.
  const [nowMs] = useState(() => Date.now())
  const [requestFor, setRequestFor] = useState<MyAttendanceEntry | null>(null)
  const [reason, setReason] = useState('')
  const [hasSlip, setHasSlip] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<AbsenceExcuse | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [slipBusyId, setSlipBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    listMyExcuses(studentId)
      .then(setExcuses)
      .catch(() => {})
  }, [studentId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = uniqueChannel(`my-excuses-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'absence_excuses',
          filter: `student_id=eq.${studentId}`,
        },
        () => {
          load()
          onChanged()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [studentId, load, onChanged])

  // Latest non-cancelled excuse per record.
  const excuseByRecord = useMemo(() => {
    const map = new Map<string, AbsenceExcuse>()
    for (const e of excuses) {
      if (e.status === 'cancelled') continue
      if (!map.has(e.recordId)) map.set(e.recordId, e) // listMyExcuses is newest-first
    }
    return map
  }, [excuses])

  const actionable = useMemo(
    () =>
      history.filter(
        (h) =>
          h.status === 'absent' &&
          (withinWindow(h.startedAt) || excuseByRecord.has(h.recordId)),
      ),
    [history, excuseByRecord],
  )

  async function submitRequest() {
    if (!requestFor) return
    setSubmitting(true)
    try {
      await requestAbsenceExcuse(requestFor.recordId, reason, hasSlip)
      toast('Excuse request filed.', 'success')
      setRequestFor(null)
      setReason('')
      setHasSlip(false)
      load()
    } catch (e) {
      toast(errorText(e, 'Could not file that request.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleSlip(e: AbsenceExcuse) {
    setSlipBusyId(e.id)
    try {
      await setExcuseSlipStatus(e.id, !e.hasSlip)
      load()
    } catch {
      toast('Could not update. Try again.', 'error')
    } finally {
      setSlipBusyId(null)
    }
  }

  async function onCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelAbsenceExcuse(cancelTarget.id)
      toast('Request withdrawn.', 'info')
      setCancelTarget(null)
      load()
    } catch {
      toast('Could not cancel.', 'error')
    } finally {
      setCancelling(false)
    }
  }

  if (actionable.length === 0) return null

  return (
    <div className="space-y-3">
      <Sheet open={guideOpen} onClose={() => setGuideOpen(false)} title="How excuses work">
        <ol className="space-y-3">
          {[
            'Get a valid excuse letter.',
            'The Dean’s office validates it.',
            'They issue your admission slip.',
            'Present the slip to your instructor.',
          ].map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info-solid/12 text-sm font-bold text-info">
                {i + 1}
              </span>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 rounded-xl bg-card-2 px-4 py-3 text-sm text-muted">
          File your request here so your instructor is ready, you have{' '}
          {EXCUSE_DEADLINE_DAYS} days from the class.
        </p>
        <Button size="lg" className="mt-5 w-full" onClick={() => setGuideOpen(false)}>
          Got it
        </Button>
      </Sheet>

      {/* Actionable absences */}
      <div>
        <SectionLabel
          action={
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="cp-tap-y inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent"
            >
              How excuses work <span aria-hidden>›</span>
            </button>
          }
        >
          Needs action
        </SectionLabel>
        <Rows className="border-warn-solid/30">
          {actionable.map((h) => {
            const excuse = excuseByRecord.get(h.recordId)
            return (
              <div key={h.recordId} className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {h.topic || sessionDate(h.startedAt)}
                    </p>
                    <p className="text-sm text-muted">
                      {h.topic ? `${sessionDate(h.startedAt)} · ` : ''}
                      {excuse ? 'Request filed' : excuseClosesLabel(h.startedAt, nowMs, EXCUSE_DEADLINE_DAYS)}
                    </p>
                  </div>
                  {!excuse && withinWindow(h.startedAt) && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setReason('')
                        setHasSlip(false)
                        setRequestFor(h)
                      }}
                    >
                      Request excuse
                    </Button>
                  )}
                  {excuse?.status === 'pending' && (
                    <span className="shrink-0 rounded-full bg-gold-400/15 px-2.5 py-1 text-xs font-semibold text-warn">
                      Waiting
                    </span>
                  )}
                  {excuse?.status === 'rejected' && (
                    <span className="shrink-0 rounded-full bg-danger-solid/10 px-2.5 py-1 text-xs font-semibold text-danger">
                      Rejected
                    </span>
                  )}
                </div>

                {excuse?.status === 'pending' && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={excuse.hasSlip ? 'outline' : 'primary'}
                      disabled={slipBusyId === excuse.id}
                      onClick={() => void toggleSlip(excuse)}
                    >
                      {excuse.hasSlip ? 'Slip received ✓' : 'I got my admission slip'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setCancelTarget(excuse)}
                      className="text-xs font-semibold text-muted transition-colors hover:text-accent"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {excuse?.status === 'rejected' && excuse.decisionNote && (
                  <p className="mt-2 rounded-lg bg-card-2 px-2.5 py-1.5 text-xs text-muted">
                    “{excuse.decisionNote}”
                  </p>
                )}
              </div>
            )
          })}
        </Rows>
      </div>

      {/* Request sheet */}
      <Sheet open={!!requestFor} onClose={() => setRequestFor(null)} title="Request an excuse">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            For{' '}
            <span className="font-semibold text-ink">
              {requestFor?.topic || (requestFor ? sessionDate(requestFor.startedAt) : '')}
            </span>
            . Your instructor excuses it once you present your admission slip.
          </p>
          <div>
            <p className="mb-1.5 text-sm font-medium">Reason</p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="e.g. Was sick, medical certificate available"
              className="bg-canvas"
            />
            <p className="mt-1 text-right text-xs text-muted">{reason.length}/280</p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Do you already have your admission slip?</p>
            <SegmentedControl
              label="Do you already have your admission slip?"
              value={hasSlip ? 'yes' : ('no' as 'yes' | 'no')}
              onChange={(v) => setHasSlip(v === 'yes')}
              options={[
                { value: 'no', label: 'Not yet' },
                { value: 'yes', label: 'Yes, I have it' },
              ]}
            />
          </div>
          <Button
            size="lg"
            className="w-full"
            disabled={submitting || reason.trim().length < 3}
            onClick={() => void submitRequest()}
          >
            {submitting ? 'Filing…' : 'File request'}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!cancelTarget}
        title="Withdraw this request?"
        message="You can file it again later, as long as you're still within the 7-day window."
        confirmLabel="Withdraw"
        busy={cancelling}
        onConfirm={onCancel}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  )
}
