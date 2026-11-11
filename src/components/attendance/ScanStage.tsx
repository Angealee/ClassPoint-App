import type { ReactNode } from 'react'
import { QrScanner } from '@/components/attendance/QrScanner'
import { cn } from '@/lib/cn'

/**
 * The camera, centred on the screen.
 *
 * ── WHAT THIS FIXES (the instructor's report, 2026-11-08) ───────────────────
 * "The camera should be in the center, not in the button." The scanner itself
 * was already `mx-auto` and capped at `min(85vw, 22rem)`, so the complaint was
 * never its horizontal alignment — it was the FRAMING. Attendance opened it in
 * a bottom `Sheet`, which rises from the bottom edge, so the viewfinder sat low
 * on the screen directly above the button that had just been tapped. You aimed
 * a phone at a projector while looking at the bottom third of your own screen.
 *
 * Now the camera owns the middle of the viewport, the caption sits under it,
 * and the one way out is pinned at the bottom where a thumb already is.
 *
 * ── ONE FRAMING, TWO CALL SITES ─────────────────────────────────────────────
 * Attendance and EventScan both hand-rolled the identical `space-y-3` +
 * caption stack, and their captions differed only in wording. This codebase has
 * merged the same duplication back together four separate times — the points
 * row reached four copies, the show-up rate five — so this one is extracted at
 * copy two rather than copy four.
 *
 * ⚠ `h-full` AND `min-h-[60dvh]` TOGETHER, and both are load-bearing.
 *   `h-full` resolves against a parent with a DEFINITE height — inside
 *   `Sheet variant="screen"`, whose panel is `flex h-full flex-col` and whose
 *   body is its `flex-1` child — so there the stage takes the whole viewport
 *   and the centring is real. Against an indefinite parent (EventScan's card)
 *   `height: 100%` computes to auto and is simply ignored, which is where
 *   `min-h-[60dvh]` takes over. One class set, no `fill` prop, no second
 *   layout to keep in step.
 *
 * ⚠ NO NEGATIVE-MARGIN BLEED here, however tempting it is to cancel the
 *   Sheet's `px-5`. Per spec, when one overflow axis is not `visible` the other
 *   computes to `auto` — the Sheet body is `overflow-y-auto`, so a bleed pushes
 *   content outside a scroller that then clips it. That is exactly what cut the
 *   avatar ring off the profile preview sheet.
 */
export function ScanStage({
  /** Bumped by the caller to force-remount the camera and restart it. */
  scanKey,
  onDetect,
  caption,
  /** The way out — a Cancel button, or nothing when the surface has its own. */
  footer,
  className,
}: {
  scanKey: number
  onDetect: (text: string) => void
  caption: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex h-full min-h-[60dvh] flex-col', className)}>
      {/* The camera takes the slack above and below, so it lands in the middle
          of whatever height it was given rather than at the top of it. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <QrScanner key={scanKey} onDetect={onDetect} />
        <p className="max-w-xs text-center text-sm text-muted">{caption}</p>
      </div>

      {footer && <div className="shrink-0 pt-4">{footer}</div>}
    </div>
  )
}
