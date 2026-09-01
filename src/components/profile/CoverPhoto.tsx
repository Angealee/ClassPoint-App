import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  url: string | null
  /** Vertical focal point, 0–100. 50 is centred (0040). */
  pos: number
  /** Taller on your own profile than in the preview sheet. */
  className?: string
  /** Drag-to-reposition + tap-to-change. Read-only when omitted. */
  editable?: boolean
  /** Called once on pointer release, with the settled 0–100 position. */
  onReposition?: (pos: number) => void
  /** Tap (as opposed to drag) — opens the file picker. */
  onPick?: () => void
  /** Rendered top-right, over the image. */
  action?: React.ReactNode
  busy?: boolean
}

/**
 * The profile cover image.
 *
 * ── ONE DEFINITION, TWO SCREENS ────────────────────────────────────────────
 * Your own profile and a classmate's preview sheet render the same cover, and
 * the second one has to honour the focal point the first one sets. Keeping the
 * markup in one place is the difference between "the cover looks right
 * everywhere" and the drift this codebase has already paid for four times over
 * with the points row and five times with the show-up rate.
 *
 * ── WHY A FOCAL POINT AND NOT A CROP ───────────────────────────────────────
 * `object-fit: cover` scales the image to fill and throws away the overflow —
 * centred by default, which cuts the head off a portrait. `object-position`
 * chooses WHICH part survives, so the full image is still stored and the
 * choice stays changeable forever (0040).
 *
 * ── WHY THE DRAG DISTINGUISHES ITSELF FROM A TAP ───────────────────────────
 * The same element does both: tap to choose a new photo, drag to reposition
 * the one that's there. A drag that moves less than DRAG_SLOP is treated as a
 * tap, so a slightly shaky finger opens the picker instead of nudging the
 * image by 2% and saving it.
 */
const DRAG_SLOP = 4

export function CoverPhoto({
  url,
  pos,
  className,
  editable = false,
  onReposition,
  onPick,
  action,
  busy = false,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  /**
   * `lastPos` is held in the REF, not read back from state on release.
   *
   * The first version committed `livePos` (state) in the pointerup handler.
   * That handler closes over the value from its own render, and a move plus a
   * release inside one React batch means the re-render hasn't happened yet — so
   * `livePos` was still null and the reposition was silently dropped. In normal
   * use several frames intervene and it works, which is the worst version of
   * this bug: it would have shown up as "sometimes my cover doesn't save".
   */
  const dragRef = useRef<{
    startY: number
    startPos: number
    moved: boolean
    lastPos: number
  } | null>(null)
  // Local while dragging so the image tracks the finger without a round trip;
  // the prop takes over again once the parent has saved.
  const [livePos, setLivePos] = useState<number | null>(null)
  const shown = livePos ?? pos

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!editable || !url || busy) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startPos: pos, moved: false, lastPos: pos }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    const box = boxRef.current
    if (!d || !box) return
    const dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dy) < DRAG_SLOP) return
    d.moved = true
    // Dragging DOWN reveals more of the top, so the focal point decreases.
    // Scaled by the box height: a full-height drag sweeps the whole image.
    const next = Math.max(0, Math.min(100, d.startPos - (dy / Math.max(1, box.clientHeight)) * 100))
    d.lastPos = next
    setLivePos(next)
  }

  function onPointerUp() {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (!d.moved) {
      setLivePos(null)
      onPick?.()
      return
    }
    onReposition?.(Math.round(d.lastPos))
  }

  const interactive = editable && !busy

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        'group relative w-full overflow-hidden bg-gradient-to-br from-card-2 via-card to-card-2',
        // `touch-none` stops the browser claiming the vertical gesture as a
        // page scroll — without it the drag simply never fires on a phone,
        // which is the only place this control matters.
        interactive && url && 'cursor-grab touch-none active:cursor-grabbing',
        interactive && !url && 'cursor-pointer',
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-cover"
          style={{ objectPosition: `50% ${shown}%` }}
        />
      ) : (
        editable && (
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            className="flex h-full w-full items-center justify-center text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            {busy ? 'Uploading…' : 'Add a cover photo'}
          </button>
        )
      )}

      {/* The hint only appears once there is something to drag, and says which
          of the two gestures does what — otherwise "tap or drag" on an empty
          gradient is a promise about nothing. */}
      {interactive && url && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/45 to-transparent pb-1.5 pt-6 text-2xs font-medium text-white/85 opacity-0 transition-opacity group-hover:opacity-100">
          Drag to reposition · tap to change
        </span>
      )}

      {action && <div className="absolute right-2 top-2 z-[1]">{action}</div>}
    </div>
  )
}
