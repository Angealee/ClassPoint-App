import { cn } from '@/lib/cn'
import { describeOption } from '@/lib/peer-scale'
import type { PeerScaleOption } from '@/lib/types'

const COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}

export function ScaleRow({
  scale,
  value,
  onChange,
  name,
  disabled = false,
}: {
  scale: PeerScaleOption[]
  value: number | null
  onChange: (value: number) => void
  /** Accessible group name — the criterion's label. */
  name: string
  disabled?: boolean
}) {
  const wordLabels = scale.some((o) => o.label.trim() !== String(o.value))
  const binary = wordLabels && scale.length === 2
  const chosen = scale.find((o) => o.value === value) ?? null
  const cols = COLS[Math.min(Math.max(scale.length, 2), 5)]

  const buttonClass = (active: boolean) =>
    cn(
      'h-11 min-w-0 rounded-xl border text-sm font-semibold transition-colors',
      'disabled:cursor-not-allowed disabled:opacity-60',
      active
        ? 'border-transparent bg-accent-solid text-white'
        : 'border-line bg-card-2 text-muted hover:text-ink',
    )

  if (binary) {
    return (
      <div role="radiogroup" aria-label={name} className="grid grid-cols-2 gap-2">
        {scale.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(buttonClass(value === opt.value), 'min-w-0 truncate px-3')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    )
  }

  const first = scale[0]
  const last = scale[scale.length - 1]

  return (
    <div>
      <div role="radiogroup" aria-label={name} className={cn('grid gap-1.5', cols)}>
        {scale.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            aria-label={wordLabels ? `${opt.value}, ${opt.label}` : String(opt.value)}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(buttonClass(value === opt.value), 'tabular-nums')}
          >
            {opt.value}
          </button>
        ))}
      </div>

      {wordLabels && (
        <div className="mt-1.5 flex h-4 items-center px-0.5 text-xs" aria-hidden="true">
          {chosen ? (
            <span className="w-full truncate text-center font-semibold text-accent">
              {describeOption(scale, chosen.value)}
            </span>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-muted">{first?.label}</span>
              <span className="min-w-0 flex-1 truncate text-right text-muted">{last?.label}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
