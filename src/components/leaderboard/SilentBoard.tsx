import { RISER_H, SKY, type Place } from '@/components/leaderboard/podiumPalette'
import { makeStars } from '@/lib/starfield'
import { cn } from '@/lib/cn'

/*
 * The empty board is the SAME night sky and the SAME three risers as the live podium, with
 * the cards left as outlines. It is what every student sees on day one of a semester (the
 * snapshot ranks forty students tied at zero, which would read as a real ranking), so it has
 * to look like the board it is about to become rather than like a different screen.
 *
 * Animation is a CSS keyframe (opacity only), so the global reduced-motion rule covers it.
 */
const STARS = makeStars(11, 34, 0.5, 0.9, 0.25, 0.6)

/** 2-1-3, the same arrangement as the live podium. */
const GHOSTS: Array<{ place: Place; cls: string; card: string }> = [
  { place: 2, cls: 'cp-silent-2', card: 'h-28' },
  { place: 1, cls: 'cp-silent-1', card: 'h-32' },
  { place: 3, cls: 'cp-silent-3', card: 'h-28' },
]

const svgProps = {
  viewBox: '0 0 100 100',
  'aria-hidden': true,
  focusable: false,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeDasharray: '3 3',
  className: 'mx-auto mt-2 block aspect-square w-[62%] text-white/40',
} as const

function GhostBody({ place }: { place: Place }) {
  if (place === 1) {
    return (
      <svg {...svgProps}>
        <circle cx="50" cy="50" r="31" />
        <circle cx="50" cy="50" r="42" strokeOpacity="0.6" />
      </svg>
    )
  }
  if (place === 2) {
    return (
      <svg {...svgProps}>
        <circle cx="50" cy="50" r="31" />
        <ellipse cx="50" cy="52" rx="46" ry="12" transform="rotate(-16 50 52)" strokeOpacity="0.6" />
      </svg>
    )
  }
  return (
    <svg {...svgProps}>
      <circle cx="50" cy="50" r="31" />
      <circle cx="35" cy="40" r="5" strokeOpacity="0.6" />
      <circle cx="64" cy="62" r="4" strokeOpacity="0.6" />
    </svg>
  )
}

export function SilentBoard({
  detail = 'The first points of the semester wake it up.',
  className,
}: {
  detail?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl text-white shadow-lg shadow-black/25 ring-1 ring-white/10',
        className,
      )}
      style={{ background: SKY }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.r * 2,
              height: s.r * 2,
              opacity: s.o,
            }}
          />
        ))}
      </div>

      <div aria-hidden className="relative grid grid-cols-3 items-end gap-2 px-3 pt-8 sm:gap-3 sm:px-5">
        {GHOSTS.map(({ place, cls, card }) => (
          <div key={place} className={cn('flex min-w-0 flex-col', cls)}>
            <div
              className={cn(
                'rounded-xl border-2 border-dashed border-white/35 px-2 pt-1',
                card,
              )}
            >
              <GhostBody place={place} />
            </div>
            <div
              className={cn(
                'flex items-center justify-center rounded-t-md border-2 border-b-0 border-dashed border-white/35',
                RISER_H[place],
              )}
            >
              <span className="font-display text-2xl font-bold leading-none text-white/30">
                {place}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden className="relative h-1.5 border-t border-white/20 bg-white/10" />

      <div className="relative px-5 pb-6 pt-5 text-center">
        <h2 className="font-display text-lg font-bold">The board is still silent</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-white/60">{detail}</p>
      </div>
    </div>
  )
}
