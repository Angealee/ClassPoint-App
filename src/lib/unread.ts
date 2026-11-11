
const KEY = 'cp_space_read_v1'

export interface ReadStore {
  get(): Record<string, string>
  set(next: Record<string, string>): void
}

/** localStorage, wrapped so every access is allowed to fail. */
export const localReadStore: ReadStore = {
  get() {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return {}
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v
      }
      return out
    } catch {
      return {}
    }
  },
  set(next) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
    }
  },
}

export function getLastRead(roomId: string, store: ReadStore = localReadStore): string | null {
  return store.get()[roomId] ?? null
}

export function markRead(
  roomId: string,
  at: string = new Date().toISOString(),
  store: ReadStore = localReadStore,
): void {
  const cur = store.get()
  if (cur[roomId] && cur[roomId] >= at) return
  store.set({ ...cur, [roomId]: at })
}

export function isRoomUnread(
  room: { id: string; lastMessageAt: string | null },
  store: ReadStore = localReadStore,
): boolean {
  if (!room.lastMessageAt) return false
  const last = getLastRead(room.id, store)
  if (last === null) return true
  return room.lastMessageAt > last
}

export function unreadDividerIndex(
  messages: { id: string; createdAt: string }[],
  lastRead: string | null,
): number {
  if (lastRead === null) return -1
  const i = messages.findIndex((m) => m.createdAt > lastRead)
  if (i <= 0) return -1
  return i
}
