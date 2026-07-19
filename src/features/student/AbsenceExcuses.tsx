import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { WarningIcon, XIcon } from '@/components/ui/icons'
import {
  cancelAbsenceExcuse,
  listMyExcuses,
  requestAbsenceExcuse,
  setExcuseSlipStatus,
} from '@/lib/api'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import {
  EXCUSE_DEADLINE_DAYS,
  type AbsenceExcuse,
  type MyAttendanceEntry,
} from '@/lib/types'

const DAY_MS = 86_400_000
const DISMISS_KEY = 'cp_excuse_guide_dismissed_v1'

const sessionDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Is this absence still inside the 7-day request window? */
function withinWindow(startedAt: string): boolean {
  return Date.now() - new Date(startedAt).getTime() <= EXCUSE_DEADLINE_DAYS * DAY_MS
}

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function errorText(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m && m.length <= 160 ? m : fallback
}

/**
 * The student's absence-excuse surface: the DCT-CCS how-to card plus each
 * actionable absence with its request/track controls. Self-contained so the
 * Attendance page just drops it in above the history.
 */
export function AbsenceExcuses({
  studentId,
  history,
  onChanged,
}: {
  studentId: string
  history: MyAttendanceEntry[]
  /** Called after an approval so the parent can reload attendance (status flips). */
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [excuses, setExcuses] = useState<AbsenceExcuse[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed())
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

  // A decision (approve/reject) lands live while the page is open.
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

  // Actionable = an absence that's either still requestable, or has an excuse
  // in flight/decided the student should see. Approved ones flip to 'excused'
  // and drop out of the absent history entirely.
  const actionable = useMemo(
    () =>
      history.filter(
        (h) =>
          h.status === 'absent' &&
          (withinWindow(h.startedAt) || excuseByRecord.has(h.recordId)),
      ),
    [history, excuseByRecord],
  )

  // Show the how-to while any actionable absence hasn't been dismissed.
  const showGuide = actionable.some((h) => !dismissed.has(h.recordId))

  function dismissGuide() {
    const next = new Set(dismissed)
    for (const h of actionable) next.add(h.recordId)
    setDismissed(next)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]))
    } catch {
      /* ignore */
    }
  }

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
      {/* The DCT-CCS how-to (clear & procedural). */}
      {showGuide && (
        <Card className="relative border-brand-500/25 bg-brand-500/[0.04] p-4">
          <button
            type="button"
            onClick={dismissGuide}
            aria-label="Dismiss"
            className="absolute right-3 top-3 text-muted transition-colors hover:text-ink"
          >
            <XIcon className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/12 text-brand-500">
              <WarningIcon className="h-4.5 w-4.5" />
            </span>
            <p className="font-display font-bold">Missed a class?</p>
          </div>
          <ol className="mt-3 space-y-1.5 text-sm text-muted">
            <li>① Get a valid excuse letter.</li>
            <li>② The Dean’s office validates it.</li>
            <li>③ They issue your admission slip.</li>
            <li>④ Present the slip to your instructor.</li>
          </ol>
          <p className="mt-2 text-xs text-muted">
            File your request here so your instructor is ready — you have {EXCUSE_DEADLINE_DAYS} days
            from the class.
          </p>
        </Card>
      )}

      {/* Actionable absences */}
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Absences to resolve</h2>
        <Card className="divide-y divide-line">
          {actionable.map((h) => {
            const excuse = excuseByRecord.get(h.recordId)
            return (
              <div key={h.recordId} className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {h.topic || sessionDate(h.startedAt)}
                    </p>
                    <p className="text-xs text-muted">{sessionDate(h.startedAt)}</p>
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
                    <span className="shrink-0 rounded-full bg-gold-400/15 px-2.5 py-1 text-xs font-semibold text-gold-700 dark:text-gold-300">
                      Waiting
                    </span>
                  )}
                  {excuse?.status === 'rejected' && (
                    <span className="shrink-0 rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
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
                      className="text-xs font-semibold text-muted transition-colors hover:text-brand-500"
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
        </Card>
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
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="e.g. Was sick, medical certificate available"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <p className="mt-1 text-right text-[0.65rem] text-muted">{reason.length}/280</p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Do you already have your admission slip?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setHasSlip(false)}
                className={cn(
                  'h-10 rounded-xl text-sm font-semibold transition-colors',
                  !hasSlip ? 'bg-brand-500 text-white' : 'bg-card-2 text-muted',
                )}
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={() => setHasSlip(true)}
                className={cn(
                  'h-10 rounded-xl text-sm font-semibold transition-colors',
                  hasSlip ? 'bg-brand-500 text-white' : 'bg-card-2 text-muted',
                )}
              >
                Yes, I have it
              </button>
            </div>
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
