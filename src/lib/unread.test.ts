import { describe, expect, it } from 'vitest'
import {
  getLastRead,
  isRoomUnread,
  markRead,
  unreadDividerIndex,
  type ReadStore,
} from './unread'

/**
 * Pure logic, no browser — the store is injected, which is the whole reason it
 * is a parameter.
 *
 * The load-bearing cases are the two that return -1 from `unreadDividerIndex`.
 * Every other rule here fails visibly; those two fail as a "New messages" line
 * floating at the top of a room with nothing above it, which reads as a bug in
 * the app rather than a bug in the rule.
 */

function memStore(initial: Record<string, string> = {}): ReadStore {
  let data = { ...initial }
  return {
    get: () => ({ ...data }),
    set: (next) => {
      data = { ...next }
    },
  }
}

const T = (s: string) => `2026-09-02T${s}:00.000Z`

describe('markRead / getLastRead', () => {
  it('stores and reads back a pointer', () => {
    const s = memStore()
    markRead('room-1', T('10:00'), s)
    expect(getLastRead('room-1', s)).toBe(T('10:00'))
    expect(getLastRead('room-2', s)).toBeNull()
  })

  it('never moves the pointer backwards', () => {
    // Two tabs on the same room: the stale one must not resurrect a badge the
    // student already cleared in the other.
    const s = memStore({ 'room-1': T('12:00') })
    markRead('room-1', T('09:00'), s)
    expect(getLastRead('room-1', s)).toBe(T('12:00'))
  })

  it('leaves other rooms alone', () => {
    const s = memStore({ a: T('10:00') })
    markRead('b', T('11:00'), s)
    expect(getLastRead('a', s)).toBe(T('10:00'))
    expect(getLastRead('b', s)).toBe(T('11:00'))
  })
})

describe('isRoomUnread', () => {
  it('is false for a room with no messages, even unopened', () => {
    const s = memStore()
    expect(isRoomUnread({ id: 'r', lastMessageAt: null }, s)).toBe(false)
  })

  it('is true for a never-opened room that has messages', () => {
    const s = memStore()
    expect(isRoomUnread({ id: 'r', lastMessageAt: T('10:00') }, s)).toBe(true)
  })

  it('compares against the stored pointer', () => {
    const s = memStore({ r: T('10:00') })
    expect(isRoomUnread({ id: 'r', lastMessageAt: T('09:59') }, s)).toBe(false)
    expect(isRoomUnread({ id: 'r', lastMessageAt: T('10:00') }, s)).toBe(false)
    expect(isRoomUnread({ id: 'r', lastMessageAt: T('10:01') }, s)).toBe(true)
  })
})

describe('unreadDividerIndex', () => {
  const msgs = [
    { id: '1', createdAt: T('10:00') },
    { id: '2', createdAt: T('10:05') },
    { id: '3', createdAt: T('10:10') },
  ]

  it('points at the first unseen message', () => {
    expect(unreadDividerIndex(msgs, T('10:05'))).toBe(2)
    expect(unreadDividerIndex(msgs, T('10:00'))).toBe(1)
  })

  it('returns -1 on a first visit, with no pointer at all', () => {
    // "New messages" above the very first line of a room you have never opened
    // is noise, not news.
    expect(unreadDividerIndex(msgs, null)).toBe(-1)
  })

  it('returns -1 when EVERY message is unseen', () => {
    // The divider would sit at index 0 with nothing above it, which reads as a
    // rendering bug. This is the case that is easy to get wrong by returning
    // `findIndex` directly.
    expect(unreadDividerIndex(msgs, T('09:00'))).toBe(-1)
  })

  it('returns -1 when everything has been seen', () => {
    expect(unreadDividerIndex(msgs, T('11:00'))).toBe(-1)
  })

  it('handles an empty room', () => {
    expect(unreadDividerIndex([], T('10:00'))).toBe(-1)
    expect(unreadDividerIndex([], null)).toBe(-1)
  })
})
