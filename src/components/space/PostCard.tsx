import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { WButton } from './WButton'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { LoungePost } from '@/lib/types'

/**
 * One card in the Lounge — text, shoutout or Class Pulse.
 *
 * ONE component for all three kinds rather than three components, on the
 * precedent that cost this codebase real bugs: the points row existed four
 * times and drifted, so the same event rendered in two different colours
 * depending which screen you opened. The kinds differ by a header strip and a
 * tint, never by a second copy of the body, the W button or the timestamp.
 */

/** The line above the body that says what KIND of card this is. */
function KindHeader({ post }: { post: LoungePost }) {
  if (post.kind === 'pulse') {
    return (
      <Chip tone="reward" size="sm">
        {post.pulseKind === 'podium' ? 'New #1' : `Level ${post.pulseValue ?? ''}`.trim()}
      </Chip>
    )
  }
  if (post.kind === 'shoutout') {
    return (
      <Chip tone="success" size="sm">
        Shoutout
      </Chip>
    )
  }
  return null
}

export function PostCard({
  post,
  onToggleW,
  onDelete,
  onReport,
  wDisabled,
  /** Renders the body in full and drops the tap-through — the detail screen. */
  detail = false,
}: {
  post: LoungePost
  onToggleW: (post: LoungePost) => void
  onDelete?: (post: LoungePost) => void
  /** Omitted for your own posts — reporting yourself is not a thing. */
  onReport?: (post: LoungePost) => void
  wDisabled?: boolean
  detail?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hidden = post.hiddenAt !== null && post.body === null
  const isPulse = post.kind === 'pulse'

  // Long posts fold rather than pushing everything below them off screen. The
  // threshold is characters, not lines: line count depends on the viewport and
  // would fold inconsistently between a phone and the desktop sidebar layout.
  const foldable = !detail && !hidden && (post.body?.length ?? 0) > 280
  const body = foldable && !expanded ? `${post.body!.slice(0, 260).trimEnd()}…` : post.body

  return (
    <Card
      pad="roomy"
      className={cn(
        post.pinnedAt && 'border-accent-solid/30',
        isPulse && 'bg-card-2',
        hidden && 'border-danger-solid/25 bg-danger-solid/5',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar
          name={post.displayName}
          url={post.avatarUrl}
          className="h-9 w-9"
          textClassName="text-2xs"
        />

        <div className="min-w-0 flex-1">
          {/* Identity line. `min-w-0 truncate` on the name is what stops a long
              display name pushing the timestamp out of the card. */}
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{post.displayName}</span>
            <span className="shrink-0 text-2xs text-muted">{timeAgo(post.createdAt)}</span>
            {post.pinnedAt && (
              <Chip tone="accent" size="sm">
                Pinned
              </Chip>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <KindHeader post={post} />
            {post.kind === 'shoutout' && post.targetDisplayName && (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                <span className="shrink-0">→</span>
                <Avatar
                  name={post.targetDisplayName}
                  url={post.targetAvatarUrl}
                  className="h-4 w-4"
                  textClassName="text-[8px]"
                />
                <span className="min-w-0 truncate font-medium text-ink">
                  {post.targetDisplayName}
                </span>
              </span>
            )}
          </div>

          {hidden ? (
            <p className="mt-2 text-sm font-medium text-danger">Hidden — reported</p>
          ) : (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{body}</p>
          )}

          {foldable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-semibold text-accent"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}

          <div className="mt-3 flex items-center gap-3">
            {/* Pulse cards ARE W-able — a level-up is exactly the thing you
                want to applaud. The RPC still refuses your own post, which for
                a pulse means the student it is about. */}
            <WButton
              count={post.wCount}
              given={post.iGaveW}
              disabled={wDisabled}
              onToggle={() => onToggleW(post)}
            />

            {/* Replies are a COUNT that navigates (the user's call) — the feed
                stays scannable and every card is the same height. */}
            {detail ? null : (
              <Link
                to={`/app/space/post/${post.id}`}
                className="text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                {post.replyCount === 0
                  ? 'Reply'
                  : `${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}`}
              </Link>
            )}

            <span className="ml-auto flex items-center gap-3">
              {onReport && !isPulse && (
                <button
                  type="button"
                  onClick={() => onReport(post)}
                  className="text-xs font-semibold text-muted transition-colors hover:text-danger"
                >
                  Report
                </button>
              )}
              {post.canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(post)}
                  className="text-xs font-semibold text-muted transition-colors hover:text-danger"
                >
                  Delete
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
