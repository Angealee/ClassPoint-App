import { cn } from '@/lib/cn'

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-6 w-6 animate-spin rounded-full border-2',
        'border-line border-t-accent-solid',
        className,
      )}
    />
  )
}

export function RouteFallback({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted">
      <Spinner className="h-7 w-7" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}
