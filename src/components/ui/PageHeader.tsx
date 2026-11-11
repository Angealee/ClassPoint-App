import { IconButton } from '@/components/ui/IconButton'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

export function PageHeader({
  title,
  subtitle,
  fallback,
  actions,
  backLabel = 'Back',
  onBack,
  className,
}: {
  title: string
  subtitle?: ReactNode
  /** Where to go when there is no in-app history to return to. */
  fallback: string
  /** Optional trailing content (a button, a chip). */
  actions?: ReactNode
  backLabel?: string
  onBack?: () => void
  className?: string
}) {
  const navigate = useNavigate()

  function goBack() {
    if (onBack) {
      onBack()
      return
    }
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
            <IconButton
        label={backLabel}
        variant="outline"
        round
        onClick={goBack}
        icon={<ArrowLeftIcon className="h-4 w-4" />}
      />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-bold">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}
