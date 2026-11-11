import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { DownloadIcon } from '@/components/ui/icons'
import { CARD_H, CARD_W, ShareCard, type ShareVariant } from './ShareCard'
import { biggestClimber } from './RankSignals'
import type { LeaderboardEntry } from '@/lib/types'

const PREVIEW_W = 190
const SCALE = PREVIEW_W / CARD_W

interface ShareSheetProps {
  open: boolean
  onClose: () => void
  entries: LeaderboardEntry[]
  meId?: string | null
  myPos?: number | null
  myPoints?: number | null
  scopeLabel: string
  capturedAt?: string | null
}

export function ShareSheet({
  open,
  onClose,
  entries,
  meId,
  myPos,
  myPoints,
  scopeLabel,
  capturedAt,
}: ShareSheetProps) {
  const { toast } = useToast()
  const cardRef = useRef<HTMLDivElement>(null)
  const [variant, setVariant] = useState<ShareVariant>('podium')
  const [busy, setBusy] = useState(false)

  const climber = useMemo(() => biggestClimber(entries), [entries])

  useEffect(() => {
    if (open) void import('modern-screenshot')
  }, [open])

  async function render(): Promise<Blob | null> {
    const node = cardRef.current
    if (!node) return null
    const { domToBlob } = await import('modern-screenshot')

    // Everything must be paint-ready before the clone is taken.
    try {
      await document.fonts.ready
    } catch {
      /* not fatal — worst case the export uses a fallback face */
    }
    await Promise.all(
      [...node.querySelectorAll('img')].map((img) =>
        img.decode().catch(() => undefined),
      ),
    )

    return domToBlob(node, {
      width: CARD_W,
      height: CARD_H,
      scale: 1,
      backgroundColor: '#0d0d10',
      type: 'image/jpeg',
      quality: 0.92,
    })
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onShare() {
    setBusy(true)
    try {
      const blob = await render()
      if (!blob) throw new Error('no blob')
      const filename = `classpoint-leaderboard-${new Date().toISOString().slice(0, 10)}.jpg`
      const file = new File([blob], filename, { type: 'image/jpeg' })

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] })
          setBusy(false)
          return
        } catch (err) {
          // The user tapping "cancel" in the OS sheet is not an error.
          if ((err as Error)?.name === 'AbortError') {
            setBusy(false)
            return
          }
        }
      }
      download(blob, filename)
      toast('Saved to your downloads.', 'success')
    } catch {
      toast('Could not create the image. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const hasEntries = entries.length > 0

  return (
    <Sheet open={open} onClose={onClose} title="Share the board">
      <div className="space-y-4">
        {/* Style picker */}
        <SegmentedControl
          label="Share style"
          value={variant}
          onChange={setVariant}
          options={[
            { value: 'podium', label: 'Podium' },
            { value: 'list', label: 'Top 10' },
          ]}
        />

        {hasEntries ? (
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
                <ShareCard
                  ref={cardRef}
                  variant={variant}
                  entries={entries}
                  meId={meId}
                  myPos={myPos}
                  myPoints={myPoints}
                  scopeLabel={scopeLabel}
                  capturedAt={capturedAt}
                  climber={climber}
                />
              </div>
            </div>
          </div>
        ) : (
          <EmptyState compact>Nothing to share yet — the board settles twice a day.</EmptyState>
        )}

        <Button size="lg" className="w-full" onClick={onShare} disabled={busy || !hasEntries}>
          {busy ? (
            'Making the image…'
          ) : (
            <>
              <DownloadIcon className="h-5 w-5" /> Save / share image
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted">
          Exports at 1080×1350 — sized for a story or a post.
        </p>
      </div>
    </Sheet>
  )
}
