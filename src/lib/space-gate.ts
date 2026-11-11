import type { ToneName } from '@/lib/tone'

/** Mirrors `cp_space_state()` in migration 0041. */
export type SpaceState = 'open' | 'paused' | 'locked'

export interface SpaceAccess {
  state: SpaceState
  canPost: boolean
  timeoutUntil: string | null
  timeoutReason: string | null
}

export const SPACE_ACCESS_UNKNOWN: SpaceAccess = {
  state: 'locked',
  canPost: false,
  timeoutUntil: null,
  timeoutReason: null,
}

export function spaceChip(state: SpaceState): { label: string; tone: ToneName } {
  switch (state) {
    case 'open':
      return { label: 'BETA', tone: 'accent' }
    case 'paused':
      return { label: 'Paused', tone: 'warn' }
    case 'locked':
      return { label: 'Soon', tone: 'neutral' }
  }
}

export function canPostNow(access: SpaceAccess, now: number = Date.now()): boolean {
  if (access.state !== 'open') return false
  if (access.timeoutUntil !== null) return Date.parse(access.timeoutUntil) <= now
  return access.canPost
}

export function isMuted(access: SpaceAccess, now: number = Date.now()): boolean {
  return access.state === 'open' && !canPostNow(access, now)
}
