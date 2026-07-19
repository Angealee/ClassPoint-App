import { Card } from '@/components/ui/Card'
import { dismiss, type OfflineScanEntry } from '@/lib/offline-scans'
import type { OfflineScanOutcome } from '@/lib/types'

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Student-facing copy for each terminal failure. */
const FAIL_REASON: Partial<Record<OfflineScanOutcome, string>> = {
  expired: 'More than 48 hours passed before you got back online.',
  session_missing: 'That class was removed by your instructor.',
  wrong_section: 'That class was for a different section.',
  invalid: "The code didn't check out.",
}

/**
 * The sync-status stack above attendance history: queued proofs waiting to
 * send, and the outcomes of ones that have. Resolved cards persist until the
 * student dismisses them — so the outcome is always seen on next open.
 */
export function OfflineScanCards({
  entries,
  onChanged,
}: {
  entries: OfflineScanEntry[]
  onChanged: () => void
}) {
  if (entries.length === 0) return null

  return (
    <div className="space-y-2">
      {entries.map((e) => {
        if (e.state === 'queued') {
          return (
            <Card
              key={e.id}
              className="flex items-center gap-3 border-gold-400/40 bg-gold-400/8 p-3.5"
            >
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gold-400/40 border-t-gold-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gold-700 dark:text-gold-300">
                  Check-in waiting to sync
                </p>
                <p className="text-xs text-muted">
                  Scanned {day(e.capturedAt)}, {time(e.capturedAt)} · syncs automatically when
                  you're online
                </p>
              </div>
            </Card>
          )
        }

        if (e.state === 'recorded') {
          const already = e.outcome === 'already'
          const status = e.resultStatus ? e.resultStatus[0].toUpperCase() + e.resultStatus.slice(1) : ''
          return (
            <Card
              key={e.id}
              className="flex items-center gap-3 border-emerald-500/30 bg-emerald-500/8 p-3.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {already ? `Already recorded — ${status}` : `Checked in — ${status}`}
                </p>
                <p className="truncate text-xs text-muted">
                  {e.topic || 'Class'} · scanned {time(e.capturedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  dismiss(e.id)
                  onChanged()
                }}
                className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                Dismiss
              </button>
            </Card>
          )
        }

        // failed
        return (
          <Card key={e.id} className="border-brand-500/30 bg-brand-500/8 p-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                !
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                  Couldn't record this check-in
                </p>
                <p className="text-xs text-muted">
                  {(e.outcome && FAIL_REASON[e.outcome]) ?? 'Something went wrong.'}
                </p>
                <p className="mt-1.5 rounded-lg bg-card-2 px-2.5 py-1.5 text-[0.7rem] text-muted">
                  Scanned {day(e.capturedAt)}, {time(e.capturedAt)} · show this to your instructor
                  so they can mark you manually.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  dismiss(e.id)
                  onChanged()
                }}
                className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
