import type { CSSProperties } from 'react'
import { sectionColor } from '@/lib/sectionColor'
import { dayPart, greetingFor, type DayPart } from '@/lib/time-of-day'

/**
 * The slim Home greeting. A sun / moon glyph that follows the hour sits where
 * the avatar used to (the avatar now lives in the Level card), a soft glow in the
 * same colour sits under the row, and the section is a pill with its identity dot.
 * Fixed art colours, deliberately not role tokens: a sky does not mean "success".
 */
const SKY: Record<DayPart, { orb: string; glow: string }> = {
  dawn: {
    orb: 'radial-gradient(circle at 35% 35%, #fff7d6, #fdba74 70%)',
    glow: 'rgba(253,186,116,0.55)',
  },
  day: {
    orb: 'radial-gradient(circle at 35% 35%, #fffbe0, #fde047 70%)',
    glow: 'rgba(253,224,71,0.5)',
  },
  dusk: {
    orb: 'radial-gradient(circle at 35% 35%, #ffe4c7, #fb923c 70%)',
    glow: 'rgba(251,146,60,0.55)',
  },
  night: {
    orb: 'radial-gradient(circle at 35% 35%, #ffffff, #cbd5e1 70%)',
    glow: 'rgba(165,180,252,0.5)',
  },
}

export function HomeGreeting({
  hour,
  name,
  sectionId,
  sectionName,
  message,
}: {
  /** The viewer's local hour, read once by the caller. */
  hour: number
  name: string
  sectionId: string | null
  sectionName: string
  message: string
}) {
  const part = dayPart(hour)
  const sky = SKY[part]

  return (
    <div className="relative">
      {/* Soft underglow in the colour of the hour */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-3 left-0 h-8 w-2/3 rounded-full opacity-40 blur-2xl"
        style={{ background: sky.glow }}
      />

      <div className="relative flex items-center gap-3">
        <span
          aria-hidden="true"
          className="cp-float relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card-2 ring-1 ring-line"
        >
          <span
            className="h-6 w-6 rounded-full"
            style={{ background: sky.orb, boxShadow: `0 0 18px 4px ${sky.glow}` }}
          />
          {part === 'night' && (
            // A bite out of the disc makes the moon a crescent.
            <span className="absolute right-2.5 top-2.5 h-4 w-4 rounded-full bg-card-2" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{greetingFor(hour)},</p>
          <h1 className="truncate font-display text-lg font-bold leading-tight">{name}</h1>
          <p className="truncate text-xs text-muted">{message}</p>
        </div>

        {sectionName && (
          <span className="flex max-w-[9rem] shrink-0 items-center gap-1.5 rounded-full border border-line bg-card-2 px-2.5 py-1 text-xs font-medium">
            {sectionId && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dot)] dark:bg-[var(--dot-dark)]"
                style={
                  {
                    '--dot': sectionColor(sectionId, false),
                    '--dot-dark': sectionColor(sectionId, true),
                  } as CSSProperties
                }
              />
            )}
            <span className="truncate">{sectionName}</span>
          </span>
        )}
      </div>
    </div>
  )
}
