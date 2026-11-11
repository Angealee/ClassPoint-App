import { useSyncExternalStore } from 'react'

export const DESKTOP_QUERY = '(min-width: 768px)'

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

function subscribe(onChange: () => void): () => void {
  if (!canMatch()) return () => {}
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

const getSnapshot = () => (canMatch() ? window.matchMedia(DESKTOP_QUERY).matches : false)

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
