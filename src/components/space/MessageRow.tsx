import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { getLevelProgress } from '@/lib/leveling'
import { sectionColor } from '@/lib/sectionColor'
import { parseInline, parseMessageBody } from '@/lib/message-body'
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
 * Left-aligned for EVERYONE (the user's call), so wide content — ASCII art,
 * emoji walls — keeps the full column instead of the ~78% a right-aligned
 * layout leaves.
 *
 * THERE ARE NO BUBBLES. Messages sit on the plain canvas. A bubble had to be
 * painted on every single line, which turned a run of three into three grey
 * slabs and a busy room into a wall of boxes — that was the "cluttered"
 * complaint, and removing the fill is the fix that a lighter fill was not.
 * What survives is MARKS on a flat surface, and each one means something:
 *
 *   2px accent bar   this one is yours
 *   2px gold bar     the instructor
 *   blue tint        you were @mentioned
 *   red tint         hidden by moderation
 *   card fill        the row you are hovering or holding
 *
 * The avatar sits beside the LAST message of a run — YOURS INCLUDED. Hiding
 * your own made the room read as something happening to other people. The name
 * header shows on the first of every run for the same reason: your rank medal
 * and section dot are part of the fun, and there is no reason you should be the
 * one person who never sees their own.
 *
 * Individual timestamps are gone; the room prints a centred divider on a gap.
 * Actions live in a floating toolbar on hover / long-press, so they cost the
 * message no vertical space.
 */

const LONG_PRESS_MS = 420
const MOVE_CANCEL_PX = 8
/**
 * Two taps inside this window are one double-tap.
 *
 * Comfortably under LONG_PRESS_MS, so the two gestures cannot both fire: a
 * finger held still for 420ms opens the toolbar, two quick taps send a 🔥.
 */
const DOUBLE_TAP_MS = 320
/** The reaction a double-tap sends. Instagram's heart, spent on this app's W. */
const DOUBLE_TAP_CODE: ReactionCode = 'fire'

/**
 * Top-three rank, as a TINTED NUMBER rather than a 🥇.
 *
 * Two reasons the medal emoji lost: UI chrome in this app uses icons, not emoji
 * (the user's standing call), and at `text-2xs` a colour-emoji medal beside its
 * own rank number rendered as an unreadable smudge followed by a redundant "1".
 * The number IS the rank, and the colour is the medal.
 */
const MEDAL: Record<number, string> = {
  1: 'text-reward',
  2: 'text-muted',
  3: 'text-warn',
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
      <Avatar name={name} url={url} className="h-7 w-7" textClassName="text-2xs" />
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

/** Words, links and @mentions inside one plain-text run. */
function Inline({ text, names }: { text: string; names: readonly string[] }) {
  return (
    <>
      {parseInline(text, names).map((t, i) =>
        t.kind === 'link' ? (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            // stopPropagation, or opening a link also counts as a tap toward
            // the double-tap reaction.
            onClick={(e) => e.stopPropagation()}
            // `overflow-wrap:anywhere`, not `break-all`: a long URL still has to
            // break rather than push the page sideways, but a short one is not
            // chopped mid-word for no reason. Accent because Era 6.0 Phase 10
            // already put inline links on the accent role.
            className="font-medium text-accent underline decoration-accent/40 underline-offset-2 [overflow-wrap:anywhere]"
          >
            {t.content}
          </a>
        ) : t.kind === 'mention' ? (
          <span
            key={i}
            className="rounded bg-info-solid/15 px-0.5 font-semibold text-info"
          >
            {t.content}
          </span>
        ) : (
          <span key={i}>{t.content}</span>
        ),
      )}
    </>
  )
}

/**
 * Copy-to-clipboard, with the confirmation ON the button.
 *
 * A toast would be the app's usual answer, but this fires from inside a message
 * row and the point of copying a code block is that you are about to paste it —
 * a banner at the other end of the screen is the wrong place to look.
 */
function useCopy() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1400)
    return () => window.clearTimeout(t)
  }, [done])
  const copy = (text: string) => {
    // `clipboard` is undefined on an insecure origin; failing silently is right
    // here, because the alternative is an error toast for a convenience.
    void navigator.clipboard?.writeText(text).then(
      () => setDone(true),
      () => {},
    )
  }
  return { done, copy }
}

function CodeBlock({ content }: { content: string }) {
  const { done, copy } = useCopy()
  return (
    <div className="group/code relative my-1">
      {/* Its OWN horizontal scroll: art keeps its shape instead of rewrapping
          into noise, and it still cannot push the page sideways. */}
      <pre className="overflow-x-auto rounded-lg border border-line bg-card px-2.5 py-2 pr-12 font-mono text-xs leading-tight text-ink">
        {content}
      </pre>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          copy(content)
        }}
        aria-label={done ? 'Copied' : 'Copy code'}
        // Always visible on touch (where there is no hover to reveal it) and on
        // focus; the mouse gets it on hover so a quiet room stays quiet.
        className={cn(
          'absolute right-1.5 top-1.5 rounded-lg border border-line bg-card-2 px-2 py-1 text-2xs font-semibold transition-opacity',
          'opacity-100 md:opacity-0 md:group-hover/code:opacity-100 md:focus-visible:opacity-100',
          done ? 'text-success' : 'text-muted hover:text-ink',
        )}
      >
        {done ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Body({ body, names }: { body: string; names: readonly string[] }) {
  const parts = parseMessageBody(body)
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'mono' ? (
          <CodeBlock key={i} content={p.content} />
        ) : (
          <span key={i} className="whitespace-pre-wrap break-words">
            <Inline text={p.content} names={names} />
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
  mentionNames = [],
  onReact,
  onReply,
  onDelete,
  onReport,
  onJumpToParent,
  onOpenPerson,
  onPin,
  pinned,
  canReact,
}: {
  message: SpaceMessage
  /** Game facts for the author, from the room's one roster fetch. */
  person?: SpacePerson
  /** Where this sits in a run — drives the name header and the avatar. */
  runPosition: 'only' | 'first' | 'middle' | 'last'
  mine?: boolean
  isInstructor?: boolean
  /** Only the Global room, where several sections mix. */
  showSectionDot?: boolean
  /**
   * Everyone in this room, for styling `@Name` in the body. Names ONLY — a bare
   * `@word` is never styled, so "@everyone" cannot pretend to be a person.
   */
  mentionNames?: readonly string[]
  onReact: (m: SpaceMessage, code: ReactionCode) => void
  onReply: (m: SpaceMessage) => void
  onDelete: (m: SpaceMessage) => void
  onReport?: (m: SpaceMessage) => void
  onJumpToParent?: (id: string) => void
  onOpenPerson?: (m: SpaceMessage) => void
  /** Instructor only — the toolbar hides this entirely for everyone else. */
  onPin?: (m: SpaceMessage, pinned: boolean) => void
  pinned?: boolean
  canReact: boolean
}) {
  const [held, setHeld] = useState(false)
  const { done: copied, copy } = useCopy()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [burst, setBurst] = useState(0)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const lastTapRef = useRef(0)

  const removed = message.deletedAt !== null
  const hidden = !removed && message.hiddenAt !== null && message.body === null
  const tallies = REACTION_ORDER.filter((c) => (message.reactions[c] ?? 0) > 0)

  const startsRun = runPosition === 'first' || runPosition === 'only'
  const endsRun = runPosition === 'last' || runPosition === 'only'
  const medal = person?.rank != null && person.rank <= 3 ? MEDAL[person.rank] : null

  useEffect(() => {
    if (!held && !pickerOpen) return
    const close = () => {
      setHeld(false)
      setPickerOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [held, pickerOpen])

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
    timerRef.current = window.setTimeout(() => setHeld(true), LONG_PRESS_MS)
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = startRef.current
    if (!s) return
    // Without this, a scroll opens the toolbar of every message it passes.
    if (Math.abs(e.clientX - s.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - s.y) > MOVE_CANCEL_PX) {
      clearTimer()
    }
  }

  /**
   * Double-tap to react — the one gesture in the room with no chrome at all.
   *
   * Counted from `click` rather than `dblclick` so a phone and a mouse take the
   * same path, and guarded against clicks that were meant for something else:
   * a link, the reply quote, or a reaction pill inside the message.
   */
  function onBodyClick(e: React.MouseEvent) {
    if (!canReact || removed || hidden) return
    if ((e.target as HTMLElement).closest('a,button')) return
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      setBurst((n) => n + 1)
      onReact(message, DOUBLE_TAP_CODE)
    } else {
      lastTapRef.current = now
    }
  }

  // The burst is decoration; it must never outlive the message.
  useEffect(() => {
    if (burst === 0) return
    const t = window.setTimeout(() => setBurst(0), 700)
    return () => window.clearTimeout(t)
  }, [burst])

  const actionsVisible = held || pickerOpen

  return (
    <div
      id={`msg-${message.id}`}
      className={cn('group relative flex items-end gap-2', startsRun ? 'mt-2' : 'mt-0.5')}
    >
      {/* Avatar gutter. Reserved on every row so text stays in one column, and
          DRAWN on the last message of every run — yours included. Hiding your
          own avatar made the room feel like it was happening to someone else. */}
      <div className="w-7 shrink-0">
        {endsRun && (
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
        {startsRun && (
          <div className="mb-0.5 flex items-center gap-1.5 pl-3">
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
            {/* The XP ring around the avatar shows PROGRESS through the level;
                this reads out WHICH. Deliberately MUTED rather than the reward
                gold levels wear elsewhere: at rank 1 the medal is also gold, and
                two gold chips side by side blurred into one. The medal is the
                rarer fact, so it keeps the colour. */}
            {person && (
              <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
                Lv {getLevelProgress(person.semesterPoints).level}
              </span>
            )}
            {medal && (
              <span
                className={cn('shrink-0 text-2xs font-bold tabular-nums', medal)}
                title={`Rank ${person?.rank} on the leaderboard`}
              >
                #{person?.rank}
              </span>
            )}
            {isInstructor && (
              <span className="shrink-0 rounded-full bg-gold-400/15 px-1.5 text-2xs font-bold uppercase tracking-wide text-reward">
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
          onClick={onBodyClick}
          // Or a double-click selects a word under the burst.
          onDoubleClick={(e) => e.preventDefault()}
          className={cn(
            // NO BUBBLE. Messages sit on the plain canvas — the user's call, and
            // it is what lets a run read as one block of talk instead of a stack
            // of grey slabs. Everything below is a MARK on that flat surface,
            // never a fill: the only things that paint are the ones that mean
            // something (yours, a mention, hidden, and the row you are touching).
            'relative rounded-xl px-3 py-1 text-sm transition-colors',
            // A mention is INFO ("this is addressed to you"), deliberately NOT
            // accent: accent is already the bar down your OWN run, so an accent
            // tint here made someone else's message read as one of yours — and
            // a red wash reads as an error besides.
            message.mentionsMe && !mine && 'bg-info-solid/10',
            hidden && 'bg-danger-solid/8',
            // The row you are pointing at is the one surface that lights up, so
            // the floating toolbar has something to belong to.
            actionsVisible ? 'bg-card' : 'group-hover:bg-card/60',
          )}
        >
          {/* The identity rule.
              It is a positioned SPAN, not a `border-l` on this box: a border
              follows the box's own `rounded-xl`, so each message in a run bowed
              inward at both ends and three consecutive messages rendered as
              three parentheses. This draws one straight 2px rule that BLEEDS
              into the 2px gap below (`-bottom-0.5`) unless it is the last of the
              run, so a run of five reads as a single unbroken line. */}
          {(mine || isInstructor) && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-0 top-0 w-0.5',
                endsRun ? 'bottom-0 rounded-b-full' : '-bottom-0.5',
                startsRun && 'rounded-t-full',
                mine ? 'bg-accent-solid' : 'bg-gold-400',
              )}
            />
          )}

          {/* The double-tap's only feedback. `MotionConfig reducedMotion="user"`
              in App.tsx neutralises it for anyone who asked for less motion, so
              it needs no guard of its own. */}
          <AnimatePresence>
            {burst > 0 && (
              <motion.span
                key={burst}
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.4, y: 0 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1.1, 1], y: -18 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="pointer-events-none absolute right-4 top-0 z-10 select-none text-base"
              >
                {CHAT_REACTIONS[DOUBLE_TAP_CODE]}
              </motion.span>
            )}
          </AnimatePresence>

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
            <Body body={message.body ?? ''} names={mentionNames} />
          )}

          {tallies.length > 0 && !removed && (
            // The old -mb pulled these up over the bubble's bottom edge. With no
            // bubble there is no edge to hide behind, and the overlap would put
            // a pill on top of the next message.
            <div className="mt-1 flex flex-wrap items-center gap-1">
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
                      'flex items-center gap-0.5 rounded-full border border-line px-1.5 py-0.5 text-2xs font-semibold shadow-sm',
                      isMine ? 'bg-accent-solid/15 text-accent' : 'bg-card text-muted',
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
                  setHeld(false)
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
                  setHeld(false)
                }}
                aria-label="Reply"
                className="rounded-full px-2 py-0.5 text-2xs font-semibold text-muted transition-colors hover:bg-card-2 hover:text-ink"
              >
                Reply
              </button>
              {message.body && (
                <button
                  type="button"
                  onClick={() => {
                    copy(message.body ?? '')
                    setHeld(false)
                  }}
                  aria-label={copied ? 'Copied' : 'Copy message'}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-2xs font-semibold transition-colors hover:bg-card-2',
                    copied ? 'text-success' : 'text-muted hover:text-ink',
                  )}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
              {onPin && (
                <button
                  type="button"
                  onClick={() => {
                    onPin(message, !pinned)
                    setHeld(false)
                  }}
                  aria-label={pinned ? 'Unpin' : 'Pin'}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-2xs font-semibold transition-colors hover:bg-card-2',
                    pinned ? 'text-reward' : 'text-muted hover:text-ink',
                  )}
                >
                  {pinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {message.canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(message)
                    setHeld(false)
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
                      setHeld(false)
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
