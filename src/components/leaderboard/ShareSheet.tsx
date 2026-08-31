import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { DownloadIcon } from '@/components/ui/icons'
import { CARD_H, CARD_W, ShareCard, type ShareVariant } from './ShareCard'
import { biggestClimber } from './RankSignals'
import type { LeaderboardEntry } from '@/lib/types'

/**
 * Preview width inside the sheet; the card itself stays 1080×1920.
 *
 * Narrower than it was, because a 9:16 card previews more than twice as tall as
 * the old 4:5 one — at the previous 260 the preview alone was 462px, which does
 * not leave room for the format picker and the buttons on a phone.
 */
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

/**
 * Preview the leaderboard as an image, pick a style, then share or save it.
 *
 * Capture pitfalls handled here:
 *  • Fonts — wait for document.fonts.ready, or the export renders in a fallback
 *    face and the whole thing looks off-brand.
 *  • Avatars — decode every <img> before capturing; an undecoded remote image
 *    exports as a blank square.
 *  • Transform — the *wrapper* is scaled for the preview, never the captured
 *    node, so the clone renders at full 1080×1350 instead of a 260px thumbnail.
 *  • iOS — navigator.share must run inside the tap's transient activation
 *    window. Capture is fast (the card is already mounted), but if the OS still
 *    rejects it we fall back to a download rather than failing silently.
 */
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

  // `entries` is the FULL ranked list for this view, which is what the climber
  // must be computed from — the biggest climber is usually someone still
  // working their way up, not one of the ten on the card.
  const climber = useMemo(() => biggestClimber(entries), [entries])

  // Warm the capture library while the user is still looking at the preview, so
  // the tap itself stays inside iOS's activation window.
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

    // JPEG, not PNG. A 1080×1920 dark gradient as PNG is several megabytes —
    // which matters when a student sends it over mobile data, and some share
    // targets recompress a large file anyway (so you get JPEG quality at PNG
    // size). 0.92 is visually lossless on faces and avatars.
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
          // Anything else (NotAllowedError from a lapsed activation window,
          // unsupported target) → fall through to a plain download.
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

        {/* Live preview — exactly what gets exported, just scaled down. */}
        {hasEntries ? (
          <div className="flex justify-center">
            <div
              className="overflow-hidden rounded-2xl ring-1 ring-line"
              style={{ width: PREVIEW_W, height: Math.round(CARD_H * SCALE) }}
            >
              {/* The transform lives HERE, not on the captured node. */}
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
          <p className="py-8 text-center text-sm text-muted">
            Nothing to share yet — the board settles twice a day.
          </p>
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
