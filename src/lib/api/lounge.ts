import { rpc } from './_internal'
import type {
  LoungePost,
  LoungeQuota,
  LoungeReply,
  PostW,
  PulseKind,
  ShoutoutReceived,
  SpacePerson,
} from '@/lib/types'

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

export interface FeedCursor {
  createdAt: string
  id: string
}

export type FeedMode = 'latest' | 'trending'

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

export async function getLoungePinned(): Promise<LoungePost[]> {
  const rows = await rpc<PostRow[]>('get_lounge_pinned')
  return (rows ?? []).map(mapLoungePost)
}

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
  parent_reply_id?: string | null
  reply_to_id?: string | null
  reply_to_name?: string | null
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
    // Optional until 0068 is applied: an older database simply has no threads.
    parentReplyId: r.parent_reply_id ?? null,
    replyToId: r.reply_to_id ?? null,
    replyToName: r.reply_to_name ?? null,
  }))
}

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

/**
 * `parentId` is the comment being answered (omit for a top-level reply). It is
 * OMITTED rather than sent as null when absent, so a plain reply still resolves
 * against a database that has not had 0068 pasted yet.
 */
export async function replyToPost(
  postId: string,
  body: string,
  parentId?: string,
): Promise<string> {
  return await rpc<string>('reply_to_post', {
    p_post_id: postId,
    p_body: body,
    ...(parentId ? { p_parent_id: parentId } : {}),
  })
}

/** Who gave a W on this post (0068). Visible to everyone in Student Space. */
export async function getPostWs(postId: string): Promise<PostW[]> {
  const rows = await rpc<
    {
      student_id: string
      display_name: string
      avatar_url: string | null
      section_id: string | null
      created_at: string
    }[]
  >('get_post_ws', { p_post_id: postId })
  return (rows ?? []).map((r) => ({
    studentId: r.student_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    sectionId: r.section_id,
    createdAt: r.created_at,
  }))
}

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

export async function deleteLoungePost(id: string): Promise<void> {
  await rpc('delete_lounge_post', { p_id: id })
}

export async function deleteLoungeReply(id: string): Promise<void> {
  await rpc('delete_lounge_reply', { p_id: id })
}

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
