import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { CheckIcon, QrIcon } from '@/components/ui/icons'
import { timeAgo } from '@/lib/time'
import { NEUTRAL_STATUSES } from '@/lib/types'
import { useStudentData } from './StudentData'

/**
 * "Class is live right now" (0033).
 *
 * Before this, a student could only find out class had started by being in the
 * room — the app knew, and never said. `class_sessions` joined the realtime
 * publication in 0033, so this appears the moment the instructor taps Start and
 * clears itself when they end the session.
 *
 * Renders nothing when no class is running, so both hosts can mount it
 * unconditionally.
 *
 * @param onScan Opens the scanner in place (the Attendance screen owns the
 *   scanner sheet). Omit it — as the Dashboard does — and the button routes to
 *   Attendance with `?scan=1`, which opens the sheet on arrival.
 */
export function LiveClassBanner({ onScan }: { onScan?: () => void }) {
  const { liveSession, liveStatus } = useStudentData()
  const navigate = useNavigate()

  if (!liveSession) return null

  // 'excused' and 'irregular' are NEUTRAL (types.ts) — an excused student has
  // been dealt with, not checked in, so prompting them to scan would be wrong.
  const checkedIn = liveStatus !== null
  const neutral = liveStatus !== null && NEUTRAL_STATUSES.includes(liveStatus)
  const subject = liveSession.subjectCode ?? 'Class'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        checkedIn
          ? 'flex items-center gap-3 rounded-2xl border border-success-solid/30 bg-success-solid/10 p-3'
          : 'flex items-center gap-3 rounded-2xl border border-accent-solid/30 bg-accent-solid/10 p-3'
      }
    >
      {checkedIn ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-solid/20 text-success">
          <CheckIcon className="h-5 w-5" />
        </span>
      ) : (
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-solid/20 text-accent">
          <QrIcon className="h-5 w-5" />
          {/* Pulsing ring — the one thing on the screen that's happening NOW. */}
          <span className="absolute inset-0 animate-ping rounded-full bg-accent-solid/30" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          {checkedIn
            ? neutral
              ? `${subject} is in session`
              : `You're in — ${subject}`
            : `${subject} is live now`}
        </p>
        <p className="truncate text-xs text-muted">
          {checkedIn
            ? neutral
              ? `Marked ${liveStatus}. Nothing to scan.`
              : `Checked in ${liveStatus === 'late' ? 'late' : 'on time'} · started ${timeAgo(liveSession.startedAt)}`
            : `Started ${timeAgo(liveSession.startedAt)} · scan the QR to check in`}
        </p>
      </div>

      {!checkedIn && (
        <Button
          className="shrink-0"
          onClick={() => (onScan ? onScan() : navigate('/app/attendance?scan=1'))}
        >
          Scan now
        </Button>
      )}
    </motion.div>
  )
}
