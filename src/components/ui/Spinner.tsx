import { cn } from '@/lib/cn'

/**
 * Branded ring spinner for full-page and route transitions.
 *
 * Button has its own private ButtonSpinner and that is deliberate, not drift.
 * This one is `role="status"` with brand colours, which is right when it is the
 * only thing on screen; inside a button it would announce a second time over
 * the button's own `aria-busy`, and brand-on-brand would be invisible on a
 * primary button. ButtonSpinner is `aria-hidden` and `border-current`, so it
 * inherits whatever colour its label has. Merging them loses one or the other.
 */
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

/** Centered spinner with optional label — Suspense/route fallback. */
export function RouteFallback({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted">
      <Spinner className="h-7 w-7" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}
