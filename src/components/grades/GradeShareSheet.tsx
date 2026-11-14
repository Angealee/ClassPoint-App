import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/Toast'
import { DownloadIcon } from '@/components/ui/icons'
import { renderJpeg, shareOrDownload } from '@/lib/share-image'
import { CARD_H, CARD_W, GradeShareCard, type GradeShareProps } from './GradeShareCard'

const PREVIEW_W = 190
const SCALE = PREVIEW_W / CARD_W

type CardData = Omit<GradeShareProps, 'subjectLabel' | 'studentName' | 'dateLabel'>

/**
 * Saves the grade card as a JPG. The card shows marks, so it is deliberately slower than the
 * leaderboard's: name and subject start OFF, and Save asks once, inline, before it renders.
 * The confirm is in-sheet rather than a ConfirmDialog because a sheet opened from a sheet
 * stacks two focus traps (the same reason the mobile menu closes before sign-out opens).
 */
export function GradeShareSheet({
  open,
  onClose,
  card,
  subjectLabel,
  studentName,
}: {
  open: boolean
  onClose: () => void
  card: CardData
  /** Always passed; shown on the card only when the student switches it on. */
  subjectLabel: string
  studentName: string
}) {
  const { toast } = useToast()
  const cardRef = useRef<HTMLDivElement>(null)
  const [showName, setShowName] = useState(false)
  const [showSubject, setShowSubject] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) void import('modern-screenshot')
  }, [open])

  // Every time it opens it starts private again, whatever was chosen last time.
  useEffect(() => {
    if (open) {
      setShowName(false)
      setShowSubject(false)
      setConfirming(false)
    }
  }, [open])

  async function save() {
    setBusy(true)
    try {
      const node = cardRef.current
      const blob = node
        ? await renderJpeg(node, { width: CARD_W, height: CARD_H, background: '#0d0d10' })
        : null
      if (!blob) throw new Error('no blob')
      const filename = `classpoint-grades-${card.termTitle.toLowerCase()}-${new Date()
        .toISOString()
        .slice(0, 10)}.jpg`
      const how = await shareOrDownload(blob, filename)
      if (how === 'saved') toast('Saved to your downloads.', 'success')
      setConfirming(false)
    } catch {
      toast('Could not create the image. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const dateLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="Save a grade card">
      <div className="space-y-4">
        <div className="flex justify-center">
          <div
            className="overflow-hidden rounded-2xl ring-1 ring-line"
            style={{ width: PREVIEW_W, height: Math.round(CARD_H * SCALE) }}
          >
            <div
              style={{
                width: CARD_W,
                height: CARD_H,
                transform: `scale(${SCALE})`,
                transformOrigin: 'top left',
              }}
            >
              <GradeShareCard
                ref={cardRef}
                {...card}
                subjectLabel={showSubject ? subjectLabel : null}
                studentName={showName ? studentName : null}
                dateLabel={dateLabel}
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-line rounded-xl border border-line">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Show my name</p>
              <p className="text-xs text-muted">Off: the card is anonymous.</p>
            </div>
            <Toggle on={showName} onChange={setShowName} label="Show my name on the card" />
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Show the subject</p>
              <p className="truncate text-xs text-muted">{subjectLabel}</p>
            </div>
            <Toggle on={showSubject} onChange={setShowSubject} label="Show the subject on the card" />
          </div>
        </div>

        {confirming ? (
          <div className="space-y-3 rounded-xl border border-line bg-card-2 p-3.5 text-center">
            <p className="text-sm font-semibold">Share your marks?</p>
            <p className="text-xs text-muted">
              This card shows your marks so far. Only share what you&rsquo;re comfortable with.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={() => void save()} loading={busy}>
                Save the card
              </Button>
            </div>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={() => setConfirming(true)}>
            <DownloadIcon className="h-5 w-5" /> Save / share image
          </Button>
        )}

        <p className="text-center text-xs text-muted">
          Exports at 1080&times;1920 for a story. Stamped &ldquo;so far, not final&rdquo;.
        </p>
      </div>
    </Sheet>
  )
}
