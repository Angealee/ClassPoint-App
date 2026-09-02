import { cn } from '@/lib/cn'

/**
 * The drifting colour field behind the hero.
 *
 * Two blurred blobs — gold (XP) and accent (brand identity) — slowly crossing
 * each other. It is the whole "atmosphere" half of the hero, and it is three
 * divs and two keyframes: no canvas, no gradient animation, no JS. A CSS
 * `background-position` or gradient-stop animation would repaint the whole area
 * every frame; animating `transform` on a pre-painted blob does not.
 *
 * ── WHY IT IS CLIPPED HERE AND NOT LEFT TO THE BODY ────────────────────────
 * The blobs are deliberately oversized and offset past the viewport edges, the
 * way a light source is. `body { overflow-x: clip }` would catch the resulting
 * scroll width, but that rule is the app's BACKSTOP, not a licence to overflow —
 * the PodiumBoard glow taught this exact lesson (414px of scroll width inside a
 * 360px box). So the field clips itself.
 *
 * `overflow-hidden` is safe on this one, unlike on `body`: nothing inside is
 * `position: fixed` or sticky, so turning it into a scroll container costs
 * nothing.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {/* Gold, upper-left — the XP colour, sitting behind the headline. */}
      <div
        className="cp-aurora-a absolute -left-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-gold-400/25 blur-3xl dark:bg-gold-400/20"
      />
      {/* Accent, lower-right — brand identity, behind the scoreboard. */}
      <div
        className="cp-aurora-b absolute -bottom-40 -right-28 h-[30rem] w-[30rem] rounded-full bg-accent-solid/15 blur-3xl dark:bg-accent-solid/20"
      />
      {/* A faint wash that fades the field into the canvas at the bottom edge,
          so the hero doesn't end on a hard colour seam against the next
          section. */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  )
}
