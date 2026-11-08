import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

/**
 * The board, before anybody has scored (0060-era).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `leaderboard_snapshot` has no `semester_id`; it ranks EVERY non-archived
 * student by `semester_points` (0038). So the first morning of a new semester
 * the board is forty students tied at zero, ordered alphabetically, wearing
 * place numbers — which reads as a real ranking and is not one. The
 * instructor's call: the board stays on screen, but nothing is shown on it.
 *
 * ── WHY IT IS NOT `EmptyState` ──────────────────────────────────────────────
 * `EmptyState` is a sentence in a box, which is right for "no classes yet" and
 * wrong here: this is the screen a student opens for fun, and the first thing
 * they see on day one of a semester sets whether they come back. So it gets
 * art.
 *
 * ── TOKEN-COLOURED, DELIBERATELY ────────────────────────────────────────────
 * Unlike PodiumBoard's medal ramps and ShareCard — both declared art islands
 * with literal palettes — every value here is a semantic token, so it follows
 * the theme. There is nothing being captured by modern-screenshot and no
 * gradient a flat token cannot express, which is what made those two islands
 * necessary and makes this one not.
 *
 * The only motion is a two-step opacity on the three stands, and it is a CSS
 * `animation` so the global reduced-motion block switches it off along with
 * everything else — no `useReducedMotion` guard needed here.
 *
 * ⚠ THE OUTLINE IS `--muted`, NOT `--line`, AND THAT WAS MEASURED.
 *   The first version stroked everything with `--line`, which is the right
 *   token for a border between two surfaces and completely wrong for the only
 *   thing carrying a shape. On a white card in LIGHT mode `--line` (#e7e7ec)
 *   measures **1.23:1** — the whole podium was invisible, and invisible in
 *   exactly one theme, so it looked fine to whoever was in dark mode.
 *   `--muted` is 4.83:1 on the same card, so it is used at a reduced opacity
 *   to land above the 3:1 non-text threshold without shouting.
 *
 *   Measured after the fix, with each translucent stroke BLENDED OVER the card
 *   before computing (reading an `rgb(… / α)` value straight into a contrast
 *   formula gives nonsense — the same note the plate contrast work records):
 *
 *     stand outline   light 3.00   dark 4.43   ← the load-bearing one
 *     seat ring       light 2.32   dark 3.30
 *     stage floor     light 2.14   dark 2.98
 *
 *   Only the stands are held to 3:1. The dashed rings and the floor bar are
 *   secondary, and everything this graphic means is also written in the
 *   heading beside it — so they are allowed to stay quiet rather than turning
 *   an empty state into a diagram.
 *
 *   The FILLS stay `--card-2`, which is 1.04:1 on the card in light mode and
 *   deliberately so: that is the app's documented theme split — light carries
 *   depth with an outline and a shadow, dark carries it with a surface step
 *   (canvas→card→card-2 is ΔL* ~6 each). The fill does the work in dark, the
 *   stroke does it in light, and both ship in both.
 */
export function SilentBoard({
  /** Line under the heading. Differs between the points and spend boards. */
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

/**
 * Three empty stands, unlit.
 *
 * The shape is the real podium's — #2, #1, #3 with the champion tallest — so a
 * student who has seen the board recognises what is missing rather than reading
 * an abstract graphic. `aria-hidden`: the heading beside it already says this.
 */
function EmptyPodium() {
  return (
    <svg
      viewBox="0 0 160 96"
      className="h-24 w-40"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {/* A dormant halo where the gold glow sits on a live board. */}
      <ellipse cx="80" cy="54" rx="62" ry="22" fill="var(--color-card-2)" opacity="0.6" />

      {/* Empty seats: a dashed ring where each avatar would be. */}
      <g stroke="var(--color-muted)" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="3 3">
        <circle cx="34" cy="44" r="9" />
        <circle cx="80" cy="30" r="11" />
        <circle cx="126" cy="49" r="9" />
      </g>

      {/* The three stands. Heights mirror PEDESTAL_H's 1 > 2 > 3 order. */}
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
