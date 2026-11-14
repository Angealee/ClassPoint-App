import { Card } from '@/components/ui/Card'
import { useStudentData } from './StudentData'

export function SemesterEndedBanner() {
  const { semesterEnded } = useStudentData()
  if (!semesterEnded) return null

  return (
    <Card className="border-gold-400/30 bg-gold-400/10 p-4">
      <p className="font-display text-sm font-bold text-reward">
        This semester has ended
      </p>
      <p className="mt-1 text-xs text-muted">
        Your points, badges and attendance record are all still here, they just
        don't change any more. If you're continuing next semester, your
        instructor will move you across and you'll start fresh.
      </p>
    </Card>
  )
}
