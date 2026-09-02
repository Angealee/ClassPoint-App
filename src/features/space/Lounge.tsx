import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { useToast } from '@/components/ui/Toast'
import { BetaBanner } from '@/components/space/BetaBanner'
import { PostCard } from '@/components/space/PostCard'
import { EventCard } from '@/components/space/EventCard'
import { ReportSheet } from '@/components/space/ReportSheet'
import { PostComposer, type ClassmateOption } from '@/components/space/PostComposer'
import { AstronautArt } from '@/components/space/AstronautArt'
import { useStudentData } from '@/features/student/StudentData'
import {
  deleteLoungePost,
  getLoungeFeed,
  getLoungePinned,
  getLoungeQuota,
  getOpenEvent,
  giveW,
  listSpacePeople,
  postShoutout,
  postToLounge,
  type FeedCursor,
  type FeedMode,
} from '@/lib/api'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { errorText } from '@/lib/errors'
import { canPostNow } from '@/lib/space-gate'
import type { LoungeEvent, LoungePost, LoungeQuota } from '@/lib/types'

const PAGE = 20

/**
 * `/app/space/lounge` — the feed.
 *
 * ── HOW NEW POSTS ARRIVE ───────────────────────────────────────────────────
 * They do NOT get spliced in under your thumb. A realtime INSERT only bumps a
 * counter, which surfaces as a "3 new posts" pill; the list itself changes
 * exactly when you ask it to, by tapping the pill or pulling to refresh. That
 * is the whole reason the subscription does not touch `posts` — content
 * shifting mid-read is how you tap the wrong post's W button.
 *
 * The subscription is PAGE-SCOPED via `uniqueChannel` and removed on unmount;
 * the durable `student-self-*` channel is untouched.
 */
export function Lounge() {
  const { me, spaceAccess, sections } = useStudentData()
  const { toast } = useToast()

  const [mode, setMode] = useState<FeedMode>('latest')
  const [posts, setPosts] = useState<LoungePost[]>([])
  const [pinned, setPinned] = useState<LoungePost[]>([])
  const [quota, setQuota] = useState<LoungeQuota | null>(null)
  const [event, setEvent] = useState<LoungeEvent | null>(null)
  const [classmates, setClassmates] = useState<ClassmateOption[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [posting, setPosting] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [pendingNew, setPendingNew] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<LoungePost | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [reportTarget, setReportTarget] = useState<LoungePost | null>(null)

  const canPost = canPostNow(spaceAccess)

  const load = useCallback(
    async (which: FeedMode) => {
      setFailed(false)
      try {
        const [feed, pins, q, ev] = await Promise.all([
          getLoungeFeed(which, { limit: PAGE }),
          which === 'latest' ? getLoungePinned() : Promise.resolve([]),
          getLoungeQuota(),
          getOpenEvent(),
        ])
        setPosts(feed)
        setPinned(pins)
        setQuota(q)
        setEvent(ev)
        setExhausted(feed.length < PAGE)
        setPendingNew(0)
      } catch {
        setFailed(true)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    setLoading(true)
    void load(mode)
  }, [mode, load])

  // The roster for the shoutout picker — the student's own section, minus
  // themselves. Loaded off the critical path: the feed must render without it.
  useEffect(() => {
    if (!me?.section_id) return
    let cancelled = false
    void listSpacePeople()
      .then((rows) => {
        if (cancelled) return
        // You cannot shout yourself out; the RPC includes you because chat
        // needs your own badges.
        setClassmates(rows.filter((r) => r.id !== me?.id))
      })
      .catch(() => {
        /* the picker just stays empty */
      })
    return () => {
      cancelled = true
    }
  }, [me?.section_id, me?.id])

  // Page-scoped realtime. INSERT only bumps the pill; UPDATE patches a card in
  // place (a W or a reply count), which cannot move anything.
  const seenRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const channel = uniqueChannel('lounge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lounge_posts' },
        (payload) => {
          const row = payload.new as { id?: string; author_student_id?: string | null }
          if (!row?.id || seenRef.current.has(row.id)) return
          seenRef.current.add(row.id)
          // Your own post is already on screen — announcing it back would read
          // as someone else having posted.
          if (row.author_student_id && row.author_student_id === me?.id) return
          setPendingNew((n) => n + 1)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lounge_posts' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null
          if (!row?.id) return
          const id = row.id as string
          const patch = (list: LoungePost[]) =>
            list.map((p) =>
              p.id === id
                ? {
                    ...p,
                    // Only the counters are trusted from the payload. `i_gave_w`
                    // and `can_delete` are computed PER VIEWER by the RPC and do
                    // not exist on the raw row — spreading it blind would wipe
                    // them, the same trap StudentData documents for
                    // lifetime_points.
                    wCount: (row.w_count as number) ?? p.wCount,
                    replyCount: (row.reply_count as number) ?? p.replyCount,
                    hiddenAt: (row.hidden_at as string | null) ?? null,
                    pinnedAt: (row.pinned_at as string | null) ?? null,
                  }
                : p,
            )
          setPosts(patch)
          setPinned(patch)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [me?.id])

  async function refresh() {
    await load(mode)
  }

  async function loadMore() {
    const last = posts[posts.length - 1]
    if (!last || loadingMore || exhausted) return
    setLoadingMore(true)
    try {
      const cursor: FeedCursor = { createdAt: last.createdAt, id: last.id }
      const more = await getLoungeFeed(mode, { limit: PAGE, before: cursor })
      setPosts((p) => [...p, ...more])
      if (more.length < PAGE) setExhausted(true)
    } catch (e) {
      toast(errorText(e, 'Could not load more.'), 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  async function submitPost(body: string): Promise<boolean> {
    setPosting(true)
    try {
      await postToLounge(body)
      // No optimistic insert — refetching keeps `i_gave_w` and `can_delete`
      // authoritative, and the post is at the top anyway.
      await load(mode)
      return true
    } catch (e) {
      toast(errorText(e, 'Could not post that.'), 'error')
      return false
    } finally {
      setPosting(false)
    }
  }

  async function submitShoutout(targetId: string, body: string): Promise<boolean> {
    setPosting(true)
    try {
      await postShoutout(targetId, body)
      await load(mode)
      toast('Shoutout sent.', 'success')
      return true
    } catch (e) {
      toast(errorText(e, 'Could not send that shoutout.'), 'error')
      return false
    } finally {
      setPosting(false)
    }
  }

  async function toggleW(post: LoungePost) {
    try {
      const res = await giveW(post.id)
      const patch = (list: LoungePost[]) =>
        list.map((p) => (p.id === post.id ? { ...p, wCount: res.wCount, iGaveW: res.iGaveW } : p))
      setPosts(patch)
      setPinned(patch)
      setQuota((q) => (q ? { ...q, wsLeft: res.wsLeft } : q))
    } catch (e) {
      toast(errorText(e, 'Could not do that.'), 'error')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteLoungePost(deleteTarget.id)
      setPosts((p) => p.filter((x) => x.id !== deleteTarget.id))
      setPinned((p) => p.filter((x) => x.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e) {
      toast(errorText(e, 'Could not delete that.'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const sectionName = useMemo(
    () => sections.find((s) => s.id === me?.section_id)?.name ?? null,
    [sections, me?.section_id],
  )

  const wDisabled = !canPost || (quota?.wsLeft ?? 0) === 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student Lounge"
        subtitle={sectionName ? `Everyone in the beta · ${sectionName}` : 'Everyone in the beta'}
        fallback="/app/space"
      />

      <BetaBanner />

      {canPost ? (
        <PostComposer
          quota={quota}
          classmates={classmates}
          busy={posting}
          onPost={submitPost}
          onShoutout={submitShoutout}
        />
      ) : (
        <p className="rounded-xl border border-warn-solid/30 bg-warn-solid/8 px-3 py-2 text-sm text-warn">
          You&apos;re muted right now — you can still read everything.
        </p>
      )}

      {event && (
        <EventCard
          event={event}
          canAnswer={canPost}
          onAnswered={() => void getOpenEvent().then(setEvent).catch(() => {})}
        />
      )}

      <SegmentedControl
        label="Feed view"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'latest', label: 'Latest' },
          { value: 'trending', label: 'Trending' },
        ]}
      />

      {/* The pill. Nothing above it moves until this is tapped. */}
      {pendingNew > 0 && (
        <button
          type="button"
          onClick={() => void refresh()}
          className="w-full rounded-full bg-accent-solid/10 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-solid/15"
        >
          {pendingNew} new post{pendingNew === 1 ? '' : 's'} — tap to load
        </button>
      )}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : failed ? (
        <ErrorState onRetry={() => void load(mode)}>Could not load the Lounge.</ErrorState>
      ) : (
        <PullToRefresh onRefresh={refresh}>
          <div className="space-y-3">
            {pinned.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                wDisabled={wDisabled}
                onToggleW={toggleW}
                onDelete={setDeleteTarget}
                onReport={p.canDelete ? undefined : setReportTarget}
              />
            ))}

            {posts.length === 0 && pinned.length === 0 ? (
              <EmptyState
                icon={<AstronautArt variant="lounge" size="md" />}
                description={
                  mode === 'trending'
                    ? 'A post needs at least one W to show up here.'
                    : undefined
                }
              >
                {mode === 'trending' ? 'Nothing trending this week.' : 'Nobody has posted yet.'}
              </EmptyState>
            ) : (
              posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  wDisabled={wDisabled}
                  onToggleW={toggleW}
                  onDelete={setDeleteTarget}
                  onReport={p.canDelete ? undefined : setReportTarget}
                />
              ))
            )}

            {mode === 'latest' && posts.length > 0 && !exhausted && (
              <Button
                variant="outline"
                className="w-full"
                loading={loadingMore}
                onClick={() => void loadMore()}
              >
                Load older
              </Button>
            )}
          </div>
        </PullToRefresh>
      )}

      <ReportSheet
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType="post"
        targetId={reportTarget?.id ?? null}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this post?"
        message="It disappears for everyone."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
