import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotChip } from '@/components/ui/SnapshotStamp'
import { ShareIcon, TrophyIcon } from '@/components/ui/icons'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { CommentsOverlay } from '@/components/leaderboard/CommentsOverlay'
// The profile-preview sheet is generic (loads any student's public profile);
// reused here so the instructor can tap a ranked student just like students can.
import { StudentProfilePreview } from '@/features/student/StudentProfilePreview'
import { useInstructor } from './InstructorLayout'
import { getLeaderboardSnapshot } from '@/lib/api'
import type { LeaderboardComment, LeaderboardEntry } from '@/lib/types'

// Only pulled in once Share is tapped — see the student board for the rationale.
const ShareSheet = lazy(() =>
  import('@/components/leaderboard/ShareSheet').then((m) => ({ default: m.ShareSheet })),
)

export function InstructorLeaderboard() {
  const { sections } = useInstructor()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [capturedAt, setCapturedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMounted, setShareMounted] = useState(false)

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

  /** Open a commenter's profile from the full snapshot (all sections). */
  function openCommenter(c: LeaderboardComment) {
    if (!c.studentId) return
    const entry = entries.find((e) => e.student_id === c.studentId)
    setSelected(
      entry ?? {
        student_id: c.studentId,
        display_name: c.displayName,
        section_id: '',
        lifetime_points: 0,
        avatar_url: c.avatarUrl,
        rank: 0,
      },
    )
  }

  const visible = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.section_id === filter)),
    [entries, filter],
  )

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold leading-tight">Leaderboard</h1>
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-36 shrink-0"
          >
            <option value="all">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-card-2 px-2.5 py-1 text-xs font-semibold text-muted">
            <TrophyIcon className="h-3.5 w-3.5" />
            {filter === 'all' ? 'All sections' : sectionName(filter)}
          </span>
          <SnapshotChip capturedAt={capturedAt} />
          {visible.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setShareMounted(true)
                setShareOpen(true)
              }}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-500 transition-opacity hover:opacity-80"
            >
              <ShareIcon className="h-3.5 w-3.5" /> Share
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={8} />
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {entries.length === 0
            ? 'No rankings yet — the board settles at 12:30 PM and 7:30 PM.'
            : 'No students in this section yet.'}
        </Card>
      ) : (
        <CommentsOverlay isInstructor onOpenProfile={openCommenter}>
          <PodiumBoard
            entries={visible}
            sectionName={sectionName}
            showSection={filter === 'all'}
            onSelect={(entry) => setSelected(entry)}
            confetti={false}
          />
        </CommentsOverlay>
      )}

      <StudentProfilePreview
        target={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        sectionLabel={selected ? sectionName(selected.section_id) : ''}
      />

      {shareMounted && (
        <Suspense fallback={null}>
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            entries={visible}
            scopeLabel={filter === 'all' ? 'All sections' : sectionName(filter)}
            capturedAt={capturedAt}
          />
        </Suspense>
      )}
    </div>
  )
}
