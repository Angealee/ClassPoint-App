import { useSyncExternalStore } from 'react'

/*
 * Which identity card is open: the instructor (a person) or ClassPoint (the official voice).
 * It is a one-slot store rather than a Sheet per avatar because the instructor's avatar can
 * appear on every message row of a busy room, and a closed Sheet per row is a lot of nothing.
 * One host (IdentityHost) is mounted in each layout and reads this.
 */
export type Who = 'instructor' | 'classpoint'

let open: Who | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openIdentity(who: Who) {
  open = who
  emit()
}

export function closeIdentity() {
  open = null
  emit()
}

export function useOpenIdentity(): Who | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => open,
    () => null,
  )
}
