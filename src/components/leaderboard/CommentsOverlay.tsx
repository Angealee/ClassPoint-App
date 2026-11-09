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
import { flightDurationMs, laneHoldMs, pickLane } from '@/lib/danmaku'
import {
  MAX_COMMENT_LENGTH,
  MAX_COMMENTS_PER_DAY,
  type LeaderboardComment,
} from '@/lib/types'

/**
 * Keep the page header and the bottom tab bar clear of floating comments.
 *
 * These used to pick each lane's Y position; they are now the TRACK's own top
 * and bottom, which is a stronger guarantee. A pill travelling vertically
 * crosses every Y it passes, so "stay off the chrome" cannot be expressed as a
 * starting position — it has to be the boundary of the thing the pill moves
 * inside.
 */
const TOP_INSET = 76
const BOTTOM_INSET = 104
/** Mounted-but-unlaunched pills waiting for a lane. Beyond this we drop the
 *  oldest rather than mounting an unbounded number of invisible nodes. */
const MAX_PENDING = 24

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
  /**
   * Null until the pill has been MEASURED.
   *
   * The previous version estimated width as `96 + chars * 6.6` and reserved a
   * lane from that guess. The guess was the whole anti-overlap guarantee, and
   * it could not account for wrapping, the width cap, emoji, or a long display
   * name — so the reservation was either too long (throttling the stream to a
   * few comments a minute) or too short (pills overlapping).
   *
   * Now a pill mounts parked off the right edge, is measured at its real
   * rendered size, and only then gets a lane and a duration.
   */
  lane: number | null
  durationMs: number | null
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
 * Floating comments over the leaderboard, plus the composer and the moderation
 * list. One global stream — every comment appears on every board view.
 *
 * ── A RISING COLUMN, NOT A HORIZONTAL STREAM (the instructor's call, 2026-11-08)
 * Pills used to fly right-to-left across up to five lanes spanning the whole
 * screen, which meant the podium, the scope picker and the rank rows all sat
 * behind moving text. They now rise up a single narrow column on the left,
 * centred to the app's own reading column so they stay beside the board on a
 * wide screen. One strip is covered instead of the whole board, and a comment
 * can be three lines tall without threatening anything.
 *
 * Each pill is a CSS keyframe transform (`.cp-rise` in index.css), removed
 * from state on animationend. The column is scheduled so two pills never
 * converge — see lib/danmaku, where that property is asserted rather than
 * eyeballed. Anything that would collide waits, parked and invisible, until
 * the column frees.
 *
 * ⚠ This doc described a STICKY BAND above the board for a long time after
 *   that stopped being true — it had already become a full-screen overlay. A
 *   comment describing intent reads exactly like one describing fact, so if
 *   the geometry changes again, change these words with it.
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

  /**
   * One column, so one lane. Kept as an array because `pickLane` is the single
   * scheduling rule and takes one — see the note in lib/danmaku.
   */
  const laneFreeAtRef = useRef<number[]>([0])
  const seenRef = useRef<Set<string>>(new Set())
  /** The track a pill rises up. Its HEIGHT is the distance travelled. */
  const trackRef = useRef<HTMLDivElement>(null)
  /** Live nodes, so a pill can be measured at its real rendered size. */
  const pillRefs = useRef<Record<string, HTMLDivElement | null>>({})

  /**
   * Measure every parked pill and launch it once the column is free.
   *
   * A pill mounts with `lane: null`, parked just below the track and not
   * animating, so the browser lays it out at its true width and height. Only
   * then is it given a duration. That is the whole difference from the version
   * before last, which guessed the size before the pill existed.
   *
   * ⚠ `offsetHeight` NOW, WHERE IT USED TO BE `offsetWidth`. The arithmetic in
   *   lib/danmaku is about a distance and a size on whichever axis the pill
   *   moves; feeding it the width while the pill rises would hold the column
   *   for the wrong duration and let a tall comment be overtaken.
   */
  const assign = useCallback(() => {
    if (reduced) return
    // The track is positioned against both edges of a fixed full-screen deck,
    // so its height is definite. The fallback only matters for the first tick
    // before layout.
    const trackH =
      trackRef.current?.clientHeight ||
      Math.max(120, (window.innerHeight || 720) - TOP_INSET - BOTTOM_INSET)
    const now = Date.now()
    const free = laneFreeAtRef.current

    setFlying((prev) => {
      let changed = false
      const next = prev.map((p) => {
        if (p.lane !== null) return p
        const el = pillRefs.current[p.key]
        if (!el) return p // not mounted yet — next tick

        // The timing rules live in lib/danmaku, where the no-overlap property
        // is actually asserted rather than eyeballed on a moving screen.
        const lane = pickLane(free, now)
        if (lane === null) return p // column still busy — keep waiting

        const pillH = el.offsetHeight
        free[lane] = now + laneHoldMs(pillH)
        changed = true
        return { ...p, lane, durationMs: flightDurationMs(trackH, pillH) }
      })
      return changed ? next : prev
    })
  }, [reduced])

  // One light interval drives both measuring and launching.
  //
  // Gated on there being something parked: it used to run for the life of the
  // screen whether or not a pill was waiting, which is a timer firing five
  // times a second behind an idle leaderboard.
  const waiting = flying.some((p) => p.lane === null)
  useEffect(() => {
    if (reduced || !waiting) return
    const t = setInterval(assign, 200)
    return () => clearInterval(t)
  }, [assign, reduced, waiting])

  const enqueue = useCallback(
    (c: LeaderboardComment) => {
      if (seenRef.current.has(c.id)) return
      seenRef.current.add(c.id)
      setRecent((r) => [c, ...r].slice(0, 40))
      if (reduced) return
      setFlying((f) => {
        const pending = f.filter((p) => p.lane === null).length
        // Drop the oldest waiting pill rather than mounting without bound.
        const trimmed = pending >= MAX_PENDING ? f.slice(1) : f
        return [
          ...trimmed,
          { ...c, key: `${c.id}-${Date.now()}`, lane: null, durationMs: null },
        ]
      })
    },
    [reduced],
  )

  // Seed from the last day. With several lanes the stream actually drains, so
  // more of the fetched comments get to fly than the old six.
  useEffect(() => {
    let cancelled = false
    listLeaderboardComments(20)
      .then((list) => {
        if (cancelled) return
        setRecent(list)
        for (const c of list) seenRef.current.add(c.id)
        if (!reduced) {
          // Oldest-first so they fly in chronological order.
          const seed = list.slice(0, 14).reverse()
          const now = Date.now()
          setFlying(
            seed.map((c, i) => ({
              ...c,
              key: `${c.id}-${now}-${i}`,
              lane: null,
              durationMs: null,
            })),
          )
        }
      })
      .catch(() => {
        /* non-fatal — the board still works without banter */
      })
    return () => {
      cancelled = true
    }
  }, [reduced])

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
      {/* The flight deck: a FULL-SCREEN overlay, so comments float in front of
          the whole board rather than in a strip above it.

          `pointer-events-none` on the deck is load-bearing — without it this
          layer would swallow every tap on the board, the section picker and the
          tab bar underneath. Only a tappable pill re-enables pointer events,
          and only on itself.

          Lanes stop short of the header and the tab bar (TOP_INSET /
          BOTTOM_INSET) so comments never cover the app's own chrome. */}
      {!reduced && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
        >
          {/* Centred to the app's own reading column, so on a wide screen the
              comments rise beside the board rather than against the far left
              edge of a 1900px window. On a phone this is the full width and the
              track sits in the normal 16px gutter. */}
          <div className="relative mx-auto h-full w-full max-w-2xl">
            <div
              ref={trackRef}
              // ⚠ `container-type: size`, NOT `inline-size`. The keyframe
              //   travels `-100cqh`, and `inline-size` establishes a query
              //   container on the INLINE axis only — so `cqh` skips this
              //   track and falls back to the small VIEWPORT. Measured: a
              //   206px track takes a pill -244px correctly and -849px under
              //   `inline-size`. The pill does not stop, it goes four times too
              //   far in the duration computed from the track's height, which
              //   voids the no-overlap guarantee in lib/danmaku while looking
              //   merely fast. `size` is legal here precisely because the track
              //   is pinned to both edges of a fixed deck and therefore has a
              //   definite height.
              className="absolute left-4 w-[min(78%,20rem)]"
              style={{ top: TOP_INSET, bottom: BOTTOM_INSET, containerType: 'size' }}
            >
              {flying.map((p) => {
                const tappable = p.studentId !== null && !!onOpenProfile
                const launched = p.lane !== null
                return (
                  <div
                    key={p.key}
                    ref={(el) => {
                      pillRefs.current[p.key] = el
                    }}
                    // Parked below the track until measured. `opacity-0` rather
                    // than `hidden` or unmounted: the pill has to be LAID OUT
                    // to be measured, and a parked pill sits in the tab-bar
                    // zone where it would otherwise be visible and static.
                    className={cn('absolute left-0 w-max max-w-full', launched ? 'cp-rise' : 'opacity-0')}
                    style={
                      {
                        top: '100%',
                        ...(launched ? { '--cp-rise-dur': `${p.durationMs}ms` } : null),
                      } as React.CSSProperties
                    }
                    onAnimationEnd={() => {
                      delete pillRefs.current[p.key]
                      setFlying((f) => f.filter((x) => x.key !== p.key))
                    }}
                  >
                    <span
                      className={cn(
                        'flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm shadow-lg',
                        p.studentId === null
                          ? 'border-accent-solid/50 bg-accent-solid/25 text-accent'
                          : 'border-line bg-card/92 text-ink',
                        tappable && 'pointer-events-auto cursor-pointer',
                      )}
                      onClick={tappable ? () => onOpenProfile!(p) : undefined}
                    >
                      {p.studentId === null ? (
                        <span className="mt-0.5 shrink-0 text-2xs font-bold uppercase tracking-wide">
                          Instructor
                        </span>
                      ) : (
                        <Avatar
                          name={p.displayName}
                          url={p.avatarUrl}
                          className="mt-0.5 h-5 w-5 shrink-0 text-2xs"
                        />
                      )}
                      {/* Wraps to three lines rather than truncating. A comment
                          you cannot finish reading is worse than a taller pill —
                          and in a column a taller pill costs nothing, where in
                          the old horizontal lanes it risked the lane below. */}
                      <span className="line-clamp-3 min-w-0 [overflow-wrap:anywhere]">
                        <span className="font-semibold">{p.displayName}</span>{' '}
                        <span className="text-muted">{p.body}</span>
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
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
            // `maxLength` as well as the slice. The slice is what actually
            // enforces it (a paste can exceed maxLength in some engines), but
            // without the attribute the field silently swallows keystrokes at
            // the limit with no explanation — which is what the counter below
            // now provides.
            maxLength={MAX_COMMENT_LENGTH}
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
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
          />
          <Button
            className="shrink-0"
            onClick={() => void send()}
            disabled={!canSend}
            loading={sending}
          >
            Send
          </Button>
        </div>

        <div className="flex items-baseline justify-between gap-2 px-1 text-xs">
          <p className="min-w-0 text-muted">
            {isInstructor
              ? 'Posts as Instructor. Tap any comment to delete it.'
              : `${left} of ${MAX_COMMENTS_PER_DAY} left today · comments disappear after 24 hours.`}
          </p>
          {/* The limit has always been 120 — in types.ts, in the table's CHECK
              and in the RPC. What was missing was any way to SEE it: the field
              simply stopped accepting characters. Appears once there is
              something to count, and warns over the last 20 so you find out
              before you are cut off rather than after. */}
          {draft.length > 0 && (
            <span
              className={cn(
                'shrink-0 tabular-nums',
                draft.length >= MAX_COMMENT_LENGTH - 20 ? 'font-semibold text-warn' : 'text-muted',
              )}
            >
              {draft.length}/{MAX_COMMENT_LENGTH}
            </span>
          )}
        </div>
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
