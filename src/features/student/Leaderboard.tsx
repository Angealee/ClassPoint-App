import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotStamp } from '@/components/ui/SnapshotStamp'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import type { LeaderboardEntry } from '@/lib/types'
import { useStudentData } from './StudentData'
import { StudentProfilePreview } from './StudentProfilePreview'

const TOP_N = 10
const GLOBAL = 'global'

export function Leaderboard() {
  const { loading, leaderboard, capturedAt, me, sections, sectionName } = useStudentData()
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)
  // Which board to show: the global ranking or a single section's. The snapshot
  // already carries every student + section, so a section view is just a filter
  // over `leaderboard` — no extra query.
  const [view, setView] = useState<string>(GLOBAL)

  const isGlobal = view === GLOBAL

  // Entries for the chosen view, kept in the snapshot's rank order.
  const ranked = useMemo(
    () => (isGlobal ? leaderboard : leaderboard.filter((e) => e.section_id === view)),
    [leaderboard, view, isGlobal],
  )

  const top = ranked.slice(0, TOP_N)
  // Pin the viewer's own standing if they belong to this board but sit outside the
  // visible top. Show their position *within this view* — in the global view that
  // equals their snapshot rank; in a section view it's their place in that section
  // (so it lines up with the 1..N numbering of the rows above it).
  const meIdx = me ? ranked.findIndex((e) => e.student_id === me.id) : -1
  const pinnedSelf =
    meIdx >= TOP_N ? { ...ranked[meIdx], rank: meIdx + 1 } : null

  const subtitle = isGlobal
    ? `Global · Top ${TOP_N} · tap a player to view their profile`
    : `${sectionName(view)} · tap a player to view their profile`

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted">{subtitle}</p>
          <SnapshotStamp capturedAt={capturedAt} />
        </div>
        <Select
          value={view}
          onChange={(e) => setView(e.target.value)}
          aria-label="Choose leaderboard"
          className="max-w-[8.5rem] shrink-0"
        >
          <option value={GLOBAL}>Global</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === me?.section_id ? ' (mine)' : ''}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <ListSkeleton rows={8} />
      ) : top.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {isGlobal
            ? 'No rankings yet — the board settles at 7:30 AM and 7:30 PM.'
            : `No ranked students in ${sectionName(view)} yet.`}
        </Card>
      ) : (
        <PodiumBoard
          entries={top}
          meId={me?.id}
          sectionName={sectionName}
          showSection={isGlobal}
          pinnedSelf={pinnedSelf}
          onSelect={(entry) => setSelected(entry)}
        />
      )}

      <StudentProfilePreview
        target={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        isMe={!!selected && me?.id === selected.student_id}
        sectionLabel={selected ? sectionName(selected.section_id) : ''}
      />
    </div>
  )
}
