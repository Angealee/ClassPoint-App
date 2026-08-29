import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { STATUS_META } from '@/components/attendance/StatusChip'
import type { AttendanceStatus } from '@/lib/types'

/**
 * Setting a student's attendance status — one component, three densities.
 *
 * ── WHY IT WAS THREE COMPONENTS ────────────────────────────────────────────
 * The identical task had three separate implementations, each with its own copy
 * of the status ORDER and its own idea of what "selected" looks like:
 *
 *   live session   a 3-up grid of labelled buttons, plus Reset
 *   review         a row of five 32px squares showing P / L / A / E / I
 *   session detail a bottom sheet listing each status with its points effect
 *
 * The densities are genuinely different and worth keeping — five labels beside
 * a name is too wide for the review roster, and the live screen is used under
 * time pressure where initials are the wrong thing to decode. What was NOT
 * worth keeping was three copies of the order, the colours and the selected
 * state, which is how they drifted apart in the first place.
 *
 * ── THE VARIANTS ───────────────────────────────────────────────────────────
 *  grid     labelled buttons, 3-up. The live-class screen.
 *  compact  single letters in squares, for a dense roster row.
 *  list     full-width rows with a dot and an optional consequence line. This
 *           one is a DECISION surface, not a quick toggle: it changes an
 *           already-committed record, so it explains what that will do first.
 *
 * All five statuses are markable everywhere, deliberately — mark what you know
 * the moment you know it, rather than remembering to fix it in review later.
 */

const ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused', 'irregular']

/**
 * Excused and Irregular both start with a letter already taken by another
 * status, so they get their own initials rather than colliding.
 */
function initial(s: AttendanceStatus): string {
  if (s === 'excused') return 'E'
  if (s === 'irregular') return 'I'
  return STATUS_META[s].label[0]
}

export function StatusPicker({
  value,
  onPick,
  variant = 'grid',
  suggested,
  describe,
  disabled = false,
  onReset,
  className,
}: {
  value: AttendanceStatus | null
  onPick: (status: AttendanceStatus) => void
  variant?: 'grid' | 'compact' | 'list'
  /** Ringed as "this is what the clock says they'd get" on the live screen. */
  suggested?: AttendanceStatus | null
  /** `list` only: a line explaining what picking this status will do. */
  describe?: (status: AttendanceStatus) => ReactNode
  disabled?: boolean
  /** `grid` only: shows a Reset button once a status is set. */
  onReset?: () => void
  className?: string
}) {
  if (variant === 'list') {
    return (
      <div className={cn('space-y-2', className)}>
        {ORDER.map((s) => {
          const active = value === s
          const note = describe?.(s)
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onPick(s)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60',
                active ? 'border-accent-solid/40 bg-accent-solid/5' : 'border-line hover:bg-card-2',
              )}
            >
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', STATUS_META[s].dot)} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{STATUS_META[s].label}</span>
                {note && <span className="block text-xs text-muted">{note}</span>}
              </span>
              {active && <span className="shrink-0 text-xs font-semibold text-accent">Current</span>}
            </button>
          )
        })}
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className={cn('flex shrink-0 gap-1', className)}>
        {ORDER.map((s) => {
          const active = value === s
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              aria-pressed={active}
              aria-label={STATUS_META[s].label}
              title={STATUS_META[s].label}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-colors',
                'disabled:pointer-events-none disabled:opacity-50',
                active ? STATUS_META[s].solid : 'bg-card-2 text-muted hover:text-ink',
              )}
            >
              {initial(s)}
            </button>
          )
        })}
      </div>
    )
  }

  // grid — a fixed 3-up, not flex-wrap: five statuses (+ Reset) land as tidy
  // rows of three instead of a ragged four-then-one.
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {ORDER.map((s) => {
        const active = value === s
        const isSuggested = !active && s === suggested
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onPick(s)}
            className={cn(
              'h-9 rounded-lg px-2 text-sm font-semibold transition-colors',
              'disabled:pointer-events-none disabled:opacity-50',
              active ? STATUS_META[s].solid : 'bg-card-2 text-muted hover:text-ink',
              isSuggested && 'ring-2 ring-accent-solid/40',
            )}
          >
            {STATUS_META[s].label}
          </button>
        )
      })}
      {onReset && value && (
        <button
          type="button"
          disabled={disabled}
          onClick={onReset}
          className="h-9 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:bg-card-2 hover:text-ink"
        >
          Reset
        </button>
      )}
    </div>
  )
}
