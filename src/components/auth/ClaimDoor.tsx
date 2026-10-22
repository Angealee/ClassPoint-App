import { Link } from 'react-router-dom'
import { ChevronDownIcon, TicketIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * The one way into `/claim` from the sign-in screen.
 *
 * ── WHY IT IS THE ONLY ONE ──────────────────────────────────────────────────
 * Sign in previously offered THREE paths to the same place: a bordered card
 * above the form ("First time? Have a token?"), a footer link ("First time?
 * Claim your account"), and a subtitle that implied it. Measured at 375x812,
 * the card sat at y=274 and the footer link at y=695 — so the first thing a
 * returning student read was an invitation addressed to somebody else, and a
 * new student was asked the same question twice.
 *
 * ── WHY IT SITS BELOW THE FORM ──────────────────────────────────────────────
 * A returning student is very nearly all of the traffic, so the form goes
 * first. The stub earns its place by being the loudest block on the page
 * rather than the highest one: gold on a page whose only other colour is the
 * red primary button.
 *
 * ── WHY A PERFORATION AND NOT EDGE NOTCHES ──────────────────────────────────
 * PodiumBoard's spend pedestal bites its notches out with circles painted in
 * the surface colour behind it, which works there because that surface is
 * flat. Here the backdrop is the aurora, so a `bg-canvas` circle would read as
 * a solid dot parked on a gradient. A real hole needs `mask-composite`, whose
 * failure mode is the whole element disappearing — not a trade worth making
 * for the only claim door in the app. A dashed perforation says "ticket" with
 * no assumption about what is behind it.
 */
export function ClaimDoor({ className }: { className?: string }) {
  return (
    <Link
      to="/claim"
      className={cn(
        'group flex items-stretch overflow-hidden rounded-xl border border-reward-solid/35',
        'bg-gradient-to-r from-reward-solid/15 to-reward-solid/5',
        'transition-colors hover:from-reward-solid/25 hover:to-reward-solid/10',
        className,
      )}
    >
      <span className="flex w-14 shrink-0 items-center justify-center bg-reward-solid/10 text-reward">
        <TicketIcon className="h-6 w-6" />
      </span>

      {/* The perforation. Decorative, so it is hidden from the accessibility
          tree — the link already reads as one thing. */}
      <span aria-hidden className="w-0 shrink-0 border-l border-dashed border-reward-solid/40" />

      <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5">
        {/* The ACTION is the second line, not the question — so it carries the
            weight and the reward colour. A one-line explanation sat here first
            and wrapped to two, which pushed the stub to 90px and left the verb
            in muted body copy. The detail it carried is already the subtitle
            of the screen this links to. */}
        <span className="min-w-0">
          <span className="block text-sm text-muted">First time here?</span>
          <span className="block font-display text-sm font-bold text-reward">
            Claim your account
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className="ml-auto h-4 w-4 shrink-0 -rotate-90 text-reward transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  )
}
