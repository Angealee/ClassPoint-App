import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A bar docked above the mobile tab bar for a screen's primary action.
 *
 * `bottom-19` is the tab bar's height, and it was hand-typed in two files
 * (AttendanceSession, AttendanceReview). A magic number in two places is a
 * magic number that will disagree with itself the first time the tab bar
 * changes height — and the failure mode is a Save button hidden behind the nav,
 * on the screen used during a live class. `md:bottom-4` is the desktop
 * position, where there is no tab bar to clear.
 */
export function StickyBar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('sticky bottom-19 z-10 md:bottom-4', className)}>{children}</div>
}
