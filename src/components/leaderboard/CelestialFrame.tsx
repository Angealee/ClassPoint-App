import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Place } from '@/components/leaderboard/podiumPalette'

/*
 * Each podium place is a different celestial body, drawn as geometry around the student's
 * photo: 1 a star with a slow corona, 2 a ringed planet whose ring passes behind and in
 * front of the face, 3 a cratered moon. Three different SHAPES and finishes, so the places
 * are told apart by what they are rather than by a shade. All literals: the card is a fixed
 * dark object and does not follow the theme.
 */
const FILL: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' }

const svgProps = {
  viewBox: '0 0 100 100',
  'aria-hidden': true,
  focusable: false,
  fill: 'none',
  style: FILL,
} as const

function Sun({ reduced }: { reduced: boolean }) {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2
    const long = i % 2 === 0
    const r1 = 37
    const r2 = long ? 47 : 42
    return {
      x1: 50 + Math.cos(a) * r1,
      y1: 50 + Math.sin(a) * r1,
      x2: 50 + Math.cos(a) * r2,
      y2: 50 + Math.sin(a) * r2,
      long,
    }
  })
  return (
    <>
      <div className={cn(!reduced && 'cp-corona')} style={{ position: 'absolute', inset: 0 }}>
        <svg {...svgProps}>
          {rays.map((r, i) => (
            <line
              key={i}
              x1={r.x1}
              y1={r.y1}
              x2={r.x2}
              y2={r.y2}
              stroke="#ffd166"
              strokeWidth={r.long ? 2 : 1.4}
              strokeLinecap="round"
              opacity={r.long ? 0.95 : 0.6}
            />
          ))}
          <circle cx="50" cy="50" r="40" stroke="#ffd166" strokeOpacity="0.35" strokeDasharray="1 3.4" />
        </svg>
      </div>
      <svg {...svgProps}>
        <circle cx="50" cy="50" r="31" fill="#2b1d08" stroke="#ffd166" strokeWidth="2.6" />
      </svg>
    </>
  )
}

/** The ring is drawn in two halves so the far half can sit behind the face. */
const RING_BACK = 'M 4 52 A 46 12 0 0 1 96 52'
const RING_FRONT = 'M 4 52 A 46 12 0 0 0 96 52'
const RING_BACK_IN = 'M 10 52 A 40 10 0 0 1 90 52'
const RING_FRONT_IN = 'M 10 52 A 40 10 0 0 0 90 52'

function PlanetBack() {
  return (
    <svg {...svgProps}>
      <g transform="rotate(-16 50 52)" strokeLinecap="round">
        <path d={RING_BACK} stroke="#aab3ff" strokeWidth="2.4" />
        <path d={RING_BACK_IN} stroke="#dde0ff" strokeWidth="1.1" strokeOpacity="0.8" />
      </g>
      <circle cx="50" cy="50" r="31" fill="#161a33" stroke="#8e9af0" strokeWidth="3" />
      <circle
        cx="50"
        cy="50"
        r="27.4"
        stroke="#c7cdfd"
        strokeWidth="1.1"
        strokeDasharray="15 5 6 5"
        strokeOpacity="0.8"
      />
    </svg>
  )
}

function PlanetFront() {
  return (
    <svg {...svgProps}>
      <g transform="rotate(-16 50 52)" strokeLinecap="round">
        <path d={RING_FRONT} stroke="#aab3ff" strokeWidth="2.6" />
        <path d={RING_FRONT_IN} stroke="#dde0ff" strokeWidth="1.1" strokeOpacity="0.85" />
      </g>
    </svg>
  )
}

function MoonBack() {
  return (
    <svg {...svgProps}>
      <circle cx="50" cy="50" r="31" fill="#10231f" stroke="#9fe3d6" strokeWidth="3" />
    </svg>
  )
}

function MoonFront() {
  return (
    <svg {...svgProps}>
      <g fill="#0c1a18" stroke="#7fc9bc" strokeWidth="1">
        <circle cx="25" cy="31" r="5.4" />
        <circle cx="76" cy="27" r="3.6" />
        <circle cx="79" cy="70" r="4.6" />
        <circle cx="31" cy="78" r="2.8" />
      </g>
      <circle cx="90" cy="34" r="2.8" fill="#d6f6f0" />
    </svg>
  )
}

export function CelestialFrame({
  place,
  reduced,
  children,
  className,
}: {
  place: Place
  reduced: boolean
  /** The student's face. It is centred and clipped to a circle. */
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}
    >
      {place === 1 && <Sun reduced={reduced} />}
      {place === 2 && <PlanetBack />}
      {place === 3 && <MoonBack />}
      <div
        style={{
          position: 'absolute',
          left: '22%',
          top: '22%',
          width: '56%',
          height: '56%',
          overflow: 'hidden',
          borderRadius: '9999px',
        }}
      >
        {children}
      </div>
      {place === 2 && <PlanetFront />}
      {place === 3 && <MoonFront />}
    </div>
  )
}
