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

/** Lanes a pill can fly in. Three reads busy without becoming soup. */
const LANES = 3
/** Minimum gap before re-using a lane, so pills never overlap mid-flight. */
const LANE_GAP_MS = 1800
/** Base flight time; longer comments get more so they stay readable. */
const BASE_MS = 13000
const MS_PER_CHAR = 45

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

  /** Launch anything queued whose lane has freed up. */
  const drain = useCallback(() => {
    if (reduced) return
    const now = Date.now()
    while (queueRef.current.length > 0) {
      // Pick the lane that has been free the longest.
      let lane = 0
      for (let i = 1; i < LANES; i++) {
        if (laneFreeAtRef.current[i] < laneFreeAtRef.current[lane]) lane = i
      }
      if (laneFreeAtRef.current[lane] > now) break // every lane still busy — wait

      const c = queueRef.current.shift()!
      const durationMs = BASE_MS + c.body.length * MS_PER_CHAR
      laneFreeAtRef.current[lane] = now + LANE_GAP_MS
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

  // Seed from the last day, oldest-first so they fly in chronological order.
  useEffect(() => {
    let cancelled = false
    listLeaderboardComments(20)
      .then((list) => {
        if (cancelled) return
        setRecent(list)
        for (const c of list) seenRef.current.add(c.id)
        if (!reduced) {
          queueRef.current.push(...[...list].reverse())
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
      {/* Flying band — a STICKY strip ABOVE the board. It sits in normal flow
          (so it never overlaps the podium/crown) and stays pinned below the app
          header as you scroll the rankings. pointer-events-none so scrolls pass
          through; student pills re-enable taps to open the sender's profile. */}
      {!reduced && (
        <div
          className="pointer-events-none sticky top-[52px] z-10 mb-1 overflow-hidden md:top-2"
          // container-type makes `cqw` in the cp-fly keyframe resolve against
          // this band's width — that's what tells a pill how far to travel.
          style={{ height: LANES * 34 + 8, containerType: 'inline-size' }}
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
                    top: p.lane * 34 + 4,
                    '--cp-fly-dur': `${p.durationMs}ms`,
                  } as React.CSSProperties
                }
                onAnimationEnd={() => setFlying((f) => f.filter((x) => x.key !== p.key))}
              >
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs backdrop-blur-sm',
                    p.studentId === null
                      ? 'border-brand-500/40 bg-brand-500/15 text-brand-600 dark:text-brand-300'
                      : 'border-line bg-card/85 text-ink',
                    tappable && 'pointer-events-auto cursor-pointer',
                  )}
                  onClick={tappable ? () => onOpenProfile!(p) : undefined}
                >
                  {p.studentId === null ? (
                    <span className="text-[0.6rem] font-bold uppercase tracking-wide">
                      Instructor
                    </span>
                  ) : (
                    <Avatar
                      name={p.displayName}
                      url={p.avatarUrl}
                      className="h-4 w-4 text-[0.5rem]"
                    />
                  )}
                  <span className="font-semibold">{p.displayName}</span>
                  <span className="text-muted">{p.body}</span>
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
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="h-10 shrink-0 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {sending ? '…' : 'Send'}
          </button>
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
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[0.5rem] font-bold text-brand-500">
                      IN
                    </span>
                  ) : (
                    <Avatar name={c.displayName} url={c.avatarUrl} className="h-6 w-6 text-[0.6rem]" />
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
                    <p className="text-[0.65rem] text-muted">{timeAgo(c.createdAt)}</p>
                  </button>
                  {(isInstructor || (studentId && c.studentId === studentId)) && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      className="shrink-0 text-[0.65rem] font-semibold text-muted transition-colors hover:text-brand-500"
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
