import { rpc } from './_internal'
import { supabase } from '@/lib/supabase'
import type {
  ReactionCode,
  RoomAudience,
  RoomKind,
  RoomNotifyLevel,
  RoomPin,
  SpaceMessage,
  SpaceRoom,
} from '@/lib/types'

// ============================================================================
// Student Space messaging (migration 0043)
//
// Reads go through RPCs for the same reason the Lounge's do: `mentions_me`,
// `can_delete` and the per-viewer reaction tallies are computed in the same
// scan, and none of them is expressible as a PostgREST embed.
//
// ⚠ A DM is readable ONLY by its members — the instructor included, and only
// when they are one. Their break-glass path is `readDmThread`, which writes an
// audit row before returning anything.
// ============================================================================

interface RoomRow {
  id: string
  kind: string
  name: string
  slow_mode_seconds: number
  announce_only: boolean
  pinned_message_id: string | null
  muted: boolean
  last_message_at: string | null
  last_message_by: string | null
  last_message_body: string | null
  member_count: number
}

const mapRoom = (r: RoomRow): SpaceRoom => ({
  id: r.id,
  kind: (['section', 'global', 'dm'].includes(r.kind) ? r.kind : 'section') as RoomKind,
  name: r.name,
  slowModeSeconds: r.slow_mode_seconds ?? 0,
  announceOnly: !!r.announce_only,
  pinnedMessageId: r.pinned_message_id,
  muted: !!r.muted,
  lastMessageAt: r.last_message_at,
  lastMessageBy: r.last_message_by,
  lastMessageBody: r.last_message_body,
  memberCount: r.member_count ?? 0,
})

/** Every room you are in. Provisions the section and Global rooms on the way. */
export async function listMyRooms(): Promise<SpaceRoom[]> {
  const rows = await rpc<RoomRow[]>('list_my_rooms')
  return (rows ?? []).map(mapRoom)
}

interface MessageRow {
  id: string
  author_student_id: string | null
  display_name: string
  avatar_url: string | null
  body: string | null
  reply_to_id: string | null
  reply_to_name: string | null
  reply_to_excerpt: string | null
  mentions_me: boolean
  can_delete: boolean
  reactions: Record<string, number> | null
  my_reactions: string[] | null
  hidden_at: string | null
  deleted_at: string | null
  created_at: string
}

export const mapMessage = (r: MessageRow): SpaceMessage => ({
  id: r.id,
  authorStudentId: r.author_student_id,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  body: r.body,
  replyToId: r.reply_to_id,
  replyToName: r.reply_to_name,
  replyToExcerpt: r.reply_to_excerpt,
  mentionsMe: !!r.mentions_me,
  canDelete: !!r.can_delete,
  reactions: (r.reactions ?? {}) as Partial<Record<ReactionCode, number>>,
  myReactions: (r.my_reactions ?? []) as ReactionCode[],
  hiddenAt: r.hidden_at,
  deletedAt: r.deleted_at,
  createdAt: r.created_at,
})

export interface MessageCursor {
  createdAt: string
  id: string
}

/**
 * One page of a room, NEWEST FIRST.
 *
 * Returned descending because that is the order the keyset cursor pages in;
 * the screen reverses for display. Compound cursor, because two messages can
 * share a millisecond and a timestamp alone would drop or repeat one.
 */
export async function getRoomMessages(
  roomId: string,
  opts?: { limit?: number; before?: MessageCursor | null },
): Promise<SpaceMessage[]> {
  const rows = await rpc<MessageRow[]>('get_room_messages', {
    p_room: roomId,
    p_limit: opts?.limit ?? 40,
    p_before_created: opts?.before?.createdAt ?? null,
    p_before_id: opts?.before?.id ?? null,
  })
  return (rows ?? []).map(mapMessage)
}

/**
 * Why the caller cannot post here, or null if they can.
 *
 * One server-side answer for all four rules — space state, timeout,
 * announce-only, slow mode — so the composer's disabled state and the send
 * itself can never disagree about why.
 */
export async function getRoomPostBlock(roomId: string): Promise<string | null> {
  return (await rpc<string | null>('cp_room_post_block', { p_room: roomId })) ?? null
}

export async function sendMessage(
  roomId: string,
  body: string,
  opts?: { replyTo?: string | null; mentions?: string[] },
): Promise<string> {
  return await rpc<string>('send_message', {
    p_room: roomId,
    p_body: body,
    p_reply_to: opts?.replyTo ?? null,
    p_mentions: opts?.mentions?.length ? opts.mentions : null,
  })
}

/** Toggle. Returns true when the reaction is now yours. */
export async function reactToMessage(messageId: string, code: ReactionCode): Promise<boolean> {
  return !!(await rpc<boolean>('react_to_message', { p_message: messageId, p_code: code }))
}

/** Soft delete — leaves a tombstone so a reply to it still reads. */
export async function deleteMyMessage(id: string): Promise<void> {
  await rpc('delete_my_message', { p_id: id })
}

/** Open or reopen a DM. `null` means "message the instructor". */
export async function startDm(targetStudentId: string | null): Promise<string> {
  return await rpc<string>('start_dm', { p_target: targetStudentId })
}

export async function setRoomMuted(roomId: string, muted: boolean): Promise<boolean> {
  return !!(await rpc<boolean>('set_room_muted', { p_room: roomId, p_muted: muted }))
}

// ── The room panel (migration 0046) ─────────────────────────────────────────

interface PinRow {
  message_id: string
  author_id: string | null
  display_name: string
  avatar_url: string | null
  body: string | null
  created_at: string
  pinned_at: string
  pinned_by: string | null
  can_unpin: boolean
}

/** Newest pin first. A hidden or deleted message keeps its row but loses its body. */
export async function listRoomPins(roomId: string): Promise<RoomPin[]> {
  const rows = await rpc<PinRow[]>('get_room_pins', { p_room: roomId })
  return (rows ?? []).map((r) => ({
    messageId: r.message_id,
    authorId: r.author_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    body: r.body,
    createdAt: r.created_at,
    pinnedAt: r.pinned_at,
    pinnedBy: r.pinned_by,
    canUnpin: !!r.can_unpin,
  }))
}

/**
 * Who is in this room, resolved WITHOUT a new RPC.
 *
 * `list_my_rooms` does not return `section_id`, but `space_rooms` carries a
 * SELECT policy gated on `cp_can_read_room()` — so the two facts the audience
 * needs are readable directly, and the roster to match them against is the one
 * `listSpacePeople()` already fetched for the XP rings and mentions.
 *
 * The one place a component may touch `.from()` is a Realtime subscription, so
 * this read lives here rather than in the screen.
 */
export async function getRoomAudience(roomId: string): Promise<RoomAudience> {
  const { data: room, error } = await supabase
    .from('space_rooms')
    .select('kind, section_id')
    .eq('id', roomId)
    .maybeSingle()
  if (error) throw error

  const kind = (room?.kind ?? 'section') as RoomKind
  if (kind !== 'dm') {
    return { kind, sectionId: room?.section_id ?? null, memberIds: null, hasInstructor: true }
  }

  const { data: members, error: memberError } = await supabase
    .from('space_room_members')
    .select('student_id')
    .eq('room_id', roomId)
  if (memberError) throw memberError

  const rows = members ?? []
  return {
    kind,
    sectionId: null,
    memberIds: rows.map((m) => m.student_id).filter((id): id is string => id !== null),
    // A null student_id in a DM IS the instructor (0020's convention).
    hasInstructor: rows.some((m) => m.student_id === null),
  }
}

// ── Instructor ──────────────────────────────────────────────────────────────

export async function setRoomControls(
  roomId: string,
  opts: { slowModeSeconds?: number | null; announceOnly?: boolean | null },
): Promise<void> {
  await rpc('set_room_controls', {
    p_room: roomId,
    p_slow: opts.slowModeSeconds ?? null,
    p_announce: opts.announceOnly ?? null,
  })
}

/** Pin a message. Anyone who can post; the room caps out at 10. */
export async function pinMessage(roomId: string, messageId: string): Promise<void> {
  await rpc('pin_message', { p_room: roomId, p_message: messageId })
}

export async function unpinMessage(roomId: string, messageId: string): Promise<void> {
  await rpc('unpin_message', { p_room: roomId, p_message: messageId })
}

/**
 * BREAK-GLASS. The instructor reading a DM they are not in.
 *
 * Writes an `audit_log` row before returning a single message. This is the only
 * path — RLS grants the instructor nothing in a DM, deliberately.
 */
export async function readDmThread(
  roomId: string,
  reason?: string,
): Promise<{ id: string; displayName: string; body: string | null; createdAt: string }[]> {
  const rows = await rpc<
    { id: string; display_name: string; body: string | null; created_at: string }[]
  >('read_dm_thread', { p_room: roomId, p_reason: reason ?? null })
  return (rows ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    body: r.body,
    createdAt: r.created_at,
  }))
}

// ── Notification level per room (migration 0048) ────────────────────────────

/**
 * Read your own level for a room.
 *
 * A direct select rather than an RPC: `space_room_prefs_select` already scopes
 * the table to `student_id = cp_my_student_id()`, so there is nothing an RPC
 * would add except another function to keep in step. A row only exists once you
 * have changed something, hence the default.
 */
export async function getRoomLevel(roomId: string): Promise<RoomNotifyLevel> {
  const { data, error } = await supabase
    .from('space_room_prefs')
    .select('level')
    .eq('room_id', roomId)
    .maybeSingle()
  if (error) throw error
  const level = data?.level
  return level === 'all' || level === 'none' ? level : 'mentions'
}

export async function setRoomLevel(
  roomId: string,
  level: RoomNotifyLevel,
): Promise<RoomNotifyLevel> {
  return ((await rpc<string>('set_room_level', { p_room: roomId, p_level: level })) ??
    level) as RoomNotifyLevel
}
