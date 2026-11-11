import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { TONE, type ToneName } from '@/lib/tone'

export function Stat({
  value,
  label,
  tone,
  icon,
  hint,
  align = 'center',
  className,
}: {
  value: ReactNode
  label: ReactNode
  /** Colours the figure. Leave unset for plain ink. */
  tone?: ToneName
  /** Small glyph shown beside the figure. */
  icon?: ReactNode
  /** Third line, smaller and muted — a delta or a target. */
  hint?: ReactNode
  align?: 'center' | 'start'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      <span className="flex items-center gap-1">
        {icon}
        <span
          className={cn(
            'font-display text-xl font-bold tabular-nums',
            tone ? TONE[tone].text : 'text-ink',
          )}
        >
          {value}
        </span>
      </span>
      <span className="max-w-full truncate text-2xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {hint && <span className="max-w-full truncate text-2xs text-muted">{hint}</span>}
    </div>
  )
}
