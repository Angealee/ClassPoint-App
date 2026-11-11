import { cn } from '@/lib/cn'

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
