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

const LONG_PRESS_MS = 420
const MOVE_CANCEL_PX = 8
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_CODE: ReactionCode = 'fire'

const MEDAL: Record<number, string> = {
  1: 'text-reward',
  2: 'text-muted',
  3: 'text-warn',
}

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
            onClick={(e) => e.stopPropagation()}
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

function useCopy() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1400)
    return () => window.clearTimeout(t)
  }, [done])
  const copy = (text: string) => {
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
  runPosition: 'only' | 'first' | 'middle' | 'last'
  mine?: boolean
  isInstructor?: boolean
  /** Only the Global room, where several sections mix. */
  showSectionDot?: boolean
  mentionNames?: readonly string[]
  onReact: (m: SpaceMessage, code: ReactionCode) => void
  onReply: (m: SpaceMessage) => void
  onDelete: (m: SpaceMessage) => void
  onReport?: (m: SpaceMessage) => void
  onJumpToParent?: (id: string) => void
  onOpenPerson?: (m: SpaceMessage) => void
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
    if (Math.abs(e.clientX - s.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - s.y) > MOVE_CANCEL_PX) {
      clearTimer()
    }
  }

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
            'relative rounded-xl px-3 py-1 text-sm transition-colors',
            message.mentionsMe && !mine && 'bg-info-solid/10',
            hidden && 'bg-danger-solid/8',
            actionsVisible ? 'bg-card' : 'group-hover:bg-card/60',
          )}
        >
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
