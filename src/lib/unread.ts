/**
 * Unread state for chat rooms — and the reason it is a pure module.
 *
 * ── WHY THIS IS NOT IN THE DATABASE ────────────────────────────────────────
 * There is no "seen" feature, by decision, and 0043 deliberately has no
 * read-receipt column: a column that exists gets rendered eventually. So a
 * student's read position lives ONLY on their own device, which is what makes
 * "nobody can see whether you read it" true rather than merely unimplemented.
 *
 * The storage is injectable so the rules can be tested without a browser, and
 * so a private window or a storage-blocked browser degrades to "nothing is
 * unread" instead of throwing.
 */

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
      // A hand-edited or corrupt entry must not put `undefined` into the
      // comparisons below, so anything that is not a string map is discarded.
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
      /* private window, or storage disabled — unread just stops persisting */
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
  // Never move the pointer BACKWARDS. Two tabs open on the same room would
  // otherwise fight, and the older one would resurrect an unread badge the
  // student has already cleared.
  if (cur[roomId] && cur[roomId] >= at) return
  store.set({ ...cur, [roomId]: at })
}

/**
 * Does this room have something new?
 *
 * A room you have NEVER opened counts as unread only if it has any message at
 * all — otherwise every empty room in a fresh install would wear a dot.
 */
export function isRoomUnread(
  room: { id: string; lastMessageAt: string | null },
  store: ReadStore = localReadStore,
): boolean {
  if (!room.lastMessageAt) return false
  const last = getLastRead(room.id, store)
  if (last === null) return true
  return room.lastMessageAt > last
}

/**
 * Where the "New messages" divider goes.
 *
 * Takes messages in DISPLAY order (oldest first) and returns the index of the
 * first one the reader has not seen, or -1 for no divider.
 *
 * ⚠ TWO CASES DELIBERATELY RETURN -1, and they are the ones worth pinning:
 *   • No stored pointer at all — a first visit. Drawing "New messages" above
 *     the very first line of a room you have never opened is noise, not news.
 *   • Index 0 with a pointer that predates everything loaded. The divider would
 *     sit at the top of the page with nothing above it, which reads as a
 *     rendering bug rather than a marker.
 */
export function unreadDividerIndex(
  messages: { id: string; createdAt: string }[],
  lastRead: string | null,
): number {
  if (lastRead === null) return -1
  const i = messages.findIndex((m) => m.createdAt > lastRead)
  if (i <= 0) return -1
  return i
}
