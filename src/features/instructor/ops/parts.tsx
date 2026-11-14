import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { ChevronDownIcon } from '@/components/ui/icons'

/** A card with ONE header shape, so twelve of them on a screen line up instead of each inventing its own. */
export function OpsCard({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card id={id} pad="none" className={cn('scroll-mt-4', className)}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="px-4 pb-4 pt-3">{children}</div>
    </Card>
  )
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <Button variant="ghost" size="sm" className="-mr-2 -mt-1 shrink-0" disabled={busy} onClick={onClick}>
      {busy ? 'Refreshing…' : 'Refresh'}
    </Button>
  )
}

/** A fixed-shape icon tile: every row in every list has the same left edge. */
export function IconTile({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'success' | 'warn' | 'danger' | 'neutral' }) {
  const tones = {
    accent: 'bg-accent-solid/10 text-accent',
    success: 'bg-success-solid/10 text-success',
    warn: 'bg-warn-solid/15 text-warn',
    danger: 'bg-danger-solid/10 text-danger',
    neutral: 'bg-card-2 text-muted',
  } as const
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{children}</span>
  )
}

/** One ledger row: icon, title, one line, something on the right. A button when it goes somewhere. */
export function LedgerRow({
  icon,
  title,
  text,
  right,
  onClick,
  chevron = true,
}: {
  icon: ReactNode
  title: string
  text: ReactNode
  right?: ReactNode
  onClick?: () => void
  chevron?: boolean
}) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{text}</span>
      </span>
      {right}
      {onClick && chevron && <ChevronDownIcon aria-hidden className="h-4 w-4 shrink-0 -rotate-90 text-muted" />}
    </>
  )
  const row = 'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left'
  if (!onClick) return <div className={row}>{body}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        row,
        'transition-colors hover:bg-card-2 focus:outline-none focus-visible:bg-card-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
      )}
    >
      {body}
    </button>
  )
}

export function SourceError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <ErrorState inline onRetry={onRetry}>
      {message}
    </ErrorState>
  )
}
