import { Button } from '@/components/ui/Button'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  countMyCommentsToday,
  deleteLeaderboardComment,
  listLeaderboardComments,
  mapComment,
  postLeaderboardComment,
} from '@/lib/api'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import {
  MAX_COMMENT_LENGTH,
  MAX_COMMENTS_PER_DAY,
  type LeaderboardComment,
} from '@/lib/types'

/**
 * A single-file ticker: one lane, so comments read cleanly one after another
 * and never stack. Height stays slim so the podium sits right at the top.
 */
const LANES = 1
// Tall enough for the whole pill plus breathing room. At 30 the pill was
// physically taller than its lane, so overflow-hidden sliced the top and
// bottom off every comment — the bug that made them look cut in half.
const LANE_HEIGHT = 40
/**
 * CONSTANT speed for every pill (px per second). This is the anti-overlap
 * guarantee: because all pills move at the same speed and enter from the same
 * point, a later pill can never catch an earlier one — the gap between them is
 * fixed at launch. Slow enough (~20–28s per crossing) to read comfortably.
 */
const SPEED_PX_PER_SEC = 30
/** Visible gap kept between one pill's tail and the next pill's nose. */
const MIN_GAP_PX = 52

/** Estimate a pill's rendered width from its text, so timing/gaps are right. */
function estPillWidth(c: LeaderboardComment): number {
  const chars = (c.displayName?.length ?? 0) + (c.body?.length ?? 0)
  return 96 + chars * 6.6 // avatar + padding + ~6.6px per char at text-xs
}

/** Tap-to-fill prompts. A blank box gets far fewer posts than a chip does. */
const QUICK_CHIPS = [
  'GG 🏆',
  'carry me 😭',
  'ez clap',
  'who let bro cook',
  'recitation gods only',
  'attendance carry',
  "I'm coming for #1",
  "let's go!",
  'W class',
]

interface FlyingPill extends LeaderboardComment {
  /** Unique per flight — a comment can be re-launched, keys must not collide. */
  key: string
  lane: number
  durationMs: number
}

function errorText(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m && m.length <= 160 ? m : fallback
}

interface CommentsOverlayProps {
  /** Null for the instructor (who posts as "Instructor" and has no daily cap). */
  studentId?: string | null
  isInstructor?: boolean
  /** Tap a student-authored comment → open that sender's profile. The parent
   *  owns the profile sheet (it already has the leaderboard entries to build
   *  the target), so this just hands back the tapped comment. */
  onOpenProfile?: (comment: LeaderboardComment) => void
  /** The board the comments relate to; rendered below the flying band. */
  children: React.ReactNode
}

/**
 * Flying comments across the top of the leaderboard, plus the composer and the
 * moderation list. One global stream — every comment flies on every board view.
 *
 * The flying band is a STICKY strip above the board (not an absolute overlay on
 * top of it), so it never covers the podium/crown and stays visible as you
 * scroll the rankings. Each pill is a CSS keyframe transform (see `.cp-fly` in
 * index.css), removed from state on animationend. Lanes are scheduled so two
 * pills never share a lane within LANE_GAP_MS; anything that would collide
 * waits in a queue and launches when a lane frees up.
 */
export function CommentsOverlay({
  studentId,
  isInstructor = false,
  onOpenProfile,
  children,
}: CommentsOverlayProps) {
  const { toast } = useToast()
  const [flying, setFlying] = useState<FlyingPill[]>([])
  const [recent, setRecent] = useState<LeaderboardComment[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [usedToday, setUsedToday] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<LeaderboardComment | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Reduced motion → a static ticker instead of animation. Read once: a change
  // mid-session is rare and re-subscribing the channel for it isn't worth it.
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const queueRef = useRef<LeaderboardComment[]>([])
  const laneFreeAtRef = useRef<number[]>(Array(LANES).fill(0))
  const seenRef = useRef<Set<string>>(new Set())
  // The flight deck — measured so pill duration matches the real width and the
  // constant-speed math holds on both phone and desktop.
  const deckRef = useRef<HTMLDivElement>(null)

  /** Launch anything queued whose lane has freed up. */
  const drain = useCallback(() => {
    if (reduced) return
    const now = Date.now()
    const deckW = deckRef.current?.clientWidth || 360
    while (queueRef.current.length > 0) {
      // Single lane, but keep the loop general: pick the lane free longest.
      let lane = 0
      for (let i = 1; i < LANES; i++) {
        if (laneFreeAtRef.current[i] < laneFreeAtRef.current[lane]) lane = i
      }
      if (laneFreeAtRef.current[lane] > now) break // lane still busy — wait

      const c = queueRef.current.shift()!
      const pillW = estPillWidth(c)
      // Distance = deck width + the pill's own width (enters and exits fully
      // off-screen). Constant speed → duration scales with that distance.
      const durationMs = Math.round(((deckW + pillW) / SPEED_PX_PER_SEC) * 1000)
      // Reserve the lane until this pill's tail + gap has cleared the entry
      // point, so the next pill never overlaps it.
      const reserveMs = Math.round(((pillW + MIN_GAP_PX) / SPEED_PX_PER_SEC) * 1000)
      laneFreeAtRef.current[lane] = now + reserveMs
      setFlying((f) => [...f, { ...c, key: `${c.id}-${now}-${lane}`, lane, durationMs }])
    }
  }, [reduced])

  // Drain on a light interval — cheap, and it keeps the queue moving without
  // wiring a timer per pill.
  useEffect(() => {
    if (reduced) return
    const t = setInterval(drain, 400)
    return () => clearInterval(t)
  }, [drain, reduced])

  const enqueue = useCallback(
    (c: LeaderboardComment) => {
      if (seenRef.current.has(c.id)) return
      seenRef.current.add(c.id)
      setRecent((r) => [c, ...r].slice(0, 40))
      queueRef.current.push(c)
      drain()
    },
    [drain],
  )

  // Seed from the last day. The "Recent comments" list shows up to 20, but a
  // single-file ticker would take minutes to drain 20 — so only the newest few
  // actually fly on load; the rest just populate the list.
  useEffect(() => {
    let cancelled = false
    listLeaderboardComments(20)
      .then((list) => {
        if (cancelled) return
        setRecent(list)
        for (const c of list) seenRef.current.add(c.id)
        if (!reduced) {
          // Newest 6, oldest-first so they fly in chronological order.
          queueRef.current.push(...list.slice(0, 6).reverse())
          drain()
        }
      })
      .catch(() => {
        /* non-fatal — the board still works without banter */
      })
    return () => {
      cancelled = true
    }
  }, [drain, reduced])

  useEffect(() => {
    if (!studentId) return
    countMyCommentsToday(studentId).then(setUsedToday).catch(() => {})
  }, [studentId])

  // Page-scoped channel: subscribed on mount, removed on unmount. The durable
  // student-self channel is untouched.
  useEffect(() => {
    const channel = uniqueChannel('leaderboard-comments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leaderboard_comments' },
        (payload) => enqueue(mapComment(payload.new as never)),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'leaderboard_comments' },
        (payload) => {
          // A DELETE payload carries only the primary key — all we need.
          const id = (payload.old as { id?: string })?.id
          if (!id) return
          setFlying((f) => f.filter((p) => p.id !== id))
          setRecent((r) => r.filter((c) => c.id !== id))
          queueRef.current = queueRef.current.filter((c) => c.id !== id)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enqueue])

  const left = Math.max(0, MAX_COMMENTS_PER_DAY - usedToday)
  const canSend = draft.trim().length > 0 && !sending && (isInstructor || left > 0)

  async function send() {
    const body = draft.trim()
    if (!body) return
    setSending(true)
    try {
      await postLeaderboardComment(body)
      setDraft('')
      if (!isInstructor) setUsedToday((n) => n + 1)
      // The realtime INSERT echoes it back and enqueues the pill — no optimistic
      // insert here, or it would fly twice.
    } catch (e) {
      toast(errorText(e, 'Could not post that. Try again.'), 'error')
    } finally {
      setSending(false)
    }
  }

  async function onDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteLeaderboardComment(deleteTarget.id)
      setFlying((f) => f.filter((p) => p.id !== deleteTarget.id))
      setRecent((r) => r.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      toast('Could not delete that comment.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* Slim single-lane ticker directly ABOVE the podium — a thin strip so the
          podium stays right at the top and the crown is never covered. Pills fly
          one at a time (constant speed, never stacking). pointer-events-none so
          scrolls pass through; student pills re-enable taps to open a profile. */}
      {!reduced && (
        <div
          ref={deckRef}
          className="pointer-events-none relative mb-1 overflow-hidden"
          // container-type makes `cqw` in the cp-fly keyframe resolve against
          // this deck's width — that's what tells a pill how far to travel.
          style={{ height: LANES * LANE_HEIGHT, containerType: 'inline-size' }}
        >
          {flying.map((p) => {
            const tappable = p.studentId !== null && !!onOpenProfile
            return (
              <div
                key={p.key}
                // `left` comes from .cp-fly (100% — parked off the right edge).
                className="cp-fly absolute whitespace-nowrap"
                style={
                  {
                    // Centred in the lane rather than pinned 2px from its
                    // top, so the pill cannot ride out of the clip region.
                    top: p.lane * LANE_HEIGHT,
                    height: LANE_HEIGHT,
                    display: "flex",
                    alignItems: "center",
                    '--cp-fly-dur': `${p.durationMs}ms`,
                  } as React.CSSProperties
                }
                onAnimationEnd={() => setFlying((f) => f.filter((x) => x.key !== p.key))}
              >
                <span
                  className={cn(
                    'inline-flex max-w-[85cqw] items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-lg backdrop-blur-md',
                    p.studentId === null
                      ? 'border-accent-solid/50 bg-accent-solid/25 text-accent'
                      : 'border-line bg-card/95 text-ink',
                    tappable && 'pointer-events-auto cursor-pointer',
                  )}
                  onClick={tappable ? () => onOpenProfile!(p) : undefined}
                >
                  {p.studentId === null ? (
                    <span className="text-2xs font-bold uppercase tracking-wide">
                      Instructor
                    </span>
                  ) : (
                    <Avatar
                      name={p.displayName}
                      url={p.avatarUrl}
                      className="h-5 w-5 text-2xs"
                    />
                  )}
                  <span className="shrink-0 font-semibold">{p.displayName}</span>
                  <span className="truncate text-muted">{p.body}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {children}

      {/* Composer */}
      <div className="mt-3 space-y-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setDraft(c)}
              className="shrink-0 rounded-full border border-line bg-card-2 px-3 py-1 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
            onKeyDown={(e) => e.key === 'Enter' && canSend && void send()}
            placeholder={
              isInstructor
                ? 'Say something to the class…'
                : left > 0
                  ? 'Say something…'
                  : 'You’re out of comments for today'
            }
            disabled={!isInstructor && left === 0}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
          />
          <Button
            className="h-10 shrink-0"
            onClick={() => void send()}
            disabled={!canSend}
            loading={sending}
          >
            Send
          </Button>
        </div>

        <p className="px-1 text-xs text-muted">
          {isInstructor
            ? 'Posts as Instructor. Tap any comment to delete it.'
            : `${left} of ${MAX_COMMENTS_PER_DAY} left today · comments disappear after 24 hours.`}
        </p>
      </div>

      {/* The reliable read/moderate surface — pills fly by, this doesn't. */}
      {recent.length > 0 && (
        <details className="mt-3 rounded-xl border border-line bg-card">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-muted">
            Recent comments ({recent.length})
          </summary>
          <div className="max-h-56 divide-y divide-line overflow-y-auto border-t border-line">
            {recent.map((c) => {
              const tappable = c.studentId !== null && !!onOpenProfile
              return (
                <div key={c.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  {c.studentId === null ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-solid/15 text-2xs font-bold text-accent">
                      IN
                    </span>
                  ) : (
                    <Avatar name={c.displayName} url={c.avatarUrl} className="h-6 w-6 text-2xs" />
                  )}
                  {/* Row body opens the sender's profile; Delete stays separate. */}
                  <button
                    type="button"
                    disabled={!tappable}
                    onClick={tappable ? () => onOpenProfile!(c) : undefined}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <p className="truncate text-xs">
                      <span className="font-semibold">{c.displayName}</span>{' '}
                      <span className="text-muted">{c.body}</span>
                    </p>
                    <p className="text-2xs text-muted">{timeAgo(c.createdAt)}</p>
                  </button>
                  {(isInstructor || (studentId && c.studentId === studentId)) && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      className="shrink-0 text-2xs font-semibold text-muted transition-colors hover:text-accent"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this comment?"
        message={
          <>
            “{deleteTarget?.body}” by{' '}
            <span className="font-semibold text-ink">{deleteTarget?.displayName}</span> disappears
            for everyone.
          </>
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={onDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  )
}
