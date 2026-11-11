import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

export function EmptyState({
  icon,
  children,
  description,
  action,
  compact,
  className,
}: {
  icon?: ReactNode
  /** The sentence a student actually reads. */
  children: ReactNode
  description?: ReactNode
  /** Usually a <Button>. Rendered below the text. */
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  const body = (
    <>
      {icon && <span className="text-muted [&>svg]:h-7 [&>svg]:w-7">{icon}</span>}
      <p className="text-sm text-muted">{children}</p>
      {description && <p className="max-w-xs text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </>
  )

  if (compact) {
    return (
      <div className={cn('flex flex-col items-center gap-2 px-4 py-6 text-center', className)}>
        {body}
      </div>
    )
  }

  return (
    <Card pad="none" className={cn('flex flex-col items-center gap-2 p-8 text-center', className)}>
      {body}
    </Card>
  )
}

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
