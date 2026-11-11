import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { STATUS_META } from '@/components/attendance/StatusChip'
import type { AttendanceStatus } from '@/lib/types'

const ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused', 'irregular']

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
  suggested?: AttendanceStatus | null
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
              'cp-tap-y h-9 rounded-lg px-2 text-sm font-semibold transition-colors',
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
          className="cp-tap-y h-9 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:bg-card-2 hover:text-ink"
        >
          Reset
        </button>
      )}
    </div>
  )
}
