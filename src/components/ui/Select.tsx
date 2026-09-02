import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  /**
   * Layout classes for the OUTER wrapper — width, max-width, flex behaviour.
   *
   * ── WHY THIS IS SEPARATE FROM `className` ──────────────────────────────
   * `className` lands on the `<select>` itself, but the wrapper is the box
   * that actually lays out, and it is `w-full`. So a caller writing
   * `className="max-w-34 shrink-0"` in a flex row capped the visible control
   * at 136px while the WRAPPER still spanned the whole row — and since the
   * chevron is positioned `absolute right-3` of the wrapper, it detached from
   * the control and floated to the far right, on top of whatever was there.
   *
   * All three sizing call sites had this (both leaderboards and the spend
   * board); it only became visible once one of those headers got tight enough
   * for the stranded chevron to land on the settle-countdown chip.
   *
   * So: sizing goes here, appearance (height, text size) stays in `className`.
   */
  wrapperClassName?: string
}

/** Styled native select (reliable, accessible, mobile-friendly). */
export function Select({
  label,
  className,
  wrapperClassName,
  children,
  id,
  ...props
}: SelectProps) {
  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={cn(
            'h-11 w-full appearance-none rounded-xl border border-line bg-card pl-3.5 pr-10 text-base text-ink',
            'transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  )
}
