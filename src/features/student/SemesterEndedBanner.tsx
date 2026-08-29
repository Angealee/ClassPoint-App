import { Card } from '@/components/ui/Card'
import { useStudentData } from './StudentData'

/**
 * "This semester has ended" (0035).
 *
 * A student whose section wasn't carried into the new semester keeps their
 * whole account — points, level, badges, attendance record, final rank — but
 * nothing can change any more, and `scan_attendance` refuses their check-ins
 * server-side.
 *
 * The instructor chose read-only over a lock-out screen deliberately: a
 * student may still need their attendance record if a grade is questioned, and
 * their final rank is a keepsake, not clutter.
 *
 * Renders nothing while the semester is live, so hosts can mount it freely.
 */
export function SemesterEndedBanner() {
  const { semesterEnded } = useStudentData()
  if (!semesterEnded) return null

  return (
    <Card className="border-gold-400/30 bg-gold-400/10 p-4">
      <p className="font-display text-sm font-bold text-reward">
        This semester has ended
      </p>
      <p className="mt-1 text-xs text-muted">
        Your points, badges and attendance record are all still here — they just
        don't change any more. If you're continuing next semester, your
        instructor will move you across and you'll start fresh.
      </p>
    </Card>
  )
}
