import { useEffect, useSyncExternalStore } from 'react'
import { getInstructorProfile } from '@/lib/api'
import type { InstructorProfile } from '@/lib/types'

/*
 * One read of the instructor's profile per page load, shared by every place the instructor
 * speaks (chat, comments, the Lounge, the instructor's own screen). It FAILS SOFT: before 0071
 * is applied the RPC does not exist, and the answer is simply "no profile", so every caller
 * falls back to the ClassPoint logo and the word "Instructor" instead of showing an error.
 */
let current: InstructorProfile | null = null
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())

function load(): Promise<void> {
  if (!inflight) {
    inflight = getInstructorProfile()
      .then((p) => {
        current = p
      })
      .catch(() => {
        current = null
      })
      .finally(() => {
        loaded = true
        inflight = null
        emit()
      })
  }
  return inflight
}

/** After the instructor saves, the new value is what everyone sees without a refetch. */
export function setInstructorProfile(p: InstructorProfile | null) {
  current = p
  loaded = true
  emit()
}

export function useInstructorProfile(): InstructorProfile | null {
  useEffect(() => {
    if (!loaded) void load()
  }, [])
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => current,
    () => null,
  )
}
