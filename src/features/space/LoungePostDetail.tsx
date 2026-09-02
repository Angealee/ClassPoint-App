import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { PostCard } from '@/components/space/PostCard'
import { useStudentData } from '@/features/student/StudentData'
import {
  deleteLoungePost,
  deleteLoungeReply,
  getLoungePost,
  getLoungeReplies,
  giveW,
  replyToPost,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { canPostNow } from '@/lib/space-gate'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { MAX_POST_LENGTH, type LoungePost, type LoungeReply } from '@/lib/types'

/**
 * `/app/space/post/:postId` — one post and its replies.
 *
 * It is a ROUTE rather than a sheet because the shoutout notification needs
 * somewhere to point: a push that opens the feed and makes you hunt for the
 * post is a worse notification than no notification. `PageHeader`'s
 * history-aware back handles arriving cold from a push, where there is no
 * in-app history to go back to.
 */
export function LoungePostDetail() {
  const { postId = '' } = useParams()
  const { spaceAccess } = useStudentData()
  const { toast } = useToast()

  const [post, setPost] = useState<LoungePost | null>(null)
  const [replies, setReplies] = useState<LoungeReply[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [gone, setGone] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [deletePost, setDeletePost] = useState<LoungePost | null>(null)
  const [deleteReply, setDeleteReply] = useState<LoungeReply | null>(null)
  const [busy, setBusy] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const canPost = canPostNow(spaceAccess)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const p = await getLoungePost(postId)
      if (!p) {
        setGone(true)
        return
      }
      setPost(p)
      setReplies(await getLoungeReplies(postId))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    void load()
  }, [load])

  // Same auto-grow as the main composer. Reset to `auto` first or the box can
  // only ever get taller.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [body])

  async function send() {
    const text = body.trim()
    if (!text || sending || text.length > MAX_POST_LENGTH) return
    setSending(true)
    try {
      await replyToPost(postId, text)
      setBody('')
      // Refetch rather than appending: `can_delete` is computed per viewer by
      // the RPC and is not something the client can invent.
      setReplies(await getLoungeReplies(postId))
      setPost(await getLoungePost(postId))
    } catch (e) {
      // The text is deliberately NOT cleared — a failed send must not eat it.
      toast(errorText(e, 'Could not reply.'), 'error')
    } finally {
      setSending(false)
    }
  }

  async function toggleW(p: LoungePost) {
    try {
      const res = await giveW(p.id)
      setPost((cur) => (cur ? { ...cur, wCount: res.wCount, iGaveW: res.iGaveW } : cur))
    } catch (e) {
      toast(errorText(e, 'Could not do that.'), 'error')
    }
  }

  async function confirmDeletePost() {
    if (!deletePost) return
    setBusy(true)
    try {
      await deleteLoungePost(deletePost.id)
      setDeletePost(null)
      setGone(true)
    } catch (e) {
      toast(errorText(e, 'Could not delete that.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteReply() {
    if (!deleteReply) return
    setBusy(true)
    try {
      await deleteLoungeReply(deleteReply.id)
      setReplies((rs) => rs.filter((r) => r.id !== deleteReply.id))
      setPost((cur) => (cur ? { ...cur, replyCount: Math.max(0, cur.replyCount - 1) } : cur))
      setDeleteReply(null)
    } catch (e) {
      toast(errorText(e, 'Could not delete that.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const over = body.length > MAX_POST_LENGTH

  return (
    <div className="space-y-4">
      <PageHeader title="Post" fallback="/app/space/lounge" />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : gone ? (
        <EmptyState description="It may have been deleted.">This post is gone.</EmptyState>
      ) : failed || !post ? (
        <ErrorState onRetry={() => void load()}>Could not load this post.</ErrorState>
      ) : (
        <>
          <PostCard post={post} detail onToggleW={toggleW} onDelete={setDeletePost} wDisabled={!canPost} />

          {canPost && (
            <Card pad="roomy">
              <textarea
                ref={areaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={2}
                placeholder="Reply…"
                // text-base: below 16px iOS Safari zooms on focus and never
                // zooms back.
                className={cn(
                  'w-full resize-none overflow-y-auto rounded-xl border bg-card px-3.5 py-2.5 text-base text-ink',
                  'placeholder:text-muted/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30',
                  over ? 'border-danger' : 'border-line',
                )}
              />
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-2xs',
                    over ? 'font-semibold text-danger' : 'text-muted',
                  )}
                >
                  {body.length > MAX_POST_LENGTH - 100 || over
                    ? `${body.length}/${MAX_POST_LENGTH}`
                    : 'Replies are not rate-limited.'}
                </span>
                <Button
                  size="sm"
                  className="shrink-0"
                  loading={sending}
                  disabled={body.trim().length === 0 || over || sending}
                  onClick={() => void send()}
                >
                  Reply
                </Button>
              </div>
            </Card>
          )}

          {replies.length === 0 ? (
            <EmptyState>No replies yet.</EmptyState>
          ) : (
            <div className="space-y-2">
              {replies.map((r) => (
                <Card key={r.id} pad="default">
                  <div className="flex items-start gap-3">
                    <Avatar
                      name={r.displayName}
                      url={r.avatarUrl}
                      className="h-8 w-8"
                      textClassName="text-2xs"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold">
                          {r.displayName}
                        </span>
                        <span className="shrink-0 text-2xs text-muted">
                          {timeAgo(r.createdAt)}
                        </span>
                        {r.canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleteReply(r)}
                            className="ml-auto shrink-0 text-2xs font-semibold text-muted transition-colors hover:text-danger"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      {r.hiddenAt && r.body === null ? (
                        <p className="mt-1 text-sm font-medium text-danger">Hidden — reported</p>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
                          {r.body}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deletePost}
        title="Delete this post?"
        message="It disappears for everyone, along with its replies."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void confirmDeletePost()}
        onClose={() => setDeletePost(null)}
      />

      <ConfirmDialog
        open={!!deleteReply}
        title="Delete this reply?"
        message="It disappears for everyone."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void confirmDeleteReply()}
        onClose={() => setDeleteReply(null)}
      />
    </div>
  )
}
