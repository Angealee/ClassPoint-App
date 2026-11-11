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
  onReposition?: (pos: number) => void
  /** Tap (as opposed to drag) — opens the file picker. */
  onPick?: () => void
  /** Rendered top-right, over the image. */
  action?: React.ReactNode
  busy?: boolean
}

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
  const dragRef = useRef<{
    startY: number
    startPos: number
    moved: boolean
    lastPos: number
  } | null>(null)
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

      {interactive && url && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/45 to-transparent pb-1.5 pt-6 text-2xs font-medium text-white/85 opacity-0 transition-opacity group-hover:opacity-100">
          Drag to reposition · tap to change
        </span>
      )}

      {action && <div className="absolute right-2 top-2 z-[1]">{action}</div>}
    </div>
  )
}
