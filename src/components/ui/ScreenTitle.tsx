import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The heading for a screen you ARRIVE at, as opposed to one you navigate into.
 *
 * ── WHY THIS IS NOT PageHeader ─────────────────────────────────────────────
 * PageHeader always renders a back button, and that is correct for every screen
 * it serves: Achievements, Settings, Use points, Points history, Spend board,
 * Attendance stats and Event scan are all pushed onto the stack from somewhere
 * else, which is why its `fallback` prop is required.
 *
 * Home, Ranks, Attend and Profile are NOT. They are nav destinations reached
 * from the bottom tab bar and the menu, so there is nothing to go back TO, and
 * a back arrow on a tab root either does nothing useful or walks the student
 * out of the tab they just chose.
 *
 * That is why those screens hand-rolled an <h1> instead of adopting PageHeader.
 * It was the right call and it reads like drift, which is the dangerous kind of
 * correct: the obvious "cleanup" is to migrate them to PageHeader and ship a
 * back button onto four root screens. This component exists so that cleanup has
 * somewhere right to go.
 *
 * It also settles a real inconsistency the three copies had grown: Attendance
 * and Leaderboard were `text-xl`, Profile was `text-2xl`.
 *
 * Leaderboard deliberately keeps its own header. Its title truncates, carries a
 * settle-countdown chip as a caption and sits beside two controls, which is a
 * different LAYOUT rather than a different style, and this codebase has already
 * reverted two UI changes for collapsing exactly that distinction.
 */
export function ScreenTitle({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string
  /** One line under the title. What this screen is for, not a restatement. */
  subtitle?: ReactNode
  /** Right-aligned controls that belong to the screen as a whole. */
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-3',
        // Derived rather than a prop, because there is only one right answer
        // either way. With a subtitle the actions must line up with the TITLE,
        // or a control floats against the middle of a two-line block. Without
        // one, the title is a single ~24px line beside a 44px control, and
        // top-aligning it reads as misaligned.
        subtitle ? 'items-start' : 'items-center',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
