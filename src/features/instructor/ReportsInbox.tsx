import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  getReportQueue,
  readDmThread,
  resolveReport,
  timeoutStudent,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import {
  AUTO_HIDE_AT,
  REPORT_REASONS,
  type ReportAction,
  type ReportQueueItem,
} from '@/lib/types'

/**
 * The report queue — one item per reported TARGET, not per report.
 *
 * ⚠ A reported DM shows its reason and reporters but NOT its text. Reading it
 * means "Review thread", which calls `read_dm_thread()` and writes an audit
 * row. If this screen printed the body, every DM report would be a silent
 * break-glass and the promise on the student's DM screen would be false exactly
 * when it is most likely to be tested.
 */

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]))

/** 1 hour · 1 day · 7 days, plus a custom box. */
const TIMEOUTS = [
  { label: '1 hour', hours: 1 },
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
] as const

export function ReportsInbox() {
  const { toast } = useToast()
  const [items, setItems] = useState<ReportQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [confirm, setConfirm] = useState<{ item: ReportQueueItem; action: ReportAction } | null>(
    null,
  )
  const [timeoutFor, setTimeoutFor] = useState<ReportQueueItem | null>(null)
  const [customHours, setCustomHours] = useState('')
  const [thread, setThread] = useState<
    { open: boolean; title: string; rows: { id: string; displayName: string; body: string | null; createdAt: string }[] } | null
  >(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setItems(await getReportQueue())
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const keyOf = (i: ReportQueueItem) => `${i.targetType}:${i.targetId}`

  async function resolve(item: ReportQueueItem, action: ReportAction) {
    setBusyKey(keyOf(item))
    try {
      await resolveReport(item.targetType, item.targetId, action)
      setItems((list) => list.filter((x) => keyOf(x) !== keyOf(item)))
      toast(
        action === 'delete'
          ? 'Removed. Everyone who reported it has been told it was reviewed.'
          : action === 'restore'
            ? 'Restored, and the report count reset.'
            : 'Dismissed.',
        'success',
      )
    } catch (e) {
      toast(errorText(e, 'Could not do that.'), 'error')
    } finally {
      setBusyKey(null)
      setConfirm(null)
    }
  }

  async function applyTimeout(hours: number) {
    const item = timeoutFor
    if (!item?.authorId) return
    setBusyKey(keyOf(item))
    try {
      const until = new Date(Date.now() + hours * 3600_000)
      await timeoutStudent(item.authorId, until, `Reported ${item.context.toLowerCase()}`)
      toast(`${item.authorName ?? 'They'} are muted for ${hours}h.`, 'success')
      setTimeoutFor(null)
      setCustomHours('')
    } catch (e) {
      toast(errorText(e, 'Could not time them out.'), 'error')
    } finally {
      setBusyKey(null)
    }
  }

  async function openThread(item: ReportQueueItem) {
    if (!item.roomId) return
    setBusyKey(keyOf(item))
    try {
      const rows = await readDmThread(item.roomId, `Report review (${item.reasons.join(', ')})`)
      setThread({ open: true, title: 'Reported thread', rows })
    } catch (e) {
      toast(errorText(e, 'Could not open that thread.'), 'error')
    } finally {
      setBusyKey(null)
    }
  }

  if (loading) return <ListSkeleton rows={3} />
  if (failed) return <ErrorState onRetry={() => void load()}>Could not load reports.</ErrorState>
  if (items.length === 0) {
    return <EmptyState description="Nothing has been reported.">Queue is clear.</EmptyState>
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const busy = busyKey === keyOf(item)
        return (
          <Card key={keyOf(item)} pad="roomy" className={cn(item.isHidden && 'border-danger-solid/30')}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={item.reportCount >= AUTO_HIDE_AT ? 'danger' : 'warn'} size="sm">
                {item.reportCount} report{item.reportCount === 1 ? '' : 's'}
              </Chip>
              <Chip tone="neutral" size="sm">
                {item.context}
              </Chip>
              {item.isHidden && (
                <Chip tone="danger" size="sm">
                  Auto-hidden
                </Chip>
              )}
              {item.isDeleted && (
                <Chip tone="neutral" size="sm">
                  Already deleted
                </Chip>
              )}
              <span className="ml-auto shrink-0 text-2xs text-muted">{timeAgo(item.firstAt)}</span>
            </div>

            <p className="mt-2 text-sm">
              <span className="font-semibold">{item.authorName ?? 'Unknown'}</span>
              <span className="text-muted"> · reported for </span>
              <span className="font-medium">
                {item.reasons.map((r) => REASON_LABEL[r] ?? r).join(', ')}
              </span>
            </p>

            {item.isDm ? (
              <p className="mt-2 rounded-xl border border-line bg-card-2 px-3 py-2 text-sm text-muted">
                This is a direct message. Its text is not shown here — opening the thread is
                recorded in the audit log.
              </p>
            ) : (
              <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-card-2 px-3 py-2 text-sm text-ink">
                {item.body ?? '(no longer available)'}
              </p>
            )}

            {item.notes.length > 0 && (
              <div className="mt-2 space-y-1">
                {item.notes.map((n, i) => (
                  <p key={i} className="text-xs text-muted">
                    “{n}”
                  </p>
                ))}
              </div>
            )}

            <p className="mt-2 text-2xs text-muted">
              Reported by {item.reporters.join(', ')}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {item.isDm && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void openThread(item)}>
                  Review thread
                </Button>
              )}
              {!item.isDeleted && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => setConfirm({ item, action: 'delete' })}
                >
                  Delete
                </Button>
              )}
              {item.isHidden && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve(item, 'restore')}>
                  Unhide
                </Button>
              )}
              {item.authorId && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setTimeoutFor(item)}>
                  Timeout
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void resolve(item, 'dismiss')}>
                Dismiss
              </Button>
            </div>
          </Card>
        )
      })}

      <ConfirmDialog
        open={!!confirm}
        title="Delete this?"
        message="It disappears for everyone, and every reporter is told it was reviewed."
        confirmLabel="Delete"
        busy={!!busyKey}
        onConfirm={() => confirm && void resolve(confirm.item, confirm.action)}
        onClose={() => setConfirm(null)}
      />

      <Sheet open={!!timeoutFor} onClose={() => setTimeoutFor(null)} title="Mute this student">
        <div className="space-y-3 pb-2">
          <p className="text-sm text-muted">
            {timeoutFor?.authorName} can still read everything, and can still message you.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TIMEOUTS.map((t) => (
              <Button
                key={t.label}
                variant="outline"
                disabled={!!busyKey}
                onClick={() => void applyTimeout(t.hours)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <input
              type="number"
              min={1}
              max={2160}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              placeholder="Hours"
              // text-base: below 16px iOS Safari zooms on focus and never zooms back.
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3.5 text-base text-ink outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <Button
              className="shrink-0"
              disabled={!!busyKey || !Number(customHours)}
              onClick={() => void applyTimeout(Number(customHours))}
            >
              Mute
            </Button>
          </div>
          <p className="text-xs text-muted">Capped at 90 days by the server.</p>
        </div>
      </Sheet>

      <Sheet open={!!thread?.open} onClose={() => setThread(null)} title={thread?.title ?? 'Thread'}>
        <div className="space-y-2 pb-2">
          <p className="rounded-xl border border-warn-solid/30 bg-warn-solid/8 px-3 py-2 text-xs font-medium text-warn">
            This read has been recorded in the audit log.
          </p>
          {(thread?.rows ?? []).map((r) => (
            <div key={r.id} className="rounded-xl bg-card-2 px-3 py-2">
              <p className="text-2xs font-semibold text-muted">
                {r.displayName} · {timeAgo(r.createdAt)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {r.body ?? <span className="italic text-muted">Message removed</span>}
              </p>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
