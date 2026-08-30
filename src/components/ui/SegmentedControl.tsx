import { cn } from '@/lib/cn'

/**
 * The tab strip used to switch between views of one screen (History's
 * Points/Attendance, Requests' Points/Excuses/Rewards, ShareSheet's formats).
 *
 * Built as a real radiogroup rather than a row of buttons: without
 * `role="radiogroup"` and `aria-checked` a screen reader hears three unrelated
 * buttons and cannot tell which view is active — which is exactly what the
 * hand-rolled versions did.
 *
 * Columns come from the option count, so a two-tab and a three-tab strip stay
 * visually consistent instead of one being `grid-cols-2` and the other a flex
 * row that happens to look similar.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  className?: string
  /** Accessible name for the group, e.g. "History view". */
  label?: string
}) {
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
              'h-10 rounded-xl text-sm font-semibold transition-colors',
              active ? 'bg-accent-solid text-white' : 'bg-card-2 text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
