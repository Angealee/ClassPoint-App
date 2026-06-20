import { cn } from '@/lib/cn'

/** Branded ring spinner for full-page / route transitions. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-6 w-6 animate-spin rounded-full border-2',
        'border-line border-t-brand-500',
        className,
      )}
    />
  )
}

/** Centered spinner with optional label — Suspense/route fallback. */
export function RouteFallback({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted">
      <Spinner className="h-7 w-7" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}
