import { RankDeltaValue, rankDelta } from '@/components/leaderboard/RankSignals'
import { EmptyState } from '@/components/ui/EmptyState'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotChip } from '@/components/ui/SnapshotStamp'
import { ShareIcon } from '@/components/ui/icons'
import { IconButton } from '@/components/ui/IconButton'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { CommentsOverlay } from '@/components/leaderboard/CommentsOverlay'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import type { LeaderboardComment, LeaderboardEntry } from '@/lib/types'
import { PastSemesterBoard } from './PastSemesterBoard'
import { useStudentData } from './StudentData'
import { StudentProfilePreview } from './StudentProfilePreview'

const TOP_N = 10
const GLOBAL = 'global'

// The share card + its capture path are only needed once someone actually taps
// Share, so they stay out of the leaderboard's own chunk.
const ShareSheet = lazy(() =>
  import('@/components/leaderboard/ShareSheet').then((m) => ({ default: m.ShareSheet })),
)

export function Leaderboard() {
  const { loading, leaderboard, capturedAt, me, sections, sectionName, refresh } = useStudentData()
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [pastOpen, setPastOpen] = useState(false)
  // Sticky once opened, so the sheet keeps its close animation instead of
  // being yanked out of the tree the moment it's dismissed.
  const [shareMounted, setShareMounted] = useState(false)
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
  const meIdx = me ? ranked.findIndex((e) => e.student_id === me.id) : -1
  const meEntry = meIdx >= 0 ? ranked[meIdx] : null

  /** Open a commenter's profile. Look them up in the FULL snapshot (not just the
   *  filtered view) so a sender from another section still resolves; fall back
   *  to a minimal target for anyone unranked. */
  function openCommenter(c: LeaderboardComment) {
    if (!c.studentId) return
    const entry = leaderboard.find((e) => e.student_id === c.studentId)
    setSelected(
      entry ?? {
        student_id: c.studentId,
        display_name: c.displayName,
        section_id: '',
        points: 0,
        avatar_url: c.avatarUrl,
        // Unranked: no movement to report and no run to time, which is exactly
        // what makes both rank signals render nothing for this target.
        previous_rank: null,
        rank_since: new Date().toISOString(),
        rank: 0,
      },
    )
  }
  // Position within the current view: in the global view this is the snapshot
  // rank; in a section view it's the place within that section.
  const myPos = meIdx + 1
  /**
   * Rank movement had TWO sources that could disagree on the same screen: the
   * database's `previous_rank` (0037, server-computed, the same number the board
   * rows show) and this component's own localStorage tracker.
   *
   * The database wins wherever it can answer — that is the global view, where
   * `myPos` IS the snapshot rank. It is authoritative, survives a new device,
   * and cannot contradict the arrow on the student's own row above it.
   *
   * The local tracker stays for the two cases the database genuinely cannot
   * answer: a SECTION view, where rows are renumbered by position within the
   * section and no per-section previous rank exists, and a client running ahead
   * of migration 0037, where `previous_rank` is null for everyone.
   */
  const localDelta = useRankDelta(me?.id, view, capturedAt, meEntry ? myPos : null)
  const dbDelta = isGlobal && meEntry ? rankDelta(meEntry) : null
  const delta = dbDelta ?? localDelta

  // Gap to the rank directly above — the next spot to chase.
  const above = meEntry && meIdx > 0 ? ranked[meIdx - 1] : null
  const toNext =
    above && meEntry
      ? { pts: Math.max(0, above.points - meEntry.points), pos: meIdx }
      : null

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="space-y-4">
      {/* Header, tightened. The scope chip that used to sit on the second row
          ("Top 10" / the section name) said the same thing as the picker beside
          it, so it is gone and Share moved up to join them. That reclaims a row
          — which matters more now comments fly in front of the board. */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold leading-tight">
            Leaderboard
          </h1>
          <Select
            value={view}
            onChange={(e) => setView(e.target.value)}
            aria-label="Choose leaderboard"
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
          {top.length > 0 && (
            <IconButton
              label="Share the board"
              variant="accent"
              onClick={() => {
                setShareMounted(true)
                setShareOpen(true)
              }}
              icon={<ShareIcon className="h-4.5 w-4.5" />}
            />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <SnapshotChip capturedAt={capturedAt} />
          {/* Past boards (0035). Always available, but it's the students whose
              own semester ended who most need it — their final rank is the one
              thing the live board can no longer show them. */}
          <button
            type="button"
            onClick={() => setPastOpen(true)}
            className="inline-flex shrink-0 items-center rounded-full bg-card-2 px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            Past boards
          </button>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={8} />
      ) : top.length === 0 ? (
        <EmptyState>{isGlobal
            ? 'No rankings yet — the board settles at 12:30 PM and 7:30 PM.'
            : `No ranked students in ${sectionName(view)} yet.`}</EmptyState>
      ) : (
        <CommentsOverlay studentId={me?.id} onOpenProfile={openCommenter}>
          <PodiumBoard
            entries={top}
            meId={me?.id}
            sectionName={sectionName}
            showSection={isGlobal}
            // Global view only: rows are renumbered by section position in a
            // filtered view, and previous_rank/rank_since describe the whole
            // board — mixing them would put a movement arrow on a row that
            // didn't move on screen.
            rankSignals={isGlobal}
            onSelect={(entry) => setSelected(entry)}
          />
        </CommentsOverlay>
      )}

      {/* Your standing — pinned at the bottom so the board leads, not your row. */}
      {!loading && meEntry && (
        <YourRankCard
          entry={meEntry}
          position={myPos}
          delta={delta}
          toNext={toNext}
          sectionLabel={sectionName(meEntry.section_id)}
          onClick={() => setSelected(meEntry)}
        />
      )}

      <StudentProfilePreview
        target={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        isMe={!!selected && me?.id === selected.student_id}
        sectionLabel={selected ? sectionName(selected.section_id) : ''}
      />

      {shareMounted && (
        <Suspense fallback={null}>
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            entries={ranked}
            meId={me?.id}
            myPos={meEntry ? myPos : null}
            myPoints={meEntry?.points ?? null}
            scopeLabel={isGlobal ? 'Global' : sectionName(view)}
            capturedAt={capturedAt}
          />
        </Suspense>
      )}

      <PastSemesterBoard open={pastOpen} onClose={() => setPastOpen(false)} />
      </div>
    </PullToRefresh>
  )
}

/** The viewer's own standing, pinned at the bottom of the board. Tap to open. */
function YourRankCard({
  entry,
  position,
  delta,
  toNext,
  sectionLabel,
  onClick,
}: {
  entry: LeaderboardEntry
  position: number
  delta: number | null
  toNext: { pts: number; pos: number } | null
  sectionLabel: string
  onClick: () => void
}) {
  const level = getLevelProgress(entry.points).level
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="View your profile"
      className={cn(
        'block w-full overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.99]',
        // The same plate as the home scoreboard, and for the same reason: this
        // is the one thing on the board that is about YOU, so it should read as
        // an object rather than as another row. It also makes the two screens
        // feel like one app.
        'bg-gradient-to-br from-plate-2 to-plate shadow-lg shadow-black/25 ring-1 ring-white/10',
      )}
    >
      <div className="relative p-4">
        {/* Gold bloom behind the rank, echoing the home hero. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-8 -top-12 h-36 w-36 rounded-full bg-gold-400/12 blur-3xl"
        />

        <div className="relative flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-widest text-white/60">
              Your rank
            </p>
            <p className="flex items-baseline gap-2 font-display text-5xl font-bold leading-none text-white">
              <span className="tabular-nums">#{position}</span>
              <RankDeltaValue delta={delta} verbose />
            </p>
          </div>

          <div className="min-w-0 text-right">
            <p className="text-2xs font-semibold uppercase tracking-widest text-white/60">
              Points
            </p>
            <p className="font-display text-3xl font-bold leading-none tabular-nums text-gold-300">
              {entry.points}
            </p>
          </div>
        </div>

        {/* The gap is the bridge between the two figures above — what it would
            take to move. Same idea as the home screen's next milestone. */}
        <div className="relative mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
          <Avatar
            name={entry.display_name}
            url={entry.avatar_url}
            className="h-9! w-9! shrink-0 ring-2 ring-white/15"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{entry.display_name}</p>
            <p className="truncate text-2xs text-white/55">
              {sectionLabel} · Lv {level}
            </p>
          </div>
          <p className="shrink-0 text-right text-2xs font-semibold text-white/85">
            {toNext
              ? toNext.pts > 0
                ? `${toNext.pts} to #${toNext.pos}`
                : `Tied with #${toNext.pos}`
              : 'Top of the board'}
          </p>
        </div>
      </div>
    </button>
  )
}

/**
 * How the viewer moved since the *previous* settle, for the current view.
 * Tracks per (student, view) in localStorage: when the snapshot's captured_at
 * advances we compute (old position − new position) — positive means climbed —
 * and remember it until the next settle so the arrow is stable between visits.
 */
function useRankDelta(
  studentId: string | undefined,
  view: string,
  capturedAt: string | null,
  currentPos: number | null,
): number | null {
  const [delta, setDelta] = useState<number | null>(null)
  useEffect(() => {
    if (!studentId || currentPos == null || !capturedAt) {
      setDelta(null)
      return
    }
    const key = `cp_rank_track_${studentId}_${view}`
    let stored: { capturedAt: string; rank: number; prevRank: number | null } | null = null
    try {
      stored = JSON.parse(localStorage.getItem(key) ?? 'null')
    } catch {
      stored = null
    }
    if (!stored) {
      setDelta(null)
      localStorage.setItem(key, JSON.stringify({ capturedAt, rank: currentPos, prevRank: null }))
      return
    }
    if (stored.capturedAt !== capturedAt) {
      const moved = stored.rank - currentPos
      setDelta(moved)
      localStorage.setItem(
        key,
        JSON.stringify({ capturedAt, rank: currentPos, prevRank: stored.rank }),
      )
    } else {
      setDelta(stored.prevRank != null ? stored.prevRank - stored.rank : null)
    }
  }, [studentId, view, capturedAt, currentPos])
  return delta
}
