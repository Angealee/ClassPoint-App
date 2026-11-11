import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode
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
