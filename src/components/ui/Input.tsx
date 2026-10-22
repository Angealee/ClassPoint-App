import { forwardRef, type InputHTMLAttributes, useId, useState } from 'react'
import { EyeIcon, EyeOffIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  /**
   * Adds an eye toggle inside the field that flips `type` between `password`
   * and `text`. For a PIN typed on a phone, where a single wrong character is
   * the usual cause of a failed sign-in and there is nothing on screen to catch
   * it. The caller still passes `type="password"` — this only controls whether
   * the student can peek.
   */
  revealable?: boolean
  /**
   * Layout classes for the WRAPPER, not the control.
   *
   * `className` lands on the <input>, so a caller sizing this in a flex row
   * with `className="flex-1"` caps the visible box while the wrapper stays
   * `w-full` and keeps its own width. Exactly the bug `Select` shipped with
   * for months (see its own note): width, max-width and flex go here;
   * height, text size and colour stay in `className`.
   */
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
            revealable && 'pr-11',
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
            // tabIndex -1 keeps Tab on the username → PIN → submit path; the
            // toggle is reached by tap/click, which is where it is used.
            tabIndex={-1}
            aria-label={shown ? 'Hide PIN' : 'Show PIN'}
            aria-pressed={shown}
            className="cp-tap-44 absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink"
          >
            {shown ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
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
