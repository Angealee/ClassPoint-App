import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { AstronautArt } from '@/components/space/AstronautArt'

/**
 * Placeholder for Student Space until Phase 2 lands the real gate and hub.
 *
 * It exists NOW rather than after the feature because the sidebar links here:
 * a nav item pointing at a route that does not resolve is worse than a nav item
 * pointing at an honest "not yet" — and `routes.test.ts` would fail on the
 * dangling link either way.
 *
 * Phase 2 replaces this with the gated hub; the locked state it describes
 * becomes the view for students outside a `space_enabled` section.
 */
export function SpaceComingSoon() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold">Student Space</h1>
        <Chip tone="accent" size="sm">
          BETA
        </Chip>
      </div>

      <Card pad="roomy">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <AstronautArt variant="space" size="lg" />
          <div className="space-y-1.5">
            <p className="font-display text-lg font-bold">Still in the airlock</p>
            <p className="mx-auto max-w-sm text-sm text-muted">
              The Lounge and messaging are being built. Beta testers get the keys first —
              you&apos;ll see it here the moment it opens.
            </p>
          </div>
        </div>
      </Card>

      <Card pad="roomy">
        <div className="flex items-start gap-4">
          <AstronautArt variant="lounge" size="md" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">What&apos;s coming</p>
            <ul className="space-y-1 text-sm text-muted">
              <li>The Student Lounge — post, give a W, shout out a classmate.</li>
              <li>Group chats for your section and the whole class.</li>
              <li>Random Events — answer the question, grind the points.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
