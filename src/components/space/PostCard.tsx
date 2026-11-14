import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { IconButton } from '@/components/ui/IconButton'
import { Sheet } from '@/components/ui/Sheet'
import { MoreIcon, TrashIcon, WarningIcon } from '@/components/ui/icons'
import { WButton } from './WButton'
import { ClassPointButton } from '@/components/identity/ClassPointMark'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { LoungePost } from '@/lib/types'

function ReplyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  )
}

/**
 * One Lounge post as a social card: who + when on top, the body at reading
 * size, and ONE action bar (W · replies · see who · ⋯). Report and Delete live
 * behind ⋯ so the bar never carries a red word at rest.
 *
 * Three looks, one component: a normal post, a shoutout (gold ribbon naming who
 * it is for), and a class update (`pulse`, posted by ClassPoint) — a slim system
 * row, because it is news about the class, not someone talking.
 */
export function PostCard({
  post,
  onToggleW,
  onDelete,
  onReport,
  onShowWs,
  wDisabled,
  detail = false,
}: {
  post: LoungePost
  onToggleW: (post: LoungePost) => void
  onDelete?: (post: LoungePost) => void
  onReport?: (post: LoungePost) => void
  /** Open the "who gave a W" list. */
  onShowWs?: (post: LoungePost) => void
  wDisabled?: boolean
  detail?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const hidden = post.hiddenAt !== null && post.body === null
  const isPulse = post.kind === 'pulse'
  const isShoutout = post.kind === 'shoutout'

  const foldable = !detail && !hidden && (post.body?.length ?? 0) > 280
  const body = foldable && !expanded ? `${post.body!.slice(0, 260).trimEnd()}…` : post.body

  const canReport = !!onReport && !isPulse
  const canDelete = post.canDelete && !!onDelete
  const hasMenu = canReport || canDelete

  const replyLabel =
    post.replyCount === 0
      ? 'Reply'
      : `${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}`

  const actions = (
    <div className="flex items-center gap-1">
      <WButton
        count={post.wCount}
        given={post.iGaveW}
        disabled={wDisabled}
        onToggle={() => onToggleW(post)}
      />
      {post.wCount > 0 && onShowWs && (
        <button
          type="button"
          onClick={() => onShowWs(post)}
          className="cp-tap-y rounded-full px-2 py-1 text-xs font-semibold text-muted transition-colors hover:text-ink"
        >
          See who
        </button>
      )}
      {!detail && (
        <Link
          to={`/app/space/post/${post.id}`}
          className="cp-tap-y flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-muted transition-colors hover:text-ink"
        >
          <ReplyIcon className="h-4 w-4" />
          {replyLabel}
        </Link>
      )}
      {hasMenu && (
        <IconButton
          size="sm"
          label="More actions"
          className="ml-auto"
          onClick={() => setMenuOpen(true)}
          icon={<MoreIcon className="h-4.5 w-4.5" />}
        />
      )}
    </div>
  )

  const menu = hasMenu && (
    <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Post">
      <div className="-mx-1 divide-y divide-line">
        {canReport && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              onReport?.(post)
            }}
            className="flex h-14 w-full items-center gap-3 px-1 text-left text-sm font-medium"
          >
            <WarningIcon className="h-5 w-5 text-muted" />
            Report this post
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              onDelete?.(post)
            }}
            className="flex h-14 w-full items-center gap-3 px-1 text-left text-sm font-medium text-danger"
          >
            <TrashIcon className="h-5 w-5" />
            Delete post
          </button>
        )}
      </div>
    </Sheet>
  )

  // ── Class update: slim, system-styled ─────────────────────────────────────
  if (isPulse) {
    return (
      <>
        <Card pad="none" className="border-info-solid/25 bg-info-solid/5">
          <div className="flex items-start gap-3 px-4 pb-2 pt-3">
            <span className="mt-0.5 shrink-0">
              <ClassPointButton className="h-6 w-6" />
            </span>
            <span className="mt-0.5 shrink-0">
              <Chip tone="info" size="sm">
                {post.pulseKind === 'podium'
                  ? 'New #1'
                  : post.pulseKind === 'event'
                    ? 'Event'
                    : `Level ${post.pulseValue ?? ''}`.trim()}
              </Chip>
            </span>
            <p className="min-w-0 flex-1 break-words text-sm text-ink">{body}</p>
            <span className="shrink-0 text-2xs text-muted">{timeAgo(post.createdAt)}</span>
          </div>
          <div className="px-3 pb-2">{actions}</div>
        </Card>
        {menu}
      </>
    )
  }

  return (
    <>
      <Card
        pad="none"
        className={cn(
          'overflow-hidden',
          post.pinnedAt && 'border-accent-solid/30',
          isShoutout && 'border-reward-solid/35',
          hidden && 'border-danger-solid/25 bg-danger-solid/5',
        )}
      >
        {isShoutout && post.targetDisplayName && (
          <div className="flex items-center gap-2 bg-reward-solid/10 px-4 py-1.5 text-xs">
            <span className="font-semibold text-reward">Shoutout</span>
            <span className="text-muted">for</span>
            <Avatar
              name={post.targetDisplayName}
              url={post.targetAvatarUrl}
              className="h-5 w-5"
              textClassName="text-2xs"
            />
            <span className="min-w-0 truncate font-semibold text-ink">
              {post.targetDisplayName}
            </span>
          </div>
        )}

        <div className="px-4 pt-3.5">
          <div className="flex items-center gap-3">
            <Avatar
              name={post.displayName}
              url={post.avatarUrl}
              className="h-10 w-10 shrink-0"
              textClassName="text-xs"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{post.displayName}</p>
              <p className="text-2xs text-muted">{timeAgo(post.createdAt)}</p>
            </div>
            {post.pinnedAt && (
              <Chip tone="accent" size="sm">
                Pinned
              </Chip>
            )}
          </div>

          {hidden ? (
            <p className="mt-3 text-sm font-medium text-danger">Hidden, reported</p>
          ) : (
            <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-ink">
              {body}
            </p>
          )}

          {foldable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="cp-tap-y mt-1 text-xs font-semibold text-accent"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        <div className="mt-3 border-t border-line px-3 py-1.5">{actions}</div>
      </Card>
      {menu}
    </>
  )
}
