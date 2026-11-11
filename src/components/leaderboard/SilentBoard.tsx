import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

export function SilentBoard({
  detail = 'The first points of the semester wake it up.',
  className,
}: {
  detail?: string
  className?: string
}) {
  return (
    <Card pad="roomy" className={cn('flex flex-col items-center text-center', className)}>
      <EmptyPodium />
      <h2 className="mt-4 font-display text-lg font-bold">The board is still silent</h2>
      <p className="mt-1 max-w-xs text-sm text-muted">{detail}</p>
    </Card>
  )
}

function EmptyPodium() {
  return (
    <svg
      viewBox="0 0 160 96"
      className="h-24 w-40"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <ellipse cx="80" cy="54" rx="62" ry="22" fill="var(--color-card-2)" opacity="0.6" />

      <g stroke="var(--color-muted)" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="3 3">
        <circle cx="34" cy="44" r="9" />
        <circle cx="80" cy="30" r="11" />
        <circle cx="126" cy="49" r="9" />
      </g>

      <g
        fill="var(--color-card-2)"
        stroke="var(--color-muted)"
        strokeOpacity="0.75"
        strokeWidth="2"
      >
        <rect className="cp-silent-1" x="12" y="58" width="44" height="26" rx="4" />
        <rect className="cp-silent-2" x="58" y="46" width="44" height="38" rx="4" />
        <rect className="cp-silent-3" x="104" y="64" width="44" height="20" rx="4" />
      </g>

      {/* The stage floor the real podium shares. */}
      <rect
        x="10"
        y="84"
        width="140"
        height="5"
        rx="2.5"
        fill="var(--color-muted)"
        fillOpacity="0.55"
      />
    </svg>
  )
}
