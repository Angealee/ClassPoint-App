import { supabase } from './supabase'

const TEARDOWN_MS = 2000

interface Entry {
  channel: ReturnType<typeof supabase.channel>
  listeners: Set<(name: string) => void>
  refs: number
  timer: number | null
}

const rooms = new Map<string, Entry>()

export interface TypingChannel {
  announce: (name: string) => void
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
