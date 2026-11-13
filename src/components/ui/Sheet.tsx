import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { glide } from '@/lib/motion'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  variant?: 'sheet' | 'screen'
}

/** Everything focusable inside the panel, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({ open, onClose, title, children, variant = 'sheet' }: SheetProps) {
  const screen = variant === 'screen'
  const dragControls = useDragControls()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const focusFirst = () => {
      const panel = panelRef.current
      if (!panel) return
      const target = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel
      target.focus({ preventScroll: true })
    }
    const raf = requestAnimationFrame(focusFirst)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
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
    // `open` ONLY — see the onCloseRef note above.
  }, [open])

  function onDragEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={
            screen
              ? 'fixed inset-0 z-40'
              : 'fixed inset-0 z-40 flex items-end justify-center sm:items-center'
          }
        >
          {!screen && (
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
          )}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={
              screen
                ? 'relative flex h-full w-full flex-col bg-canvas outline-none'
                : 'relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-canvas shadow-2xl outline-none sm:rounded-3xl'
            }
            initial={screen ? { x: '100%' } : { y: '100%', opacity: 0.6 }}
            animate={screen ? { x: 0 } : { y: 0, opacity: 1 }}
            exit={screen ? { x: '100%' } : { y: '100%', opacity: 0.6 }}
            transition={glide}
            drag={screen ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={onDragEnd}
          >
            {screen ? (
              <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-line bg-canvas/95 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Back"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-card-2"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M19 12H5" />
                    <path d="m12 19-7-7 7-7" />
                  </svg>
                </button>
                {title && (
                  <h2 id={titleId} className="sr-only">
                    {title}
                  </h2>
                )}
              </div>
            ) : (
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="shrink-0 cursor-grab touch-none pb-2 pt-3 active:cursor-grabbing"
                aria-hidden="true"
              >
                <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
              </div>
            )}
            <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {title && !screen && (
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
