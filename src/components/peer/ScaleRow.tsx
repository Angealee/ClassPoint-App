import { cn } from '@/lib/cn'
import type { PeerScaleOption } from '@/lib/types'

/**
 * One criterion's rating buttons, driven by that criterion's own scale.
 *
 * ── WHY BUTTONS AND NOT A SLIDER ───────────────────────────────────────────
 * A scale here can be sparse (1 / 3 / 5) or binary (No / Yes), and a slider
 * implies every point between the ends is available. It is not: the submit RPC
 * checks membership in the scale, not a range, so a slider would let a student
 * pick a value the server then refuses for the whole submission.
 *
 * The options wrap rather than sharing a fixed grid. A 1-to-10 scale and a
 * Yes/No scale live on the same form, and forcing both into equal columns makes
 * the ten unreadable at 375px.
 */
export function ScaleRow({
  scale,
  value,
  onChange,
  name,
  disabled = false,
}: {
  scale: PeerScaleOption[]
  /** The chosen value, or null when this criterion is still unanswered. */
  value: number | null
  onChange: (value: number) => void
  /** Accessible group name — the criterion's label. */
  name: string
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="flex flex-wrap gap-1.5"
    >
      {scale.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'min-h-9 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-60',
              active
                ? 'border-transparent bg-accent-solid text-white'
                : 'border-line bg-card-2 text-muted hover:text-ink',
            )}
          >
            {/* The number is shown beside the word only when the two differ.
                On a 1-to-10 scale the label IS the number, and printing "1 1"
                reads as a bug. */}
            {opt.label === String(opt.value) ? (
              opt.label
            ) : (
              <>
                <span className="tabular-nums">{opt.value}</span>
                <span className="ml-1.5 text-xs opacity-80">{opt.label}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
