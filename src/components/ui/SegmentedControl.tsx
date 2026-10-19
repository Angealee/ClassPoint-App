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
  tone = 'accent',
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  className?: string
  /** Accessible name for the group, e.g. "History view". */
  label?: string
  /**
   * `accent` is the filled default and stays the primary control.
   *
   * `quiet` exists for a SECOND strip beside a first one: two filled accent
   * strips in one row read as a single control with two active items, which is
   * exactly how the grade sheet's term tabs and its So far / Official toggle
   * were being misread. Quiet keeps the shape and the radiogroup semantics and
   * drops the fill, so red only ever marks the primary choice.
   */
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
