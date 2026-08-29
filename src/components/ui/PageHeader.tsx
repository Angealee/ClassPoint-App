import { IconButton } from '@/components/ui/IconButton'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Standard screen header: back affordance, title, optional subtitle and a
 * trailing slot.
 *
 * Replaces five near-identical private implementations (`PointsHistory`'s
 * `Header`, `AttendanceStats`, `Achievements`, and the instructor `BackLink`s in
 * `SessionDetail` / `StudentRecord` / `ManageSemesters`) that had drifted into
 * three different glyphs and three different back destinations.
 *
 * ── WHY NOT PLAIN `navigate(-1)` ───────────────────────────────────────────
 * This is an installed PWA. Students arrive from push notifications, from
 * `/scan` deep links, and from a cold app launch — in all of those cases the
 * history stack has no previous entry inside the app, so `navigate(-1)` either
 * does nothing or throws them out to whatever was in the tab before.
 *
 * So: go back only when there is genuinely somewhere to go back TO, otherwise
 * land on a sensible screen. `history.state.idx` is react-router's own index
 * into the session history — 0 means this is the first entry.
 *
 * This is also the fix for `Achievements`, which hard-coded `/app/profile` and
 * therefore sent you to a screen you had never visited if you arrived from Home.
 */
export function PageHeader({
  title,
  subtitle,
  fallback,
  actions,
  backLabel = 'Back',
  className,
}: {
  title: string
  subtitle?: ReactNode
  /** Where to go when there is no in-app history to return to. */
  fallback: string
  /** Optional trailing content (a button, a chip). */
  actions?: ReactNode
  backLabel?: string
  className?: string
}) {
  const navigate = useNavigate()

  function goBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
            <IconButton
        label={backLabel}
        variant="outline"
        round
        onClick={goBack}
        icon={<ArrowLeftIcon className="h-4 w-4" />}
      />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-bold">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}
