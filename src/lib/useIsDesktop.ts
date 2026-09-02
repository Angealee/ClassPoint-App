import { useSyncExternalStore } from 'react'

/**
 * Tailwind's default `md`. Mirrors the `md:` utilities Shell uses to swap the
 * sidebar for the bottom tab bar — if one moves, the other must move with it.
 */
export const DESKTOP_QUERY = '(min-width: 768px)'

/** Guard for a non-browser environment and for jsdom, which lacks matchMedia. */
const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

function subscribe(onChange: () => void): () => void {
  if (!canMatch()) return () => {}
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

const getSnapshot = () => (canMatch() ? window.matchMedia(DESKTOP_QUERY).matches : false)

/**
 * True at the `md` breakpoint and above.
 *
 * ── WHY A JS MEDIA QUERY EXISTS AT ALL ─────────────────────────────────────
 * Every other responsive decision in this app is pure CSS (`hidden md:flex`),
 * and that is still the rule. This hook exists for the one case CSS cannot
 * express: the account menu has TWO presentations — a portalled bottom Sheet on
 * mobile, an in-flow panel in the sidebar on desktop — and a Sheet portals to
 * <body>, so a `md:hidden` wrapper around it does nothing. Without this, both
 * would be open at once on a desktop viewport.
 *
 * Reach for a `md:` class first. Only use this when the two branches render to
 * different places in the DOM.
 *
 * `useSyncExternalStore` rather than useState + useEffect: matchMedia IS an
 * external store, so this is the API built for it — and it sidesteps the
 * cascading-render warning that a setState-in-effect resync earns.
 */
export function useIsDesktop(): boolean {
  // Third argument is the server/prerender snapshot: assume mobile-first.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
