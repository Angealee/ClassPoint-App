import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotStamp } from '@/components/ui/SnapshotStamp'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { useInstructor } from './InstructorLayout'
import { getLeaderboardSnapshot } from '@/lib/api'
import type { LeaderboardEntry } from '@/lib/types'

export function InstructorLeaderboard() {
  const { sections } = useInstructor()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [capturedAt, setCapturedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    getLeaderboardSnapshot()
      .then((snap) => {
        setEntries(snap.entries)
        setCapturedAt(snap.capturedAt)
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  const sectionName = (id: string) => sections.find((s) => s.id === id)?.name ?? ''

  const visible = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.section_id === filter)),
    [entries, filter],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Leaderboard</h1>
          <SnapshotStamp capturedAt={capturedAt} />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-[9rem]">
          <option value="all">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <ListSkeleton rows={8} />
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {entries.length === 0
            ? 'No rankings yet — the board settles at 7:30 AM and 7:30 PM.'
            : 'No students in this section yet.'}
        </Card>
      ) : (
        <PodiumBoard
          entries={visible}
          sectionName={sectionName}
          showSection={filter === 'all'}
        />
      )}
    </div>
  )
}
