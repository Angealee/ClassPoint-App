import type { AttendanceStatus } from '@/lib/types'
import { cn } from '@/lib/cn'

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; chip: string; dot: string }
> = {
  present: {
    label: 'Present',
    chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  late: {
    label: 'Late',
    chip: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
    dot: 'bg-gold-500',
  },
  absent: {
    label: 'Absent',
    chip: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    dot: 'bg-brand-500',
  },
}

export function StatusChip({
  status,
  className,
}: {
  status: AttendanceStatus
  className?: string
}) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        meta.chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}
