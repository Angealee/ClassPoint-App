import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'

/**
 * Avatar · name · meta line · trailing slot.
 *
 * The most-repeated row in the app — roster, leaderboard, redemptions, excuses,
 * top spenders, profile visitors, archived students. Every one of them rebuilt
 * the same three-part flex with slightly different avatar sizes, truncation and
 * gaps, which is why a long name wraps on one screen and clips on another.
 *
 * ── WHY `trailing` IS A SLOT AND NOT PROPS ─────────────────────────────────
 * The right-hand side genuinely differs everywhere: a points figure, a rank, a
 * status Chip, two IconButtons, a checkbox. Modelling that as `points?` +
 * `rank?` + `status?` + `actions?` produces a component with eight optional
 * props where every screen uses two of them. A slot keeps the shared part
 * (layout, truncation, avatar) shared and leaves the varying part free.
 *
 * `onClick` makes the whole row a button. When it is set, `trailing` is
 * rendered OUTSIDE that button — otherwise the action buttons inside it would
 * be nested in a button, which is invalid HTML and swallows their clicks.
 */
export function PersonRow({
  name,
  avatarUrl,
  meta,
  trailing,
  leading,
  onClick,
  size = 'md',
  className,
}: {
  name: ReactNode
  avatarUrl?: string | null
  /** Second line — section, timestamp, counts. */
  meta?: ReactNode
  /** Right-hand slot: a value, a Chip, action buttons. */
  trailing?: ReactNode
  /** Left of the avatar — a rank number, a checkbox. */
  leading?: ReactNode
  onClick?: () => void
  size?: 'sm' | 'md'
  className?: string
}) {
  const avatarSize = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'

  const body = (
    <>
      <Avatar
        name={typeof name === 'string' ? name : ''}
        url={avatarUrl}
        className={cn('shrink-0', avatarSize)}
      />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
      </span>
    </>
  )

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {leading}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {trailing}
    </div>
  )
}
