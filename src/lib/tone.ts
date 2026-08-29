/**
 * One definition of what each semantic ROLE looks like.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Four separate files had grown their own copy of the same recipe. Two of them
 * — `ExcusesInbox` and `UsePoints`/`Redemptions` — were byte-identical:
 *
 *     pending:   'bg-gold-400/15 text-warn'
 *     approved:  'bg-success-solid/10 text-success'
 *     rejected:  'bg-brand-500/10 text-danger'
 *     cancelled: 'bg-card-2 text-muted'
 *
 * Three copies of a four-line table is not a disaster on its own. What it cost
 * was the ability to CHANGE anything: demoting brand red meant finding every
 * hand-typed copy of that third line, and any one missed would keep a rejected
 * chip looking like an active nav item forever.
 *
 * ── THE ROLES ──────────────────────────────────────────────────────────────
 * `danger` is the only red that means "you lost something". Brand red survives
 * as `accent` — identity, nav, and positive brand moments (a rank climb, an
 * announcement). They are separated by HUE, not just lightness, so they stay
 * distinct in dark mode too; the measurements are in `styles/index.css`.
 *
 * `reward` and `warn` are both gold and are NOT interchangeable: reward is the
 * number a student wants to see go up (XP, points, level), warn is a pending or
 * late state. Reward is the single most-used colour pair in the app.
 *
 * ── THE FOUR FACETS ────────────────────────────────────────────────────────
 *  chip   soft tinted pill — a status label sitting on a card
 *  dot    the small solid dot inside a chip, or a chart-legend swatch
 *  solid  filled style for a SELECTED control (status pickers)
 *  text   bare foreground, for tallies and inline emphasis
 *
 * Every value is a complete literal string so Tailwind's scanner can see it.
 * Never build one by concatenation — `bg-${role}-solid/10` generates nothing.
 */

export type ToneName =
  | 'success'
  | 'warn'
  | 'danger'
  | 'info'
  | 'reward'
  | 'accent'
  | 'neutral'

export interface ToneClasses {
  chip: string
  dot: string
  solid: string
  text: string
}

export const TONE: Record<ToneName, ToneClasses> = {
  success: {
    chip: 'bg-success-solid/10 text-success',
    dot: 'bg-success-solid',
    solid: 'bg-success-solid text-white',
    text: 'text-success',
  },
  warn: {
    // /15 rather than /10: gold is the lightest of the solids, so an equal tint
    // reads weaker than the others against a white card.
    chip: 'bg-warn-solid/15 text-warn',
    dot: 'bg-warn-solid',
    solid: 'bg-warn-solid text-brand-950',
    text: 'text-warn',
  },
  danger: {
    chip: 'bg-danger-solid/10 text-danger',
    dot: 'bg-danger-solid',
    solid: 'bg-danger-solid text-white',
    text: 'text-danger',
  },
  info: {
    chip: 'bg-info-solid/10 text-info',
    dot: 'bg-info-solid',
    solid: 'bg-info-solid text-white',
    text: 'text-info',
  },
  reward: {
    chip: 'bg-reward-solid/15 text-reward',
    dot: 'bg-reward-solid',
    solid: 'bg-reward-solid text-brand-950',
    text: 'text-reward',
  },
  accent: {
    chip: 'bg-accent-solid/10 text-accent',
    dot: 'bg-accent-solid',
    solid: 'bg-accent-solid text-white',
    text: 'text-accent',
  },
  neutral: {
    chip: 'bg-card-2 text-muted',
    dot: 'bg-muted',
    solid: 'bg-muted text-canvas',
    text: 'text-muted',
  },
}
