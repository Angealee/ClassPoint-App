import { supabase } from '@/lib/supabase'
import type {
  AppNotification,
} from '@/lib/types'

// ============================================================================
// Notifications — the outbox-backed bell (migration 0017)
// ============================================================================

/**
 * A page of the student's notification history, newest first. Keyset-paginated:
 * pass the oldest row's `createdAt` as `before` to load the next page.
 */
export async function listNotifications(
  studentId: string,
  opts?: { before?: string; limit?: number },
): Promise<AppNotification[]> {
  let query = supabase
    .from('notifications')
    .select('id, type, title, body, url, created_at, read_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 30)
  if (opts?.before) query = query.lt('created_at', opts.before)
  const { data, error } = await query
  if (error) throw error
  return (
    (data ?? []) as Array<{
      id: string
      type: string
      title: string
      body: string
      url: string
      created_at: string
      read_at: string | null
    }>
  ).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    url: r.url,
    createdAt: r.created_at,
    readAt: r.read_at,
  }))
}

/** How many notifications the student hasn't read — drives the bell badge. */
export async function getUnreadNotificationCount(studentId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

/** Mark all of my notifications read (up to now). */
export async function markNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read')
  if (error) throw error
}

/** Fire a real end-to-end test push to this student's devices. */
export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.rpc('send_test_push')
  if (error) throw error
}

