import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronDownIcon, GearIcon, LogOutIcon } from '@/components/ui/icons'
import { useStudentData } from '@/features/student/StudentData'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'

export interface AccountActions {
  /** Close whatever surface this is in, after navigating. */
  onNavigate: () => void
  onRequestSignOut: () => void
}

export function IdentityBlock({
  onNavigate,
  size = 'md',
}: {
  onNavigate: () => void
  size?: 'md' | 'lg'
}) {
  const { me } = useStudentData()
  const name = me?.display_name ?? 'Student'
  const points = me?.semester_points ?? 0
  const { level } = getLevelProgress(points)
  const lg = size === 'lg'

  return (
    <div className="flex items-center gap-3">
      <Avatar
        name={name}
        url={me?.avatar_url}
        className={lg ? 'h-16 w-16' : 'h-12 w-12'}
        textClassName={lg ? 'text-xl' : 'text-base'}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-display font-bold', lg ? 'text-xl' : 'text-base')}>
          {name}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <span className="shrink-0 font-semibold text-ink">Lv {level}</span>
          <span aria-hidden="true">·</span>
          <Link
            to="/app/history"
            onClick={onNavigate}
            className="shrink-0 font-semibold text-reward underline-offset-2 hover:underline"
          >
            {points} pts
          </Link>
        </p>
      </div>
    </div>
  )
}

const ROW =
  'flex h-14 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors'

export function SettingsRow({
  onNavigate,
  className,
}: {
  onNavigate: () => void
  className?: string
}) {
  return (
    <Link
      to="/app/settings"
      onClick={onNavigate}
      className={cn(ROW, 'text-ink hover:bg-card-2', className)}
    >
      <GearIcon className="h-5 w-5 shrink-0 text-muted" />
      Settings
    </Link>
  )
}

export function SignOutRow({
  onRequestSignOut,
  className,
}: {
  onRequestSignOut: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onRequestSignOut}
      className={cn(
        ROW,
        'text-danger hover:bg-danger-solid/10',
        className,
      )}
    >
      <LogOutIcon className="h-5 w-5 shrink-0" />
      Sign out
    </button>
  )
}

export function SidebarAccount({
  open,
  onToggle,
  onNavigate,
  onRequestSignOut,
}: AccountActions & { open: boolean; onToggle: () => void }) {
  const { me } = useStudentData()
  const name = me?.display_name ?? 'Student'
  const { level } = getLevelProgress(me?.semester_points ?? 0)

  return (
    <div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mb-1 flex flex-col gap-0.5 border-b border-line pb-2">
              <SettingsRow onNavigate={onNavigate} />
              <SignOutRow onRequestSignOut={onRequestSignOut} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
          open ? 'bg-card-2' : 'hover:bg-card-2',
        )}
      >
        <Avatar name={name} url={me?.avatar_url} className="h-8 w-8" textClassName="text-2xs" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block text-2xs text-muted">Lv {level}</span>
        </span>
        <ChevronDownIcon
          className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
    </div>
  )
}
