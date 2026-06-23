import { Card } from '@/components/ui/Card'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotStamp } from '@/components/ui/SnapshotStamp'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { useStudentData } from './StudentData'

const TOP_N = 10

export function Leaderboard() {
  const { loading, leaderboard, capturedAt, me, sectionName } = useStudentData()

  // For now we only show the global Top 10. The snapshot already carries every
  // student + section, so future views (own-section, a chosen section) are just
  // a different filter over `leaderboard` — no new query needed.
  const top = leaderboard.slice(0, TOP_N)
  const meEntry = me ? leaderboard.find((e) => e.student_id === me.id) : undefined
  const pinnedSelf = meEntry && !top.some((e) => e.student_id === me?.id) ? meEntry : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-muted">Global · Top {TOP_N}</p>
        <SnapshotStamp capturedAt={capturedAt} />
      </div>

      {loading ? (
        <ListSkeleton rows={8} />
      ) : top.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No rankings yet — the board settles at 7:30 AM and 7:30 PM.
        </Card>
      ) : (
        <PodiumBoard
          entries={top}
          meId={me?.id}
          sectionName={sectionName}
          showSection
          pinnedSelf={pinnedSelf}
        />
      )}
    </div>
  )
}
