import { supabase } from './supabase'

/**
 * The realtime channel the "X is typing…" broadcast rides on.
 *
 * ── THE BUG THIS FIXES, AND WHY IT WAS INVISIBLE ────────────────────────────
 * Typing rode the room's `uniqueChannel('room-<id>')`, which appends a random
 * suffix to the topic so a remount cannot hand back a dying channel. That is
 * right for `postgres_changes` — those are server-side subscriptions, so two
 * clients on `room-x-a1b2` and `room-x-c3d4` still both receive the same row
 * events, and everything looked fine.
 *
 * BROADCAST IS DELIVERED TO THE TOPIC. Two people in one room were on two
 * different topics, so a broadcast from one could never reach the other, and
 * the indicator never appeared for anybody. Nothing errored; the message simply
 * went to a topic with one listener — the sender, who is excluded by default.
 *
 * So typing needs a SHARED topic. That reintroduces the hazard `uniqueChannel`
 * exists to dodge, and this module answers it three ways:
 *
 *   1. ONE `.on()` binding ever, made at creation. Consumers register a
 *      callback in a Set that the single handler fans out to, so nothing calls
 *      `.on()` on a channel that has already joined.
 *   2. Refcounted, so a second consumer joins the existing channel instead of
 *      racing to build another with the same topic.
 *   3. Teardown is DEFERRED. A remount — React's development double-invoke, a
 *      route re-key — releases and re-acquires within a frame, and tearing down
 *      synchronously is exactly how the next acquire gets handed a channel that
 *      is still unsubscribing.
 *
 * `postgres_changes` stays on the unique channel. Do not merge the two.
 */

/** Long enough to survive a remount, short enough to be a teardown. */
const TEARDOWN_MS = 2000

interface Entry {
  channel: ReturnType<typeof supabase.channel>
  listeners: Set<(name: string) => void>
  refs: number
  timer: number | null
}

const rooms = new Map<string, Entry>()

export interface TypingChannel {
  /** Tell the room you are typing. Silent no-op before the channel joins. */
  announce: (name: string) => void
  /** Drop this consumer. The channel closes once the last one leaves. */
  leave: () => void
}

export function joinTypingChannel(
  roomId: string,
  onTyping: (name: string) => void,
): TypingChannel {
  const topic = `typing-${roomId}`
  let entry = rooms.get(topic)

  if (entry?.timer != null) {
    window.clearTimeout(entry.timer)
    entry.timer = null
  }

  if (!entry) {
    const listeners = new Set<(name: string) => void>()
    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const name = (payload?.payload as { name?: string } | undefined)?.name
        if (!name) return
        for (const fn of listeners) fn(name)
      })
      .subscribe()
    entry = { channel, listeners, refs: 0, timer: null }
    rooms.set(topic, entry)
  }

  const held = entry
  held.listeners.add(onTyping)
  held.refs += 1

  return {
    announce: (name) => {
      // `send` before the join completes resolves to 'error' and is dropped.
      // That is correct: a keystroke in the first half-second of opening a room
      // is not worth queueing, and the next one is 2.5s away anyway.
      void held.channel.send({ type: 'broadcast', event: 'typing', payload: { name } })
    },
    leave: () => {
      held.listeners.delete(onTyping)
      held.refs -= 1
      if (held.refs > 0) return
      held.timer = window.setTimeout(() => {
        if (held.refs > 0) return
        rooms.delete(topic)
        void supabase.removeChannel(held.channel)
      }, TEARDOWN_MS)
    },
  }
}
