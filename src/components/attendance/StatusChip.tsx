import type { AttendanceStatus } from '@/lib/types'
import { Chip } from '@/components/ui/Chip'
import { TONE, type ToneClasses, type ToneName } from '@/lib/tone'

/**
 * How every attendance status looks — now just a mapping of status to ROLE.
 * The four facets (chip / dot / solid / text) are spread from the shared table
 * in lib/tone.ts, so this file no longer hand-writes a single colour.
 *
 * absent is DANGER, not brand red. It used to be brand-500, which made an
 * absence chip the same colour as an active nav item and as the "Activities"
 * points category — brand red meant "bad" and "good" at the same time.
 *
 * excused is INFO (calm blue): a legitimate pass, neither reward nor
 * punishment. irregular is NEUTRAL grey — not part of this session at all.
 */
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
