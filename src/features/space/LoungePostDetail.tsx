import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StickyBar } from '@/components/ui/StickyBar'
import { SpaceGlow } from '@/components/space/SpaceGlow'
import { useToast } from '@/components/ui/Toast'
import { PostCard } from '@/components/space/PostCard'
import { ReportSheet } from '@/components/space/ReportSheet'
import { PostWsSheet } from '@/components/space/PostWsSheet'
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
  const [reportTarget, setReportTarget] = useState<LoungePost | null>(null)
  const [wsPostId, setWsPostId] = useState<string | null>(null)
  // The comment the composer is answering, and which threads are unfolded.
  const [replyingTo, setReplyingTo] = useState<LoungeReply | null>(null)
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set())
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
      await replyToPost(postId, text, replyingTo?.id)
      if (replyingTo) {
        // Unfold the thread the answer landed in so it is not lost off-screen.
        const root = replyingTo.parentReplyId ?? replyingTo.id
        setOpenThreads((cur) => new Set(cur).add(root))
      }
      setReplyingTo(null)
      setBody('')
      setReplies(await getLoungeReplies(postId))
      setPost(await getLoungePost(postId))
    } catch (e) {
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
      // A thread root takes its answers with it (0068), so count them all.
      const gone = replies.filter(
        (r) => r.id === deleteReply.id || r.parentReplyId === deleteReply.id,
      ).length
      setReplies((rs) =>
        rs.filter((r) => r.id !== deleteReply.id && r.parentReplyId !== deleteReply.id),
      )
      setPost((cur) =>
        cur ? { ...cur, replyCount: Math.max(0, cur.replyCount - Math.max(1, gone)) } : cur,
      )
      setDeleteReply(null)
    } catch (e) {
      toast(errorText(e, 'Could not delete that.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const over = body.length > MAX_POST_LENGTH

  // One level of threading: roots in time order, each with its answers beneath.
  const roots = replies.filter((r) => !r.parentReplyId)
  const answersOf = (rootId: string) => replies.filter((r) => r.parentReplyId === rootId)

  function startReply(r: LoungeReply) {
    setReplyingTo(r)
    areaRef.current?.focus()
    areaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function renderReply(r: LoungeReply, root: LoungeReply, nested: boolean) {
    // Inside a thread, say whose comment this answers when it is not the root's.
    const showWho = nested && r.replyToName && r.replyToId !== root.id
    return (
      <div key={r.id} className="flex items-start gap-3">
        <Avatar
          name={r.displayName}
          url={r.avatarUrl}
          className={nested ? 'h-7 w-7' : 'h-9 w-9'}
          textClassName="text-2xs"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{r.displayName}</span>
            <span className="shrink-0 text-2xs text-muted">{timeAgo(r.createdAt)}</span>
          </div>
          {r.hiddenAt && r.body === null ? (
            <p className="mt-1 text-sm font-medium text-danger">Hidden, reported</p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
              {showWho && <span className="font-semibold text-accent">@{r.replyToName} </span>}
              {r.body}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-4">
            {canPost && !(r.hiddenAt && r.body === null) && (
              <button
                type="button"
                onClick={() => startReply(r)}
                className="cp-tap-y text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                Reply
              </button>
            )}
            {r.canDelete && (
              <button
                type="button"
                onClick={() => setDeleteReply(r)}
                className="cp-tap-y text-xs font-semibold text-muted transition-colors hover:text-danger"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative space-y-4">
      <SpaceGlow />
      <PageHeader title="Post" fallback="/app/space/lounge" />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : gone ? (
        <EmptyState description="It may have been deleted.">This post is gone.</EmptyState>
      ) : failed || !post ? (
        <ErrorState onRetry={() => void load()}>Could not load this post.</ErrorState>
      ) : (
        <>
          <PostCard
            post={post}
            detail
            onToggleW={toggleW}
            onDelete={setDeletePost}
            onReport={post.canDelete ? undefined : setReportTarget}
            onShowWs={(p) => setWsPostId(p.id)}
            wDisabled={!canPost}
          />

          <h2 className="px-1 pt-1 text-sm font-semibold">
            Replies{replies.length > 0 ? ` (${replies.length})` : ''}
          </h2>

          {replies.length === 0 ? (
            <EmptyState compact>No replies yet. Start the conversation.</EmptyState>
          ) : (
            <div className="space-y-5 px-1">
              {roots.map((r) => {
                const answers = answersOf(r.id)
                const open = openThreads.has(r.id)
                return (
                  <div key={r.id}>
                    {renderReply(r, r, false)}
                    {answers.length > 0 && (
                      <div className="ml-11 mt-1">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setOpenThreads((cur) => {
                              const next = new Set(cur)
                              if (next.has(r.id)) next.delete(r.id)
                              else next.add(r.id)
                              return next
                            })
                          }
                          className="cp-tap-y text-xs font-semibold text-accent"
                        >
                          {open
                            ? 'Hide replies'
                            : `View ${answers.length} ${answers.length === 1 ? 'reply' : 'replies'}`}
                        </button>
                        {open && (
                          <div className="mt-1 space-y-3 border-l border-line pl-3">
                            {answers.map((a) => renderReply(a, r, true))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {canPost && (
            <StickyBar className="-mx-1">
              <div className="rounded-2xl border border-line bg-card p-2 shadow-lg shadow-black/20">
                {replyingTo && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-card-2 px-3 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate text-muted">
                      Replying to{' '}
                      <span className="font-semibold text-ink">{replyingTo.displayName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="cp-tap-y shrink-0 font-semibold text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    aria-label="Reply"
                    ref={areaRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        void send()
                      }
                    }}
                    rows={1}
                    placeholder={replyingTo ? `Reply to ${replyingTo.displayName}…` : 'Add a reply…'}
                    className={cn(
                      'min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border bg-canvas px-3.5 py-2.5 text-base text-ink',
                      'placeholder:text-muted/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30',
                      over ? 'border-danger' : 'border-line',
                    )}
                  />
                  <Button
                    className="shrink-0"
                    loading={sending}
                    disabled={body.trim().length === 0 || over || sending}
                    onClick={() => void send()}
                  >
                    Send
                  </Button>
                </div>
                {(body.length > MAX_POST_LENGTH - 100 || over) && (
                  <p
                    className={cn(
                      'mt-1 px-1 text-2xs',
                      over ? 'font-semibold text-danger' : 'text-muted',
                    )}
                  >
                    {body.length}/{MAX_POST_LENGTH}
                  </p>
                )}
              </div>
            </StickyBar>
          )}
        </>
      )}

      <PostWsSheet postId={wsPostId} onClose={() => setWsPostId(null)} />

      <ReportSheet
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType="post"
        targetId={reportTarget?.id ?? null}
      />

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
