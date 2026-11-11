import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { WButton } from './WButton'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { LoungePost } from '@/lib/types'

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
  detail = false,
}: {
  post: LoungePost
  onToggleW: (post: LoungePost) => void
  onDelete?: (post: LoungePost) => void
  onReport?: (post: LoungePost) => void
  wDisabled?: boolean
  detail?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hidden = post.hiddenAt !== null && post.body === null
  const isPulse = post.kind === 'pulse'

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
                  textClassName="text-2xs"
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
            <WButton
              count={post.wCount}
              given={post.iGaveW}
              disabled={wDisabled}
              onToggle={() => onToggleW(post)}
            />

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
