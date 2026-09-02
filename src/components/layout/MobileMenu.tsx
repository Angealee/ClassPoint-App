import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import type { NavItem } from '@/components/layout/Shell'
import { IdentityBlock, SettingsRow, SignOutRow, type AccountActions } from './AccountMenu'
import { XIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * The mobile menu: a full-screen overlay that mirrors the desktop sidebar.
 *
 * ── WHY FULL-SCREEN AND NOT A BOTTOM SHEET ─────────────────────────────────
 * This was a Sheet, and it read wrong. A bottom sheet says "a small choice
 * about the screen you are on"; this is the app's navigation, and on desktop it
 * IS the sidebar. Taking the whole screen makes that claim honestly, gives the
 * rows room to be real tap targets, and removes the cramped three-row card that
 * looked like an afterthought.
 *
 * It deliberately repeats Home / Ranks / Attend even though those are tabs
 * underneath (the user's call): the menu is the sidebar, and a sidebar that
 * silently omits three of its five destinations is a different thing wearing
 * the same name.
 *
 * ── DISCIPLINES BORROWED FROM Sheet.tsx ────────────────────────────────────
 * Portalled to <body> (the mobile header is `backdrop-blur`, which would
 * otherwise become the containing block for `fixed inset-0` and trap this in
 * the header strip); scroll-locked; focus-trapped; Escape closes. And `onClose`
 * lives in a REF so the effect depends on `[open]` alone — the exact bug that
 * made every Sheet steal a keystroke from its own form.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function MobileMenu({
  open,
  onClose,
  nav,
  onNavigate,
  onRequestSignOut,
}: AccountActions & {
  open: boolean
  onClose: () => void
  /** The full sidebar nav — this overlay mirrors it exactly. */
  nav: NavItem[]
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // See the Sheet.tsx note: an inline-arrow `onClose` changes identity every
  // render, and listing it here would re-run the trap on every state change.
  const onCloseRef = useRef(onClose)
  // Assigned in an effect rather than during render: Sheet.tsx does the latter
  // and earns a react-hooks/refs warning for it. Same guarantee, no warning —
  // the Escape handler below only ever reads this after paint.
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      ;(panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus({ preventScroll: true })
    })

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
      previouslyFocused?.focus?.({ preventScroll: true })
    }
    // `open` ONLY — see the onCloseRef note above.
  }, [open])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          tabIndex={-1}
          // Rises rather than sliding sideways: it is summoned from the bottom
          // tab bar, so it should come from where the finger was.
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          className="fixed inset-0 z-50 flex flex-col bg-canvas outline-none"
        >
          {/* Unlike the app's sticky header, this is `fixed inset-0` and starts at
              the physical top of the screen — so it owns the notch inset. */}
          <header className="flex shrink-0 items-center justify-between border-b border-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <h2 className="font-display text-lg font-bold">Menu</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card-2 text-muted transition-colors hover:text-ink"
            >
              <XIcon className="h-4.5 w-4.5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <div className="rounded-2xl border border-line bg-card p-4">
              <IdentityBlock onNavigate={onNavigate} size="lg" />
            </div>

            <nav className="mt-4 flex flex-col gap-0.5">
              {nav.map((item) =>
                item.kind === 'button' ? null : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex h-14 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent-solid/10 text-accent'
                          : 'text-ink hover:bg-card-2',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.Icon
                          className={cn(
                            'h-5 w-5 shrink-0',
                            isActive && 'drop-shadow-[0_0_6px_var(--color-accent-solid)]',
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge}
                        {item.dot && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-accent-solid"
                            aria-label="New"
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                ),
              )}
            </nav>

            <div className="mt-4 flex flex-col gap-0.5 border-t border-line pt-3">
              <SettingsRow onNavigate={onNavigate} />
              <SignOutRow onRequestSignOut={onRequestSignOut} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

