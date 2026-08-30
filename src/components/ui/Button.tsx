import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'gold' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /**
   * Shows a spinner in the icon slot and disables the button.
   *
   * Replaces 36 hand-rolled loading states that used at least eight different
   * vocabularies ('…', 'Loading…', 'Saving…', 'Creating…', 'Filing…',
   * 'Moving…', 'Rebuilding…', 'Adding…'). The label stays put by default, so
   * the button keeps saying what it does while it does it.
   *
   * ⚠ If the button had no `icon`, the spinner is inserted and the button
   * grows by the spinner plus one gap. That is invisible on a `w-full` button
   * or one in a grid, which is nearly all of them; pass an `icon` (or a fixed
   * width) if a mid-row button must not move.
   */
  loading?: boolean
  /**
   * Optional label swap while loading. Reserve it for slow operations where
   * the verb genuinely tells the user something the resting label does not —
   * 'Rebuilding…' over 'Rebuild now'. Most buttons should leave it unset.
   */
  loadingLabel?: ReactNode
  /** Leading icon. Replaced by the spinner while `loading`. */
  icon?: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-solid text-white hover:brightness-110 active:brightness-95 shadow-sm shadow-accent-solid/30',
  gold: 'bg-gold-400 text-brand-950 hover:bg-gold-300 active:bg-gold-500 shadow-sm shadow-gold-400/30',
  ghost: 'bg-transparent text-ink hover:bg-card-2',
  outline: 'border border-line bg-transparent text-ink hover:bg-card-2',
  // Destructive actions had NO variant before this: 'Delete session' and
  // 'Remove record' were bare <button>s hand-styling themselves.
  danger: 'bg-danger-solid text-white hover:brightness-110 active:brightness-95 shadow-sm shadow-danger-solid/30',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

/** Spinner sized and coloured to sit inside a button label. */
function ButtonSpinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current"
    />
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium',
        'transition-[background-color,transform] active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <ButtonSpinner /> : icon}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
    </button>
  )
}
