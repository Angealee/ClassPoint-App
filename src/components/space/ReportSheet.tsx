import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { reportContent } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from '@/lib/types'

/**
 * The report flow — a reason, an optional note, one call.
 *
 * The reason list is fixed so that "three people said harassment" is a fact the
 * queue can show, and the note is optional because the thing that usually
 * decides what to do — "it's the third time this week" — has no category.
 *
 * Nothing here knows about the auto-hide threshold. The RPC counts distinct
 * reporters and hides at 7; telling the reporter how close they are would turn
 * a safety tool into a scoreboard.
 */
export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  onReported,
}: {
  open: boolean
  onClose: () => void
  targetType: ReportTargetType
  targetId: string | null
  onReported?: () => void
}) {
  const { toast } = useToast()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // A fresh open always starts blank — the last report's reason pre-selected
  // on a different piece of content is how the wrong thing gets flagged.
  useEffect(() => {
    if (open) {
      setReason(null)
      setNote('')
    }
  }, [open])

  async function submit() {
    if (!reason || !targetId || busy) return
    setBusy(true)
    try {
      await reportContent(targetType, targetId, reason, note)
      toast('Reported. Your instructor will take a look.', 'success')
      onReported?.()
      onClose()
    } catch (e) {
      toast(errorText(e, 'Could not send that report.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Report this">
      <div className="space-y-4 pb-2">
        <div className="space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              aria-pressed={reason === r.value}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors',
                reason === r.value
                  ? 'border-accent-solid/40 bg-accent-solid/10 text-accent'
                  : 'border-line text-ink hover:bg-card-2',
              )}
            >
              {r.label}
              {reason === r.value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>

        <Textarea
          label="Anything else? (optional)"
          rows={3}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened, or why this matters."
          hint="Only your instructor sees this."
        />

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={busy}
            disabled={!reason || busy}
            onClick={() => void submit()}
          >
            Report
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
