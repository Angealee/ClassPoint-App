import { forwardRef, type InputHTMLAttributes, useId, useState } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  /**
   * Adds a Show / Hide toggle inside the field that flips `type` between
   * `password` and `text`. For a PIN typed on a phone, where a single wrong
   * character is the usual cause of a failed sign-in and there is nothing on
   * screen to catch it. The caller still passes `type="password"` — this only
   * controls whether the student can peek.
   *
   * ── WHY A WORD AND NOT AN EYE (the instructor's call, 2026-11-08) ──────────
   * The eye icon is the convention everywhere, and it is the one piece of
   * chrome in this app where the convention is not self-explanatory: an eye and
   * a struck-through eye have to be LEARNED, and which of the two means "it is
   * currently hidden" versus "tap to hide" is genuinely ambiguous. "Show" and
   * "Hide" are not.
   *
   * It also fixed a measured defect. The eye sat at `right-1.5` (6px) with a
   * `.cp-tap-44` region, so its invisible 44px hit area reached ~6px INTO the
   * typable text and ~1px past the field's border — a tap at the end of a PIN
   * could toggle visibility instead of placing the caret. The wider control
   * needs more right padding, which moves the whole thing clear.
   *
   * ⚠ "Show" and "Hide" are both four characters, which is why the label can
   *   flip without the field's padding needing to change. A future translation
   *   with different lengths would make the control jump; `min-w-12` holds the
   *   floor so it can only ever grow.
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
            // Room for the Show / Hide button plus its 8px inset, so the
            // control can no longer sit over the end of what you typed.
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
            // tabIndex -1 keeps Tab on the username → PIN → submit path; the
            // toggle is reached by tap/click, which is where it is used.
            tabIndex={-1}
            // The visible word is inside the accessible name (WCAG "Label in
            // Name"), and the name says WHAT is being revealed — which the
            // word alone cannot, since Input is generic.
            aria-label={`${shown ? 'Hide' : 'Show'} ${label ?? 'PIN'}`}
            aria-pressed={shown}
            // `.cp-tap-y`, not `.cp-tap-44`: the documented split is a centred
            // 44x44 box for SQUARE icon controls and height-only for wide
            // ones, because expanding this sideways is precisely the defect
            // being fixed. 44px tall is the field's own height, and its only
            // vertical neighbours are the label and the hint — both text, so
            // the adjacency rule has nothing to collide with.
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
