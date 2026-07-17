import type { AttendanceStatus } from '@/lib/types'
import { cn } from '@/lib/cn'

/**
 * One place defining how every attendance status looks.
 *  chip  — soft pill background (the StatusChip below)
 *  dot   — the chip's leading dot
 *  solid — filled style for a *selected* status button (pickers)
 *  text  — bare text colour (tallies, inline emphasis)
 */
export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; chip: string; dot: string; solid: string; text: string }
> = {
  present: {
    label: 'Present',
    chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    solid: 'bg-emerald-500 text-white',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  late: {
    label: 'Late',
    chip: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
    dot: 'bg-gold-500',
    solid: 'bg-gold-400 text-brand-950',
    text: 'text-gold-600 dark:text-gold-400',
  },
  absent: {
    label: 'Absent',
    chip: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    dot: 'bg-brand-500',
    solid: 'bg-brand-500 text-white',
    text: 'text-brand-600 dark:text-brand-400',
  },
  // The neutral pair reads calm on purpose — neither reward nor punishment.
  // Sky = a legitimate pass; grey = "not part of this session at all".
  excused: {
    label: 'Excused',
    chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
    solid: 'bg-sky-500 text-white',
    text: 'text-sky-600 dark:text-sky-400',
  },
  irregular: {
    label: 'Irregular',
    chip: 'bg-card-2 text-muted',
    dot: 'bg-muted',
    solid: 'bg-muted text-canvas',
    text: 'text-muted',
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
