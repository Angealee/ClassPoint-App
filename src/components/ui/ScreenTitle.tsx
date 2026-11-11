import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function ScreenTitle({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string
  subtitle?: ReactNode
  /** Right-aligned controls that belong to the screen as a whole. */
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-3',
        subtitle ? 'items-start' : 'items-center',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
