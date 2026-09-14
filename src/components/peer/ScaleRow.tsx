import { cn } from '@/lib/cn'
import { describeOption } from '@/lib/peer-scale'
import type { PeerScaleOption } from '@/lib/types'

/**
 * Tailwind cannot see an interpolated class, so every column count is a
 * complete literal. Six or more options wrap onto a second row of five.
 */
const COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}

/**
 * One criterion's rating buttons, driven by that criterion's own scale.
 *
 * ── WHY BUTTONS AND NOT A SLIDER ───────────────────────────────────────────
 * A scale here can be sparse (1 / 3 / 5) or binary (No / Yes), and a slider
 * implies every point between the ends is available. It is not: the submit RPC
 * checks membership in the scale, not a range, so a slider would let a student
 * pick a value the server then refuses for the whole submission.
 *
 * ── NUMBERS IN A ROW, THE LABEL UNDERNEATH (the instructor's call) ─────────
 * The old buttons carried "4 Very good" each and wrapped freely: a labelled
 * 1-to-5 scale is roughly 420px of buttons in about 310px of card at phone
 * width, so it broke onto two ragged rows. Now each option is an equal column
 * showing only its number, 44px tall so it is a real tap target, and the words
 * move to one caption line:
 *   • before choosing, the two END labels sit under the first and last column,
 *     so the direction of the scale is clear;
 *   • after choosing, the chosen option's own label replaces them.
 *
 * Two exceptions, both because the number would mean nothing to a student: a
 * two-option scale with word labels (Yes / No) keeps two wide labelled buttons,
 * and a scale whose labels ARE its numbers (1 to 10) shows no caption at all.
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
            className={cn(buttonClass(value === opt.value), 'truncate px-3')}
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
            // The label is not drawn on the button, so it has to be spoken.
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
        // Fixed height, so choosing an option swaps the caption in place instead
        // of nudging every card below it.
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
