import { cn } from '@/lib/cn'

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
  tone = 'accent',
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  className?: string
  /** Accessible name for the group, e.g. "History view". */
  label?: string
  tone?: 'accent' | 'quiet'
  size?: 'sm' | 'md'
}) {
  const quiet = tone === 'quiet'
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-2', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'cp-tap-y rounded-xl font-semibold transition-colors',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 text-sm',
              quiet
                ? active
                  ? 'border border-line bg-card-2 text-ink'
                  : 'border border-transparent text-muted hover:text-ink'
                : active
                  ? 'bg-accent-solid text-white'
                  : 'bg-card-2 text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
