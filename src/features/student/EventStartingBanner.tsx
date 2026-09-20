import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { BoltIcon, CheckIcon } from '@/components/ui/icons'
import { useStudentData } from './StudentData'

/**
 * "An event is starting" (0055) — the GLOBAL check-in banner on Home.
 *
 * Unlike the live-class banner it is NOT section-scoped: a single event_sessions
 * subscription on the durable channel drives it for every student. The whole
 * card is the tap target (req: "tapping it redirects to the Event screen"), so
 * the CTA is a decorative pill, not a nested button. Renders nothing when no
 * event is running, so it mounts unconditionally. Gold, not the class banner's
 * red — an event is points to earn, not a class to attend.
 */
export function EventStartingBanner() {
  const { liveEvent, liveEventChecked, semesterEnded } = useStudentData()
  const navigate = useNavigate()
  // A rollover-edge student (their section moved to a past semester) is refused
  // by scan_event_attendance anyway — don't dangle a banner they can't act on.
  if (!liveEvent || semesterEnded) return null

  const reward = liveEvent.pointsPerScan > 0 ? ` · +${liveEvent.pointsPerScan} pts` : ''

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/app/event')}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label={liveEventChecked ? 'You are checked in to the event' : 'Scan to check in to the event'}
      className={
        liveEventChecked
          ? 'flex w-full items-center gap-3 rounded-2xl border border-success-solid/30 bg-success-solid/10 p-3 text-left'
          : 'flex w-full items-center gap-3 rounded-2xl border border-reward-solid/40 bg-reward-solid/10 p-3 text-left'
      }
    >
      {liveEventChecked ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-solid/20 text-success">
          <CheckIcon className="h-5 w-5" />
        </span>
      ) : (
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-reward-solid/20 text-reward">
          <BoltIcon className="h-5 w-5" />
          {/* Pulsing ring — the one thing on the screen happening NOW. */}
          <span className="absolute inset-0 animate-ping rounded-full bg-reward-solid/30" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          {liveEventChecked
            ? `You're in — ${liveEvent.name}`
            : `Event is starting: ${liveEvent.name}`}
        </p>
        <p className="truncate text-xs text-muted">
          {liveEventChecked ? 'Checked in. Nice.' : `Tap to scan and check in${reward}`}
        </p>
      </div>

      {!liveEventChecked && (
        <span className="shrink-0 rounded-xl bg-accent-solid px-4 py-2 text-sm font-semibold text-white">
          Scan
        </span>
      )}
    </motion.button>
  )
}
