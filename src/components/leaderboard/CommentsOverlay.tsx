import { Button } from '@/components/ui/Button'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { InstructorAvatar } from '@/components/identity/InstructorAvatar'
import { instructorName } from '@/lib/instructor-identity'
import { useInstructorProfile } from '@/lib/useInstructorProfile'
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

const TOP_INSET = 76
const BOTTOM_INSET = 104
const MAX_PENDING = 24

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
  key: string
  lane: number | null
  durationMs: number | null
}

function errorText(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m && m.length <= 160 ? m : fallback
}

interface CommentsOverlayProps {
  studentId?: string | null
  isInstructor?: boolean
  onOpenProfile?: (comment: LeaderboardComment) => void
  children: React.ReactNode
}

export function CommentsOverlay({
  studentId,
  isInstructor = false,
  onOpenProfile,
  children,
}: CommentsOverlayProps) {
  const instructorProfile = useInstructorProfile()
  const { toast } = useToast()
  const [flying, setFlying] = useState<FlyingPill[]>([])
  const [recent, setRecent] = useState<LeaderboardComment[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [usedToday, setUsedToday] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<LeaderboardComment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const laneFreeAtRef = useRef<number[]>([0])
  const seenRef = useRef<Set<string>>(new Set())
  const trackRef = useRef<HTMLDivElement>(null)
  const pillRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const assign = useCallback(() => {
    if (reduced) return
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
        const trimmed = pending >= MAX_PENDING ? f.slice(1) : f
        return [
          ...trimmed,
          { ...c, key: `${c.id}-${Date.now()}`, lane: null, durationMs: null },
        ]
      })
    },
    [reduced],
  )

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
      {!reduced && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
        >
          <div className="relative mx-auto h-full w-full max-w-2xl">
            <div
              ref={trackRef}
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
                        <InstructorAvatar interactive={false} className="mt-0.5 h-5 w-5" />
                      ) : (
                        <Avatar
                          name={p.displayName}
                          url={p.avatarUrl}
                          className="mt-0.5 h-5 w-5 shrink-0 text-2xs"
                        />
                      )}
                      <span className="line-clamp-3 min-w-0 [overflow-wrap:anywhere]">
                        <span className="font-semibold">
                          {p.studentId === null ? instructorName(instructorProfile) : p.displayName}
                        </span>{' '}
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
            aria-label="Comment for the leaderboard"
            value={draft}
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
