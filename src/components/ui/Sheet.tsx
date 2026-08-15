import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/** Everything focusable inside the panel, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Bottom sheet modal (mobile-first) with backdrop, spring animation, and a
 * swipe-down-to-dismiss gesture. The panel caps its height to the viewport and
 * scrolls internally, so consumers can drop in tall content without their own
 * scroll wrapper. Drag is started from the grab handle only, so it never fights
 * the inner scroll area.
 *
 * Rendered through a portal to <body>: a Sheet opened from inside a
 * `backdrop-filter` ancestor (the header/sidebar, which use backdrop-blur)
 * would otherwise have its `fixed inset-0` resolve against that ancestor —
 * trapping it in the header strip on mobile / the narrow sidebar on desktop.
 * The portal escapes any such containing block.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const dragControls = useDragControls()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  /**
   * Focus management + scroll lock.
   *
   * Every modal, confirm dialog and profile preview in the app is a Sheet, so
   * this one effect covers ~20 surfaces. Previously: focus stayed behind the
   * backdrop (Tab walked the page underneath), nothing returned focus on close,
   * and the page kept scrolling behind the sheet on mobile.
   */
  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    // Move focus INTO the panel so a screen reader starts reading here.
    const focusFirst = () => {
      const panel = panelRef.current
      if (!panel) return
      const target = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel
      target.focus({ preventScroll: true })
    }
    const raf = requestAnimationFrame(focusFirst)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      // Wrap at both ends so Tab can never reach the page behind the backdrop.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      // Return focus to whatever opened the sheet.
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  // Dismiss if flung or dragged far enough down; otherwise it springs back.
  function onDragEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            // Names the dialog for screen readers when it has a heading; without
            // this the announcement is just "dialog".
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className="relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-canvas shadow-2xl outline-none sm:rounded-3xl"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={onDragEnd}
          >
            {/* Grab handle — the only drag surface, so content can scroll freely. */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="shrink-0 cursor-grab touch-none pb-2 pt-3 active:cursor-grabbing"
              aria-hidden="true"
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {title && (
                <h2 id={titleId} className="mb-4 font-display text-lg font-bold">
                  {title}
                </h2>
              )}
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
