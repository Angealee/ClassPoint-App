import { rpc } from './_internal'
import type {
  LoungePost,
  LoungeQuota,
  LoungeReply,
  PulseKind,
  ShoutoutReceived,
  SpacePerson,
} from '@/lib/types'

// ============================================================================
// The Student Lounge (migration 0042)
//
// Every read goes through an RPC rather than PostgREST, for one reason: the
// feed needs `i_gave_w` and `can_delete` PER ROW, and expressing "did I W this"
// as an embed means either a second round-trip or a filter that silently drops
// posts nobody has W'd. The RPC answers it in the same scan.
// ============================================================================

interface PostRow {
  id: string
  kind: string
  author_student_id: string | null
  display_name: string
  avatar_url: string | null
  body: string | null
  target_student_id: string | null
  target_display_name: string | null
  target_avatar_url: string | null
  pulse_kind: string | null
  pulse_value: number | null
  w_count: number
  reply_count: number
  i_gave_w: boolean
  can_delete: boolean
  pinned_at: string | null
  hidden_at: string | null
  created_at: string
}

/** Exported: the realtime handler maps an INSERT payload with it. */
export const mapLoungePost = (r: PostRow): LoungePost => ({
  id: r.id,
  kind: (r.kind === 'shoutout' || r.kind === 'pulse' ? r.kind : 'text') as LoungePost['kind'],
  authorStudentId: r.author_student_id,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  body: r.body,
  targetStudentId: r.target_student_id,
  targetDisplayName: r.target_display_name,
  targetAvatarUrl: r.target_avatar_url,
  pulseKind: (r.pulse_kind as PulseKind | null) ?? null,
  pulseValue: r.pulse_value,
  wCount: r.w_count ?? 0,
  replyCount: r.reply_count ?? 0,
  iGaveW: !!r.i_gave_w,
  canDelete: !!r.can_delete,
  pinnedAt: r.pinned_at,
  hiddenAt: r.hidden_at,
  createdAt: r.created_at,
})

/** The compound keyset cursor. A timestamp alone is not a total order. */
export interface FeedCursor {
  createdAt: string
  id: string
}

export type FeedMode = 'latest' | 'trending'

/**
 * A page of the feed.
 *
 * Pinned posts are EXCLUDED here and fetched separately — folding them in means
 * either a duplicate or a cursor that special-cases page one, and a clever
 * pagination query is where an off-by-one lives.
 */
export async function getLoungeFeed(
  mode: FeedMode = 'latest',
  opts?: { limit?: number; before?: FeedCursor | null },
): Promise<LoungePost[]> {
  const rows = await rpc<PostRow[]>('get_lounge_feed', {
    p_mode: mode,
    p_limit: opts?.limit ?? 20,
    p_before_created: opts?.before?.createdAt ?? null,
    p_before_id: opts?.before?.id ?? null,
  })
  return (rows ?? []).map(mapLoungePost)
}

/** At most a few, and only ever on the first screen of the feed. */
export async function getLoungePinned(): Promise<LoungePost[]> {
  const rows = await rpc<PostRow[]>('get_lounge_pinned')
  return (rows ?? []).map(mapLoungePost)
}

/** One post, for /app/space/post/:id. Null when it has been deleted. */
export async function getLoungePost(id: string): Promise<LoungePost | null> {
  const rows = await rpc<PostRow[]>('get_lounge_post', { p_id: id })
  const r = rows?.[0]
  return r ? mapLoungePost(r) : null
}

interface ReplyRow {
  id: string
  author_student_id: string | null
  display_name: string
  avatar_url: string | null
  body: string | null
  can_delete: boolean
  hidden_at: string | null
  created_at: string
}

export async function getLoungeReplies(postId: string): Promise<LoungeReply[]> {
  const rows = await rpc<ReplyRow[]>('get_lounge_replies', { p_post_id: postId })
  return (rows ?? []).map((r) => ({
    id: r.id,
    authorStudentId: r.author_student_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    body: r.body,
    canDelete: !!r.can_delete,
    hiddenAt: r.hidden_at,
    createdAt: r.created_at,
  }))
}

/**
 * How much of each allowance is left.
 *
 * The RPC owns the rules — length, banned words, the daily and weekly caps, the
 * duplicate guard — and raises a student-readable message, so surface
 * `error.message` directly via `errorText`.
 */
export async function getLoungeQuota(): Promise<LoungeQuota> {
  const rows = await rpc<{ posts_left: number; shoutouts_left: number; ws_left: number }[]>(
    'get_lounge_quota',
  )
  const r = rows?.[0]
  return {
    postsLeft: r?.posts_left ?? 0,
    shoutoutsLeft: r?.shoutouts_left ?? 0,
    wsLeft: r?.ws_left ?? 0,
  }
}

export async function postToLounge(body: string): Promise<string> {
  return await rpc<string>('post_to_lounge', { p_body: body })
}

export async function postShoutout(targetStudentId: string, body: string): Promise<string> {
  return await rpc<string>('post_shoutout', { p_target: targetStudentId, p_body: body })
}

export async function replyToPost(postId: string, body: string): Promise<string> {
  return await rpc<string>('reply_to_post', { p_post_id: postId, p_body: body })
}

/**
 * Toggle a W. Returns the post's new count, whether it is now yours, and how
 * many you have left — so one round-trip updates both the card and the counter.
 *
 * Un-W-ing REFUNDS the allowance (see 0042's header): three a day with no undo
 * would make a mis-tap cost a third of it.
 */
export async function giveW(
  postId: string,
): Promise<{ wCount: number; iGaveW: boolean; wsLeft: number }> {
  const rows = await rpc<{ w_count: number; i_gave_w: boolean; w_left: number }[]>('give_w', {
    p_post_id: postId,
  })
  const r = rows?.[0]
  return {
    wCount: r?.w_count ?? 0,
    iGaveW: !!r?.i_gave_w,
    wsLeft: r?.w_left ?? 0,
  }
}

/** Soft delete. Your own, or anything if you are the instructor. */
export async function deleteLoungePost(id: string): Promise<void> {
  await rpc('delete_lounge_post', { p_id: id })
}

export async function deleteLoungeReply(id: string): Promise<void> {
  await rpc('delete_lounge_reply', { p_id: id })
}

/** Instructor only. Pinning one post un-pins whatever was pinned before. */
export async function pinLoungePost(id: string, pinned: boolean): Promise<void> {
  await rpc('pin_lounge_post', { p_id: id, p_pinned: pinned })
}

/** The 7-day shoutout strip on a profile. */
export async function listShoutoutsFor(studentId: string): Promise<ShoutoutReceived[]> {
  const rows = await rpc<
    { id: string; display_name: string; avatar_url: string | null; body: string; created_at: string }[]
  >('list_shoutouts_for', { p_student_id: studentId })
  return (rows ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    body: r.body,
    createdAt: r.created_at,
  }))
}

/**
 * Everyone in Student Space, with the game facts the social surfaces draw
 * beside a name: level (from points), rank, and section.
 *
 * ⚠ Deliberately NOT `listStudents` — that one joins `student_secrets` to merge
 * claim tokens for the instructor's roster, so calling it from the student app
 * would ship every classmate's claim token over the wire to build a name list.
 *
 * INCLUDES the caller. One fetch per screen feeds the XP ring, the rank medal,
 * the section dot AND mention resolution; the shoutout picker filters itself
 * out, which is a one-line concern there rather than a second round-trip here.
 */
export async function listSpacePeople(): Promise<SpacePerson[]> {
  const rows = await rpc<
    {
      id: string
      display_name: string
      avatar_url: string | null
      semester_points: number
      section_id: string | null
      rank: number | null
    }[]
  >('get_space_people')
  return (rows ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    semesterPoints: r.semester_points ?? 0,
    sectionId: r.section_id,
    rank: r.rank,
  }))
}
