import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotChip } from '@/components/ui/SnapshotStamp'
import { PageHeader } from '@/components/ui/PageHeader'
import { BoardSwitcher } from '@/components/leaderboard/BoardSwitcher'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import type { LeaderboardEntry } from '@/lib/types'
import { useStudentData } from './StudentData'
import { StudentProfilePreview } from './StudentProfilePreview'

const TOP_N = 10
const GLOBAL = 'global'

/**
 * The spend board — who has cashed out the most points this semester (0038).
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Spending used to be pure loss. An approved redemption writes a negative
 * `point_events` row, so it drops your XP, your level and your rank, and
 * nothing showed an upside — a student who thought about it never spent, which
 * is why the rewards catalog saw so little use. This is the counterweight: a
 * second board where spending is what WINS. Two ways to be top of the class.
 *
 * ── NO QUERY OF ITS OWN ────────────────────────────────────────────────────
 * `spent_points` and `spend_rank` ride on `leaderboard_snapshot`, so the board
 * this screen renders arrived in the SAME fetch that filled the points board.
 * That is the whole reason spend lives in the snapshot rather than behind its
 * own RPC: both boards settle at the same moment and can never disagree about
 * the same student.
 */
export function SpendBoard() {
  const { loading, leaderboard, capturedAt, me, sections, sectionName, refresh } = useStudentData()
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)
  const [view, setView] = useState<string>(GLOBAL)

  const isGlobal = view === GLOBAL

  /**
   * Spenders only, in spend order.
   *
   * A null `spend_rank` means "hasn't spent anything", and that is deliberately
   * not a place at the bottom — most students will be null, and ordering a
   * ~170-way tie at zero by name would look like a ranking while meaning
   * nothing.
   */
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
      {/* Titled "Leaderboard", not "Spend board" — the switcher below names
          which one, and having the heading say it too would be the same word
          twice. It keeps a back arrow because, unlike the points board, this
          screen is not a bottom tab: you can arrive from Use points. */}
        <PageHeader
          title="Leaderboard"
          fallback="/app/leaderboard"
          subtitle={<SnapshotChip capturedAt={capturedAt} />}
          actions={
            sections.length > 0 ? (
              <Select
                value={view}
                onChange={(e) => setView(e.target.value)}
                aria-label="Choose spend board"
                className="h-9! max-w-34 shrink-0 text-sm!"
              >
                <option value={GLOBAL}>Global</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.id === me?.section_id ? ' (mine)' : ''}
                  </option>
                ))}
              </Select>
            ) : undefined
          }
        />

        <BoardSwitcher value="spent" />

        {/* One line of what this board actually measures. The points board
            needs no such caption — everyone already knows what points are. */}
        <p className="text-xs text-muted">
          Points cashed in this semester. Spending costs you places on the other
          board — that&rsquo;s the trade.
        </p>

        {loading ? (
          <ListSkeleton rows={6} />
        ) : top.length === 0 ? (
          <EmptyState>
            {isGlobal
              ? 'Nobody has spent any points yet. Be the first one on this board.'
              : `Nobody in ${sectionName(view)} has spent any points yet.`}
          </EmptyState>
        ) : (
          <PodiumBoard
            entries={top}
            meId={me?.id}
            sectionName={sectionName}
            showSection={isGlobal}
            metric="spent"
            // There is no `previous_spend_rank` — 0038 deliberately records no
            // spend history, for the same reason 0037 left `previous_rank` null
            // rather than invent movement it never observed. So no arrows, no
            // tenure flame, no climber banner on this board.
            rankSignals={false}
            // Confetti belongs to the board you climb. Landing here means you
            // gave something up, which is a different feeling.
            confetti={false}
            pinnedSelf={meEntry && meIdx >= TOP_N ? meEntry : null}
            onSelect={(entry) => setSelected(entry)}
          />
        )}

        {/* The way ON to this board, for anyone not on it. Shown once the data
            has loaded so it doesn't flash during the initial render. */}
        {!loading && !meEntry && (
          <Card className="text-center">
            <p className="text-sm font-semibold">You&rsquo;re not on this board yet</p>
            <p className="mt-1 text-xs text-muted">
              Every point you spend puts you higher here — and lower on the other board. Pick your
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
