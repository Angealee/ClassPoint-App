import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /**
   * `'screen'` fills the viewport and exits through a back button instead of a
   * grab handle — the shape a phone wants when the panel IS a destination
   * (a room's details) rather than a short decision.
   *
   * Additive: every one of the ~21 existing Sheets omits it and is unchanged,
   * including the animation. In screen mode the title still labels the dialog
   * for a screen reader but is not drawn, because the content brings its own
   * identity block below the back bar.
   */
  variant?: 'sheet' | 'screen'
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
export function Sheet({ open, onClose, title, children, variant = 'sheet' }: SheetProps) {
  const screen = variant === 'screen'
  const dragControls = useDragControls()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  /**
   * `onClose` lives in a ref so the effect below can depend on `open` ALONE.
   *
   * ── THE BUG THIS FIXES ─────────────────────────────────────────────────
   * The effect used to list `onClose` as a dependency. Most callers pass an
   * inline arrow (`onClose={() => setEditOpen(false)}`), which is a new
   * function identity on every render — so any state change inside the sheet
   * re-ran the whole effect, and its `focusFirst()` moved focus to the panel's
   * FIRST focusable element.
   *
   * In practice: typing a character into the Bio textarea re-rendered Profile,
   * and the next keystroke landed in Display name. Every field in every sheet
   * whose parent re-renders as you type was affected — 21 sheets, including the
   * student excuse-reason form and the instructor's import and grant flows.
   */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

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
    // `open` ONLY — see the onCloseRef note above.
  }, [open])

  // Dismiss if flung or dragged far enough down; otherwise it springs back.
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
            // Names the dialog for screen readers when it has a heading; without
            // this the announcement is just "dialog".
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={
              screen
                ? 'relative flex h-full w-full flex-col bg-canvas outline-none'
                : 'relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-canvas shadow-2xl outline-none sm:rounded-3xl'
            }
            // A screen PUSHES in from the right, the way a phone's detail view
            // does; a sheet rises from the bottom. Both are switched off for
            // reduced motion by App.tsx's MotionConfig.
            initial={screen ? { x: '100%' } : { y: '100%', opacity: 0.6 }}
            animate={screen ? { x: 0 } : { y: 0, opacity: 1 }}
            exit={screen ? { x: '100%' } : { y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag={screen ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={onDragEnd}
          >
            {screen ? (
              // Sticky, because this bar carries the ONLY way out — the same
              // reason the chat room's own header is sticky.
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
              /* Grab handle — the only drag surface, so content can scroll freely. */
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="shrink-0 cursor-grab touch-none pb-2 pt-3 active:cursor-grabbing"
                aria-hidden="true"
              >
                <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
              </div>
            )}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
