import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * "There's nothing here yet."
 *
 * Every one of the 23 `p-8` Cards in the app was one of these. They came in two
 * shapes that had drifted apart: a bare `p-8 text-center text-sm text-muted`
 * with a sentence in it, and a `flex flex-col items-center gap-2 p-8
 * text-center` with an icon above the sentence — same idea, two spellings, and
 * nowhere consistent to put an action.
 *
 * The sentence is `children` rather than a `title` prop because that is how the
 * call sites already read, and because most of these sentences interpolate
 * something ("No students in {sectionName} yet"). As a string prop each of
 * those would have needed a fragment wrapper.
 */
export function EmptyState({
  icon,
  children,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  /** The sentence a student actually reads. */
  children: ReactNode
  /** Optional second line — the next step, not a restatement of the first. */
  description?: ReactNode
  /** Usually a <Button>. Rendered below the text. */
  action?: ReactNode
  className?: string
}) {
  return (
    <Card pad="none" className={cn('flex flex-col items-center gap-2 p-8 text-center', className)}>
      {icon && <span className="text-muted [&>svg]:h-7 [&>svg]:w-7">{icon}</span>}
      <p className="text-sm text-muted">{children}</p>
      {description && <p className="max-w-xs text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  )
}

/**
 * "That didn't load." — the sibling of EmptyState, and the one the audit nearly
 * missed: 23 files hand-rolled a retry affordance in at least four shapes.
 *
 * An empty list and a failed fetch are NOT the same thing, and conflating them
 * is the bug this exists to prevent — a student whose connection dropped was
 * once told they had no attendance record at all. That is why `onRetry` is the
 * point of the component rather than an extra.
 *
 * `detail` is the reassurance line, and it matters more than it looks: the gap
 * between "Couldn't load your attendance" and "your record is safe — this is
 * just the connection" is the gap between a panicked message to the instructor
 * and a shrug.
 *
 * `inline` renders a compact row instead of a card, for use inside a Card that
 * already exists (RiskOverview, PastSemesterBoard).
 */
export function ErrorState({
  children,
  detail,
  onRetry,
  retryLabel = 'Try again',
  inline = false,
  className,
}: {
  children?: ReactNode
  detail?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  inline?: boolean
  className?: string
}) {
  const message = children ?? 'Something went wrong.'
  const retry = onRetry && (
    <Button variant="outline" size="sm" onClick={onRetry}>
      {retryLabel}
    </Button>
  )

  if (inline) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <p className="min-w-0 flex-1 text-sm text-danger">{message}</p>
        {retry}
      </div>
    )
  }

  return (
    <Card pad="none" className={cn('p-8 text-center', className)}>
      <p className="text-sm text-danger">{message}</p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      {retry && <div className="mt-3">{retry}</div>}
    </Card>
  )
}
