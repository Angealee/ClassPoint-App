import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotChip } from '@/components/ui/SnapshotStamp'
import { PageHeader } from '@/components/ui/PageHeader'
import { BoardSwitcher } from '@/components/leaderboard/BoardSwitcher'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { SilentBoard } from '@/components/leaderboard/SilentBoard'
import type { LeaderboardEntry } from '@/lib/types'
import { useStudentData } from './StudentData'
import { StudentProfilePreview } from './StudentProfilePreview'

const TOP_N = 10
const GLOBAL = 'global'

export function SpendBoard() {
  const { loading, leaderboard, capturedAt, me, sections, sectionName, refresh } = useStudentData()
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)
  const [view, setView] = useState<string>(GLOBAL)

  const isGlobal = view === GLOBAL

  const ranked = useMemo(
    () =>
      leaderboard
        .filter((e) => e.spend_rank !== null && (isGlobal || e.section_id === view))
        .sort((a, b) => (a.spend_rank ?? 0) - (b.spend_rank ?? 0)),
    [leaderboard, view, isGlobal],
  )

  const top = ranked.slice(0, TOP_N)
  const meIdx = me ? ranked.findIndex((e) => e.student_id === me.id) : -1
  const meEntry = meIdx >= 0 ? ranked[meIdx] : null

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="space-y-4">
        <PageHeader
          title="Leaderboard"
          fallback="/app/leaderboard"
          subtitle={<SnapshotChip capturedAt={capturedAt} />}
        />

        {sections.length > 0 && (
          <Select
            value={view}
            onChange={(e) => setView(e.target.value)}
            aria-label="Choose spend board"
          >
            <option value={GLOBAL}>Global</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.id === me?.section_id ? ' (mine)' : ''}
              </option>
            ))}
          </Select>
        )}

        <BoardSwitcher value="spent" />

        <p className="text-xs text-muted">
          Points cashed in this semester. Spending costs you places on the other
          board, that&rsquo;s the trade.
        </p>

        {loading ? (
          <ListSkeleton rows={6} />
        ) : top.length === 0 ? (
          <SilentBoard
            detail={
              isGlobal
                ? 'Nobody has spent any points yet. Be the first one on this board.'
                : `Nobody in ${sectionName(view)} has spent any points yet.`
            }
          />
        ) : (
          <PodiumBoard
            entries={top}
            meId={me?.id}
            sectionName={sectionName}
            showSection={isGlobal}
            metric="spent"
            rankSignals={false}
            pinnedSelf={meEntry && meIdx >= TOP_N ? meEntry : null}
            onSelect={(entry) => setSelected(entry)}
          />
        )}

        {!loading && !meEntry && (
          <Card className="text-center">
            <p className="text-sm font-semibold">You&rsquo;re not on this board yet</p>
            <p className="mt-1 text-xs text-muted">
              Every point you spend puts you higher here, and lower on the other board. Pick your
              game.
            </p>
            <Link
              to="/app/points"
              className="mt-3 inline-flex items-center rounded-full bg-accent-solid/12 px-3.5 py-1.5 text-xs font-semibold text-accent"
            >
              See what points buy
            </Link>
          </Card>
        )}

        <StudentProfilePreview
          target={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          isMe={!!selected && me?.id === selected.student_id}
          sectionLabel={selected ? sectionName(selected.section_id) : ''}
        />
      </div>
    </PullToRefresh>
  )
}
