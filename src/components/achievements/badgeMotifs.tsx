import type { ReactElement, SVGProps } from 'react'

/**
 * One small illustrated motif per achievement code — the art inside a badge's
 * frame (see `BadgeArt.tsx`). Self-contained `<svg>` components in the same
 * style as `components/ui/icons.tsx`, just specific to achievements rather
 * than general nav/UI chrome, so they live in their own file. Filled (not
 * just stroked) so they read as bolder "badge" art at small sizes.
 */

const base = { viewBox: '0 0 24 24', fill: 'currentColor' }

function Footprints(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="9" cy="8" rx="3.4" ry="4.6" />
      <ellipse cx="15.5" cy="16" rx="3.4" ry="4.6" />
    </svg>
  )
}

function CoinStack(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="12" cy="18" rx="7.5" ry="2.6" opacity="0.6" />
      <ellipse cx="12" cy="13.5" rx="7.5" ry="2.6" opacity="0.8" />
      <ellipse cx="12" cy="9" rx="7.5" ry="2.6" />
    </svg>
  )
}

function Gem(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 4h12l4 6-10 10L2 10Z" />
      <path d="M6 4 2 10h20L18 4Z" opacity="0.55" />
    </svg>
  )
}

function Megaphone(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10v4a1.5 1.5 0 0 0 1.5 1.5H6l1 5h2l-1-5h1l9 4V6l-9 4H4.5A1.5 1.5 0 0 0 3 10Z" />
    </svg>
  )
}

function Crown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8.5 7 12l5-7.5L17 12l4-3.5L19.5 19h-15Z" />
    </svg>
  )
}

function Stopwatch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="9.5" y="1.5" width="5" height="2.2" rx="1" />
      <circle cx="12" cy="13" r="8.5" />
      <path d="M12 8v5l3.2 2" stroke="var(--color-canvas)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function ShieldCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2 20 5.5v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10v-6Z" />
      <path
        d="m8.3 12.3 2.4 2.4 5-5"
        stroke="var(--color-canvas)"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Flame(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2c1 3-3 4-3 7.5A3.5 3.5 0 0 0 12 13a2 2 0 0 0 2-2c1.5 1 2.5 3 2.5 5A6.5 6.5 0 0 1 4 16c0-4 2-5 3-8 .3 1.3 1 2 1.7 2C8 7 9 4.5 12 2Z" />
    </svg>
  )
}

function Rocket(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2c3 2 5 6 5 10.5-1 .8-2 1.2-3 1.4L14 20l-2-2-2 2-.3-6.1c-1-.2-2-.6-3-1.4C6.7 8 8.7 4 12 2Z" />
      <circle cx="12" cy="10.5" r="1.6" fill="var(--color-canvas)" />
      <path d="M8.5 15 6 17.5m9.5-2.5 2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function DemonMask(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6 7 3l1.5 3M20 6 17 3l-1.5 3" />
      <path d="M5 9a7 7 0 0 1 14 0c0 5-2.5 9-7 11-4.5-2-7-6-7-11Z" />
      <ellipse cx="9.3" cy="10.5" rx="1.2" ry="1.6" fill="var(--color-canvas)" />
      <ellipse cx="14.7" cy="10.5" rx="1.2" ry="1.6" fill="var(--color-canvas)" />
      <path d="M9 15q3 2 6 0" stroke="var(--color-canvas)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function MedalRibbon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M8 11 5 21l7-3 7 3-3-10Z" opacity="0.7" />
      <circle cx="12" cy="9" r="6.5" />
      <path
        d="M9.3 9.2 11 11l3.6-4"
        stroke="var(--color-canvas)"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Podium(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="13" width="6" height="8" rx="1" opacity="0.75" />
      <rect x="9" y="8" width="6" height="13" rx="1" />
      <rect x="16" y="15" width="6" height="6" rx="1" opacity="0.6" />
    </svg>
  )
}

function Camera(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="12.5" r="3.4" fill="var(--color-canvas)" />
    </svg>
  )
}

function OpenBook(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5.5C10 4 7 3.5 4 4v13c3-.5 6 0 8 1.5V5.5Z" />
      <path d="M12 5.5C14 4 17 3.5 20 4v13c-3-.5-6 0-8 1.5V5.5Z" opacity="0.75" />
    </svg>
  )
}

function PhotoStack(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="13" height="10" rx="1.5" opacity="0.55" transform="rotate(-6 9.5 12)" />
      <rect x="6" y="5" width="13" height="10" rx="1.5" opacity="0.8" transform="rotate(4 12.5 10)" />
      <rect x="5" y="8" width="13" height="10" rx="1.5" />
    </svg>
  )
}

function Eye(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3.2" fill="var(--color-canvas)" />
    </svg>
  )
}

function Magnifier(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="m19.5 19.5-4-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function Sunrise(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 21h16M4 16.5l1.8-1.6M20 16.5l-1.8-1.6M2.5 12h2M19.5 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M6.5 16.5a5.5 5.5 0 0 1 11 0Z" />
    </svg>
  )
}

function Sparkles(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3c.6 3 1.4 3.8 4.4 4.4-3 .6-3.8 1.4-4.4 4.4-.6-3-1.4-3.8-4.4-4.4C10.6 6.8 11.4 6 12 3Z" />
      <path d="M6 14c.4 1.8.9 2.3 2.7 2.7-1.8.4-2.3.9-2.7 2.7-.4-1.8-.9-2.3-2.7-2.7C5.1 16.3 5.6 15.8 6 14Z" />
      <path d="M18 13c.3 1.4.7 1.8 2.1 2.1-1.4.3-1.8.7-2.1 2.1-.3-1.4-.7-1.8-2.1-2.1 1.4-.3 1.8-.7 2.1-2.1Z" />
    </svg>
  )
}

function HeartPulse(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20 4.5 12.8a5 5 0 0 1 7.1-7.1L12 6l.4-.3a5 5 0 0 1 7.1 7.1Z" />
      <path
        d="M6 12.5h2.4l1.3-2.6 1.6 4.2 1.2-2.6H16"
        stroke="var(--color-canvas)"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Infinity_(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M7 8.5a4 4 0 0 0 0 8c2.2 0 3-1.6 5-4.5s2.8-4.5 5-4.5a4 4 0 0 1 0 8c-2.2 0-3-1.6-5-4.5S9.2 8.5 7 8.5Z" />
    </svg>
  )
}

function HelpingHands(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 14c0-2.5 1.6-4 3.4-4S9 10.7 9.6 12L11 10.3c.8-1 2.3-1 3 .1l-2.7 3.3-1.1 1.3H6.5C4.6 15 3 15 3 14Z" />
      <path
        d="M21 14c0-2.5-1.6-4-3.4-4S15 10.7 14.4 12L13 10.3c-.8-1-2.3-1-3 .1l2.7 3.3 1.1 1.3h4.7c1.9 0 2.5 0 2.5-1Z"
        opacity="0.75"
      />
    </svg>
  )
}

function TrendUp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path
        d="M3 17 9 11l4 3 8-8"
        stroke="currentColor"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 6h6v6" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShootingStar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M15 3q1 3.4 4.4 4.4Q15.9 8.9 15 12.2q-.9-3.3-4.4-4.8Q14 6.4 15 3Z" />
      <path d="M3 17.5 12 15l-2.6 6L6 17.7Z" opacity="0.85" />
    </svg>
  )
}

function PuzzlePiece(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 4h4a2 2 0 0 1 4 0h4v4a2 2 0 0 1 0 4v4h-4a2 2 0 0 1-4 0H6v-4a2 2 0 0 0 0-4Z" />
    </svg>
  )
}

function TrophyCrown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 3.5 7 6l5-3 5 3 3-2.5-1.5 6H5.5Z" opacity="0.85" />
      <path d="M6.5 9h11v2.5a5.5 5.5 0 0 1-11 0Z" />
      <path d="M9.5 17h5l1 3.5h-7Z" />
    </svg>
  )
}

/* ── Per-term badges (0036) ─────────────────────────────────────────────── */

/** A term's page with a star on it — "a standout six weeks". */
function CalendarStar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 2v2.5M18 2v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="4" width="18" height="17" rx="3" opacity="0.35" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11.2l1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5z" />
    </svg>
  )
}

/** A term with every box ticked. */
function CalendarCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 2v2.5M18 2v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="4" width="18" height="17" rx="3" opacity="0.35" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 15.2l2.6 2.6L16.4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Overlapping speech bubbles — the hand goes up, repeatedly. */
function SpeechBurst(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 6.5A2.5 2.5 0 015.5 4h9A2.5 2.5 0 0117 6.5v5A2.5 2.5 0 0114.5 14H8l-4 3.2V14a1 1 0 01-1-1z" opacity="0.45" />
      <path d="M9 10.5A2.5 2.5 0 0111.5 8h7A2.5 2.5 0 0121 10.5v4a2.5 2.5 0 01-2.5 2.5H18v3l-3.6-3h-2.9A2.5 2.5 0 019 14.5z" />
    </svg>
  )
}

/** An alarm clock — six mornings, all of them early. */
function AlarmClock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2.6 5.4A5 5 0 018 2.6M21.4 5.4A5 5 0 0016 2.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="13.5" r="8" opacity="0.35" />
      <path d="M12 8.6v5.2l3.2 2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 21l-1.6 1.6M18 21l1.6 1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/* ── Motifs for four 0021 badges that never got one (they rendered blank) ── */

/** A receipt — your first approved redemption. */
function Receipt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 2.5h14a1 1 0 011 1v18l-2.6-1.6-2.6 1.6-2.6-1.6-2.6 1.6-2.6-1.6L4 21.5v-18a1 1 0 011-1z" opacity="0.45" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

/** Dice — the high roller. */
function Dice(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" opacity="0.4" />
      <circle cx="8.5" cy="8.5" r="1.7" />
      <circle cx="15.5" cy="8.5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="8.5" cy="15.5" r="1.7" />
      <circle cx="15.5" cy="15.5" r="1.7" />
    </svg>
  )
}

/** A price tag — browsed, then thought better of it. */
function PriceTag(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M11.6 2.4H20a1.6 1.6 0 011.6 1.6v8.4a2 2 0 01-.6 1.4l-7.6 7.6a2 2 0 01-2.8 0L2.6 13.4a2 2 0 010-2.8l7.6-7.6a2 2 0 011.4-.6z" opacity="0.45" />
      <circle cx="17" cy="7" r="2.1" />
    </svg>
  )
}

export const BADGE_MOTIFS: Record<string, (props: SVGProps<SVGSVGElement>) => ReactElement> = {
  first_steps: Footprints,
  point_collector: CoinStack,
  point_master: Gem,
  recitation_regular: Megaphone,
  point_legend: Crown,

  checked_in: ShieldCheck,
  on_time: Stopwatch,
  reliable: ShieldCheck,
  streak_starter: Flame,
  iron_attendance: Flame,

  leveling_up: Rocket,
  halfway_hero: DemonMask,
  top_ten: MedalRibbon,
  podium_finish: Podium,
  peak_performer: Crown,

  picture_perfect: Camera,
  open_book: OpenBook,
  show_and_tell: PhotoStack,
  getting_noticed: Eye,
  profile_icon: Eye,

  curious_classmate: Magnifier,
  early_bird: Sunrise,
  clean_slate: Sparkles,
  comeback_kid: HeartPulse,
  the_collector: Infinity_,

  helping_hand: HelpingHands,
  most_improved: TrendUp,
  rising_star: ShootingStar,
  team_player: PuzzlePiece,
  class_mvp: TrophyCrown,

  // 0021's four — these were seeded without motifs and rendered as blank
  // gradient frames in the trophy case until now.
  big_spender: Receipt,
  high_roller: Dice,
  town_crier: Megaphone,
  window_shopper: PriceTag,

  // Per-term badges (0036).
  term_ace: CalendarStar,
  flawless_term: CalendarCheck,
  term_talker: SpeechBurst,
  six_sharp: AlarmClock,
}
