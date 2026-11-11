import type { AttendanceStatus } from '@/lib/types'
import { Chip } from '@/components/ui/Chip'
import { TONE, type ToneClasses, type ToneName } from '@/lib/tone'

export const STATUS_META: Record<
  AttendanceStatus,
  ToneClasses & { label: string; tone: ToneName }
> = {
  present: { label: 'Present', tone: 'success', ...TONE.success },
  late: { label: 'Late', tone: 'warn', ...TONE.warn },
  absent: { label: 'Absent', tone: 'danger', ...TONE.danger },
  excused: { label: 'Excused', tone: 'info', ...TONE.info },
  irregular: { label: 'Irregular', tone: 'neutral', ...TONE.neutral },
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
    <Chip tone={meta.tone} dot className={className}>
      {meta.label}
    </Chip>
  )
}
