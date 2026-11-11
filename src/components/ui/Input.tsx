import { forwardRef, type InputHTMLAttributes, useId, useState } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  revealable?: boolean
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, revealable, className, wrapperClassName, id, type, ...props },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [shown, setShown] = useState(false)
  const effectiveType = revealable ? (shown ? 'text' : 'password') : type

  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          className={cn(
            'h-11 w-full rounded-xl border bg-card px-3.5 text-base text-ink',
            'placeholder:text-muted/70 transition-colors',
            'focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30',
            revealable && 'pr-17',
            error ? 'border-danger' : 'border-line',
            className,
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            tabIndex={-1}
            aria-label={`${shown ? 'Hide' : 'Show'} ${label ?? 'PIN'}`}
            aria-pressed={shown}
            className="cp-tap-y absolute right-2 top-1/2 flex h-8 min-w-12 -translate-y-1/2 items-center justify-center rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error ? (
        <p className="mt-1.5 text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
})
