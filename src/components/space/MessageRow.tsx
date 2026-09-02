import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import {
  CHAT_REACTIONS,
  REACTION_ORDER,
  type ReactionCode,
  type SpaceMessage,
} from '@/lib/types'

/**
 * One message.
 *
 * GROUPED: consecutive messages from the same person within five minutes drop
 * the avatar and name and indent to line up, which roughly halves the height of
 * a real back-and-forth. `grouped` is decided by the room, not here, because it
 * depends on the message BEFORE this one.
 */

function timeOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function MessageRow({
  message,
  grouped,
  onReact,
  onReply,
  onDelete,
  canReact,
}: {
  message: SpaceMessage
  grouped: boolean
  onReact: (m: SpaceMessage, code: ReactionCode) => void
  onReply: (m: SpaceMessage) => void
  onDelete: (m: SpaceMessage) => void
  canReact: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const removed = message.deletedAt !== null
  const hidden = !removed && message.hiddenAt !== null && message.body === null
  const tallies = REACTION_ORDER.filter((c) => (message.reactions[c] ?? 0) > 0)

  return (
    <div
      className={cn(
        'group flex gap-2.5 px-1',
        grouped ? 'mt-0.5' : 'mt-3',
        // A message that names you is tinted, so it can be found by scrolling
        // rather than by reading.
        message.mentionsMe && 'rounded-lg bg-accent-solid/8 py-1',
      )}
    >
      {/* The avatar column keeps its width when grouped, so the text stays in
          one vertical line instead of jumping left on every second message. */}
      <div className="w-8 shrink-0">
        {!grouped && (
          <Avatar
            name={message.displayName}
            url={message.avatarUrl}
            className="h-8 w-8"
            textClassName="text-2xs"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">
              {message.displayName}
            </span>
            <span className="shrink-0 text-2xs text-muted">{timeOf(message.createdAt)}</span>
          </div>
        )}

        {message.replyToId && (
          <div className="mb-0.5 flex min-w-0 items-center gap-1.5 border-l-2 border-line pl-2 text-2xs text-muted">
            <span className="shrink-0 font-semibold">{message.replyToName ?? 'Someone'}</span>
            <span className="min-w-0 truncate">
              {message.replyToExcerpt ?? 'message removed'}
            </span>
          </div>
        )}

        {removed ? (
          <p className="text-sm italic text-muted">Message removed</p>
        ) : hidden ? (
          <p className="text-sm font-medium text-danger">Hidden — reported</p>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-ink">{message.body}</p>
        )}

        {(tallies.length > 0 || pickerOpen) && !removed && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {tallies.map((code) => {
              const mine = message.myReactions.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  disabled={!canReact}
                  onClick={() => onReact(message, code)}
                  aria-label={`${CHAT_REACTIONS[code]} ${message.reactions[code]}`}
                  aria-pressed={mine}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold transition-colors',
                    mine
                      ? 'bg-accent-solid/15 text-accent ring-1 ring-accent-solid/30'
                      : 'bg-card-2 text-muted hover:text-ink',
                    !canReact && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <span aria-hidden="true">{CHAT_REACTIONS[code]}</span>
                  <span className="tabular-nums">{message.reactions[code]}</span>
                </button>
              )
            })}

            {pickerOpen &&
              REACTION_ORDER.map((code) => (
                <button
                  key={`pick-${code}`}
                  type="button"
                  onClick={() => {
                    onReact(message, code)
                    setPickerOpen(false)
                  }}
                  aria-label={`React ${code}`}
                  className="rounded-full bg-card-2 px-1.5 py-0.5 text-sm transition-colors hover:bg-card"
                >
                  <span aria-hidden="true">{CHAT_REACTIONS[code]}</span>
                </button>
              ))}
          </div>
        )}

        {!removed && (
          <div className="mt-0.5 flex items-center gap-3 text-2xs text-muted">
            {canReact && (
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="font-semibold transition-colors hover:text-ink"
              >
                {pickerOpen ? 'Close' : 'React'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onReply(message)}
              className="font-semibold transition-colors hover:text-ink"
            >
              Reply
            </button>
            {message.canDelete && (
              <button
                type="button"
                onClick={() => onDelete(message)}
                className="font-semibold transition-colors hover:text-danger"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
