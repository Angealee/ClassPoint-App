import { cn } from '@/lib/cn'

/**
 * The pill-shaped on/off for a setting that takes a moment to apply.
 *
 * Not a native checkbox: it needs a `busy` state, because every switch it backs
 * is a server call (Student Space's kill switch and beta roster, the student
 * grades switch) and a switch that flips instantly and then snaps back on a
 * failure is a worse lie than one that waits.
 *
 * It lived inside InstructorSpace until a second screen needed it — the
 * fourth-copy rule applied at copy two. The `cp-tap-y` makes the hit region 44px
 * tall without changing the 28px the pill is drawn at (see index.css).
 */
export function Toggle({
  on,
  busy,
  onChange,
  label,
}: {
  on: boolean
  busy?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={cn(
        'cp-tap-y relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
        on ? 'bg-success-solid' : 'bg-card-2 ring-1 ring-line',
      )}
    >
      <span
        className={cn(
          'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left]',
          on ? 'left-6' : 'left-1',
        )}
      />
    </button>
  )
}
