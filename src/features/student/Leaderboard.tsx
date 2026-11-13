import { RankDeltaValue, rankDelta } from '@/components/leaderboard/RankSignals'
import { BoardSwitcher } from '@/components/leaderboard/BoardSwitcher'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotChip } from '@/components/ui/SnapshotStamp'
import { ShareIcon } from '@/components/ui/icons'
import { IconButton } from '@/components/ui/IconButton'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { SilentBoard } from '@/components/leaderboard/SilentBoard'
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
const PAST = '__past__'

const ShareSheet = lazy(() =>
  import('@/components/leaderboard/ShareSheet').then((m) => ({ default: m.ShareSheet })),
)

export function Leaderboard() {
  const { loading, leaderboard, capturedAt, me, sections, sectionName, refresh } = useStudentData()
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [pastOpen, setPastOpen] = useState(false)
  const [shareMounted, setShareMounted] = useState(false)
  // In the URL so coming back from the spend board keeps the section you were on.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') ?? GLOBAL
  const setView = (v: string) =>
    setSearchParams(v === GLOBAL ? {} : { view: v }, { replace: true })

  const isGlobal = view === GLOBAL

  const ranked = useMemo(
    () => (isGlobal ? leaderboard : leaderboard.filter((e) => e.section_id === view)),
    [leaderboard, view, isGlobal],
  )

  const top = ranked.slice(0, TOP_N)
  const silent = top.length === 0 || top.every((e) => e.points === 0)
  const meIdx = me ? ranked.findIndex((e) => e.student_id === me.id) : -1
  const meEntry = meIdx >= 0 ? ranked[meIdx] : null

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
        spent_points: 0,
        spend_rank: null,
        previous_rank: null,
        rank_since: new Date().toISOString(),
        rank: 0,
      },
    )
  }
  const myPos = meIdx + 1
  const localDelta = useRankDelta(me?.id, view, capturedAt, meEntry ? myPos : null)

  const shadowRank = useMemo(() => {
    if (!meEntry || meEntry.spent_points <= 0) return null
    const would = meEntry.points + meEntry.spent_points
    const ahead = ranked.filter(
      (e) =>
        e.student_id !== meEntry.student_id &&
        (e.points > would || (e.points === would && e.display_name < meEntry.display_name)),
    ).length
    const pos = ahead + 1
    return pos < myPos ? pos : null
  }, [ranked, meEntry, myPos])
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
      <div className="space-y-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-bold leading-tight">Leaderboard</h1>
            <div className="mt-0.5">
              <SnapshotChip capturedAt={capturedAt} />
            </div>
          </div>
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

        <Select
          value={view}
          onChange={(e) => {
            if (e.target.value === PAST) {
              setPastOpen(true)
              return
            }
            setView(e.target.value)
          }}
          aria-label="Choose leaderboard"
        >
          <option value={GLOBAL}>Global</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === me?.section_id ? ' (mine)' : ''}
            </option>
          ))}
          <optgroup label="Archive">
            <option value={PAST}>Past semesters…</option>
          </optgroup>
        </Select>
        {/* Which of the two boards this is (0038). */}
        <BoardSwitcher value="points" />
      </div>

      {loading ? (
        <ListSkeleton rows={8} />
      ) : (
        <CommentsOverlay studentId={me?.id} onOpenProfile={openCommenter}>
          {silent ? (
            <SilentBoard
              detail={
                isGlobal
                  ? 'The first points of the semester wake it up. It settles at 12:30 PM and 7:30 PM.'
                  : `Nobody in ${sectionName(view)} has points yet.`
              }
            />
          ) : (
            <PodiumBoard
              entries={top}
              meId={me?.id}
              sectionName={sectionName}
              showSection={isGlobal}
              rankSignals={isGlobal}
              onSelect={(entry) => setSelected(entry)}
            />
          )}
        </CommentsOverlay>
      )}

      {!loading && !silent && meEntry && (
        <YourRankCard
          entry={meEntry}
          position={myPos}
          delta={delta}
          toNext={toNext}
          shadowRank={shadowRank}
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

function YourRankCard({
  entry,
  position,
  delta,
  toNext,
  shadowRank,
  sectionLabel,
  onClick,
}: {
  entry: LeaderboardEntry
  position: number
  delta: number | null
  toNext: { pts: number; pos: number } | null
  shadowRank: number | null
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
        'bg-gradient-to-br from-plate-2 to-plate shadow-lg shadow-black/25 ring-1 ring-white/10',
      )}
    >
      <div className="relative p-4">
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
            {shadowRank !== null && (
              <p className="mt-1.5 text-2xs text-white/55">
                You&rsquo;d be <span className="font-semibold text-white/80">#{shadowRank}</span> if
                you hadn&rsquo;t spent
              </p>
            )}
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
    let stored: { capturedAt: string; rank: number; prevRank: number | null } | null
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
