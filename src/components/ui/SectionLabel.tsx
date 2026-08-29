import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The small muted heading above a group of cards or rows.
 *
 * Existed in two spellings — `mb-2 px-1 text-sm font-semibold text-muted` (15
 * uses) and a bare `text-sm font-semibold text-muted` (5) — plus a handful that
 * had drifted to 15px before the Phase 4 type collapse. The `px-1` matters: it
 * optically aligns the label with the card text below it, which sits inside the
 * card's own padding.
 *
 * `action` is the right-hand slot, and it is the reason this is a component
 * rather than a class string: "See all" links were previously hand-built as a
 * flex row around the heading, differently each time.
 */
export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode
  /** Right-aligned slot — a "See all" link, a count, a small control. */
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-2 flex items-center justify-between gap-3 px-1', className)}>
      <h2 className="min-w-0 truncate text-sm font-semibold text-muted">{children}</h2>
      {action}
    </div>
  )
}
