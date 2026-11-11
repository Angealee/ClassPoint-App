import { supabase } from '@/lib/supabase'
import type {
  LeaderboardComment,
} from '@/lib/types'

const COMMENT_COLS = 'id, student_id, display_name, avatar_url, body, created_at'

interface CommentRow {
  id: string
  student_id: string | null
  display_name: string
  avatar_url: string | null
  body: string
  created_at: string
}

export const mapComment = (r: CommentRow): LeaderboardComment => ({
  id: r.id,
  studentId: r.student_id,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  body: r.body,
  createdAt: r.created_at,
})

export async function listLeaderboardComments(limit = 30): Promise<LeaderboardComment[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('leaderboard_comments')
    .select(COMMENT_COLS)
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as CommentRow[]).map(mapComment)
}

export async function postLeaderboardComment(body: string): Promise<void> {
  const { error } = await supabase.rpc('post_leaderboard_comment', { p_body: body })
  if (error) throw error
}

export async function deleteLeaderboardComment(id: string): Promise<void> {
  const { error } = await supabase.from('leaderboard_comments').delete().eq('id', id)
  if (error) throw error
}

export async function countMyCommentsToday(studentId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('leaderboard_comments')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .gt('created_at', since)
  if (error) throw error
  return count ?? 0
}

