import { forwardRef, type TextareaHTMLAttributes, useId } from 'react'
import { cn } from '@/lib/cn'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

/**
 * Multi-line text input. Mirrors `Input`'s API exactly (label / hint / error,
 * generated id, `aria-invalid`) so the two are interchangeable in a form.
 *
 * There was no primitive for this: all three textareas in the app hand-rolled
 * their own border, focus ring and error handling, and two of them were on
 * `text-sm` — 14px, which makes iOS Safari zoom the viewport on focus and never
 * zoom back. `text-base` here is that fix, structurally.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, rows = 3, ...props },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={cn(
          'w-full resize-none rounded-xl border bg-card px-3.5 py-2.5 text-base text-ink',
          'placeholder:text-muted/70 transition-colors',
          'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30',
          error ? 'border-danger' : 'border-line',
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? (
        <p className="mt-1.5 text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
})
