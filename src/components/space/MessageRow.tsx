import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { getLevelProgress } from '@/lib/leveling'
import { sectionColor } from '@/lib/sectionColor'
import { parseMessageBody } from '@/lib/message-body'
import {
  CHAT_REACTIONS,
  REACTION_ORDER,
  type ReactionCode,
  type SpaceMessage,
  type SpacePerson,
} from '@/lib/types'

/**
 * One message — Instagram's structure at Discord's density.
 *
 * ── WHAT CHANGED, AND WHY ──────────────────────────────────────────────────
 * Left-aligned bubbles for EVERYONE (the user's call), so wide content — ASCII
 * art, emoji walls — keeps the full column instead of the ~78% a right-aligned
 * layout leaves. Ownership is a 2px accent bar down the side of the run, not a
 * background wash: the wash tinted every line in a run separately, so three
 * consecutive messages read as three disconnected grey blocks. That was the
 * "cluttered" complaint, and merging the run into ONE shape is the fix.
 *
 * Corners merge across a run (first rounds its top, last its bottom), the
 * avatar sits beside the LAST message of an incoming run rather than the first,
 * and individual timestamps are gone — the room prints a centred time divider
 * on a gap instead. All three are Instagram's arrangement.
 *
 * Actions live in a floating toolbar on hover / long-press, so they cost the
 * message no vertical space.
 */

const LONG_PRESS_MS = 420
const MOVE_CANCEL_PX = 8

/** Gold, silver, bronze — matching the podium's ramp, flattened to one colour. */
const MEDAL: Record<number, { glyph: string; className: string }> = {
  1: { glyph: '🥇', className: 'text-gold-400' },
  2: { glyph: '🥈', className: 'text-muted' },
  3: { glyph: '🥉', className: 'text-warn' },
}

/**
 * The avatar with an XP ring — the same idea as the podium's, at 28px.
 *
 * Drawn as an SVG ring rather than a conic gradient so it renders identically
 * in both themes and needs no mask. `pathLength={100}` lets the dash array be
 * the percentage directly, instead of computing a circumference.
 */
function RingAvatar({ person, name, url }: { person?: SpacePerson; name: string; url: string | null }) {
  const pct = person ? getLevelProgress(person.semesterPoints).progressPct : 0
  return (
    <span className="relative block h-7 w-7">
      <Avatar name={name} url={url} className="h-7 w-7" textClassName="text-[9px]" />
      {person && (
        <svg
          viewBox="0 0 32 32"
          className="pointer-events-none absolute -inset-[3px] h-[34px] w-[34px] -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="16"
            cy="16"
            r="15"
            fill="none"
            stroke="var(--color-reward-solid)"
            strokeOpacity="0.9"
            strokeWidth="2"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.max(pct, 2)} 100`}
          />
        </svg>
      )}
    </span>
  )
}

function Body({ body }: { body: string }) {
  const parts = parseMessageBody(body)
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'mono' ? (
          // Its OWN horizontal scroll: art keeps its shape instead of
          // rewrapping into noise, and it still cannot push the page sideways.
          <pre
            key={i}
            className="my-1 overflow-x-auto rounded-lg bg-canvas/70 px-2.5 py-2 font-mono text-[11px] leading-tight text-ink"
          >
            {p.content}
          </pre>
        ) : (
          <span key={i} className="whitespace-pre-wrap break-words">
            {p.content}
          </span>
        ),
      )}
    </>
  )
}

export function MessageRow({
  message,
  person,
  runPosition,
  mine,
  isInstructor,
  showSectionDot,
  onReact,
  onReply,
  onDelete,
  onReport,
  onJumpToParent,
  onOpenPerson,
  canReact,
}: {
  message: SpaceMessage
  /** Game facts for the author, from the room's one roster fetch. */
  person?: SpacePerson
  /** Where this sits in a run of consecutive messages — drives the corners. */
  runPosition: 'only' | 'first' | 'middle' | 'last'
  mine?: boolean
  isInstructor?: boolean
  /** Only the Global room, where several sections mix. */
  showSectionDot?: boolean
  onReact: (m: SpaceMessage, code: ReactionCode) => void
  onReply: (m: SpaceMessage) => void
  onDelete: (m: SpaceMessage) => void
  onReport?: (m: SpaceMessage) => void
  onJumpToParent?: (id: string) => void
  onOpenPerson?: (m: SpaceMessage) => void
  canReact: boolean
}) {
  const [pinned, setPinned] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)

  const removed = message.deletedAt !== null
  const hidden = !removed && message.hiddenAt !== null && message.body === null
  const tallies = REACTION_ORDER.filter((c) => (message.reactions[c] ?? 0) > 0)

  const startsRun = runPosition === 'first' || runPosition === 'only'
  const endsRun = runPosition === 'last' || runPosition === 'only'
  const medal = person?.rank && person.rank <= 3 ? MEDAL[person.rank] : null

  useEffect(() => {
    if (!pinned && !pickerOpen) return
    const close = () => {
      setPinned(false)
      setPickerOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [pinned, pickerOpen])

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
  useEffect(() => clearTimer, [])

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') return // mouse gets hover
    startRef.current = { x: e.clientX, y: e.clientY }
    clearTimer()
    timerRef.current = window.setTimeout(() => setPinned(true), LONG_PRESS_MS)
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = startRef.current
    if (!s) return
    // Without this, a scroll opens the toolbar of every message it passes.
    if (Math.abs(e.clientX - s.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - s.y) > MOVE_CANCEL_PX) {
      clearTimer()
    }
  }

  const actionsVisible = pinned || pickerOpen

  return (
    <div
      id={`msg-${message.id}`}
      className={cn('group relative flex items-end gap-2', startsRun ? 'mt-2' : 'mt-0.5')}
    >
      {/* Avatar gutter. Reserved on every row so the bubbles stay in one
          column, but only DRAWN on the last of an incoming run. */}
      <div className="w-7 shrink-0">
        {!mine && endsRun && (
          <button
            type="button"
            onClick={() => onOpenPerson?.(message)}
            aria-label={`${message.displayName} — options`}
            className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <RingAvatar person={person} name={message.displayName} url={message.avatarUrl} />
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {startsRun && !mine && (
          <div className="mb-0.5 flex items-center gap-1.5 pl-1">
            {/* Both theme values ride as CSS variables rather than reading the
                theme once in JS, so the dot follows a theme switch — the same
                arrangement PodiumBoard uses for the identical dot. */}
            {showSectionDot && person?.sectionId && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dot)] dark:bg-[var(--dot-dark)]"
                style={
                  {
                    '--dot': sectionColor(person.sectionId, false),
                    '--dot-dark': sectionColor(person.sectionId, true),
                  } as CSSProperties
                }
              />
            )}
            <span className="min-w-0 truncate text-2xs font-semibold text-muted">
              {message.displayName}
            </span>
            {medal && (
              <span className={cn('shrink-0 text-2xs', medal.className)} title={`#${person?.rank}`}>
                {medal.glyph}
                {person?.rank}
              </span>
            )}
            {isInstructor && (
              <span className="shrink-0 rounded-full bg-gold-400/15 px-1.5 text-[9px] font-bold uppercase tracking-wide text-reward">
                Instructor
              </span>
            )}
          </div>
        )}

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={clearTimer}
          onPointerCancel={clearTimer}
          className={cn(
            'relative px-3 py-1.5 text-sm',
            // Merged corners: one shape per run.
            'rounded-2xl',
            !startsRun && 'rounded-tl-md',
            !endsRun && 'rounded-bl-md',
            mine
              ? // A BAR, not a wash. The wash tinted each line separately, so a
                // run read as disconnected blocks.
                'border-l-2 border-accent-solid bg-card pl-2.5'
              : 'bg-card',
            isInstructor && !mine && 'ring-1 ring-gold-400/25',
            message.mentionsMe && 'bg-accent-solid/10',
            hidden && 'bg-danger-solid/8',
            actionsVisible && 'bg-card-2',
          )}
        >
          {message.replyToId && (
            <button
              type="button"
              onClick={() => message.replyToId && onJumpToParent?.(message.replyToId)}
              className="mb-1 flex w-full min-w-0 items-center gap-1.5 border-l-2 border-line pl-2 text-left text-2xs text-muted transition-colors hover:border-accent-solid hover:text-ink"
            >
              <span className="shrink-0 font-semibold">{message.replyToName ?? 'Someone'}</span>
              <span className="min-w-0 truncate">
                {message.replyToExcerpt ?? 'message removed'}
              </span>
            </button>
          )}

          {removed ? (
            <span className="text-sm italic text-muted">Message removed</span>
          ) : hidden ? (
            <span className="text-sm font-medium text-danger">Hidden — reported</span>
          ) : (
            <Body body={message.body ?? ''} />
          )}

          {tallies.length > 0 && !removed && (
            // Overlaps the bubble's bottom edge, so a reaction costs almost no
            // extra height — the Instagram/Messenger arrangement.
            <div className="-mb-2.5 mt-1 flex flex-wrap items-center gap-1">
              {tallies.map((code) => {
                const isMine = message.myReactions.includes(code)
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={!canReact}
                    onClick={() => onReact(message, code)}
                    aria-label={`${CHAT_REACTIONS[code]} ${message.reactions[code]}`}
                    aria-pressed={isMine}
                    className={cn(
                      'flex items-center gap-0.5 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-semibold shadow-sm',
                      isMine ? 'bg-accent-solid/15 text-accent' : 'bg-canvas text-muted',
                      !canReact && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <span aria-hidden="true">{CHAT_REACTIONS[code]}</span>
                    <span className="tabular-nums">{message.reactions[code]}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {!removed && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'absolute -top-2 right-2 z-10 flex items-center gap-0.5 rounded-full border border-line bg-card px-1 py-0.5 shadow-sm transition-opacity',
            actionsVisible
              ? 'opacity-100'
              : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
          )}
        >
          {pickerOpen ? (
            REACTION_ORDER.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onReact(message, code)
                  setPickerOpen(false)
                  setPinned(false)
                }}
                aria-label={`React ${code}`}
                className="rounded-full px-1 text-sm transition-transform hover:scale-125"
              >
                <span aria-hidden="true">{CHAT_REACTIONS[code]}</span>
              </button>
            ))
          ) : (
            <>
              {canReact && (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  aria-label="React"
                  className="rounded-full px-1.5 py-0.5 text-xs transition-colors hover:bg-card-2"
                >
                  <span aria-hidden="true">😊</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onReply(message)
                  setPinned(false)
                }}
                aria-label="Reply"
                className="rounded-full px-2 py-0.5 text-2xs font-semibold text-muted transition-colors hover:bg-card-2 hover:text-ink"
              >
                Reply
              </button>
              {message.canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(message)
                    setPinned(false)
                  }}
                  aria-label="Delete"
                  className="rounded-full px-2 py-0.5 text-2xs font-semibold text-muted transition-colors hover:bg-card-2 hover:text-danger"
                >
                  Delete
                </button>
              ) : (
                onReport && (
                  <button
                    type="button"
                    onClick={() => {
                      onReport(message)
                      setPinned(false)
                    }}
                    aria-label="Report"
                    className="rounded-full px-2 py-0.5 text-2xs font-semibold text-muted transition-colors hover:bg-card-2 hover:text-danger"
                  >
                    Report
                  </button>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
