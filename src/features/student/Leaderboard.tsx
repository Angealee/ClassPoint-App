import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotStamp } from '@/components/ui/SnapshotStamp'
import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import type { LeaderboardEntry } from '@/lib/types'
import { useStudentData } from './StudentData'
import { StudentProfilePreview } from './StudentProfilePreview'

const TOP_N = 10
const rankStyles = ['text-gold-400', 'text-zinc-400', 'text-amber-700']

export function Leaderboard() {
  const { loading, leaderboard, capturedAt, me, sectionName } = useStudentData()
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)

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
        <p className="text-sm text-muted">Global · Top {TOP_N} · tap anyone to view their profile</p>
        <SnapshotStamp capturedAt={capturedAt} />
      </div>

      {loading ? (
        <ListSkeleton rows={8} />
      ) : top.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No rankings yet — the board settles at 7:30 AM and 7:30 PM.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <motion.div className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {top.map((entry, i) => (
                <Row
                  key={entry.student_id}
                  entry={entry}
                  index={i}
                  isMe={me?.id === entry.student_id}
                  sectionLabel={sectionName(entry.section_id)}
                  onSelect={() => setSelected(entry)}
                />
              ))}
            </AnimatePresence>
          </motion.div>

          {pinnedSelf && (
            <div className="border-t border-line">
              <p className="px-4 pt-2 text-center text-[0.65rem] uppercase tracking-wider text-muted">
                your standing
              </p>
              <Row
                entry={pinnedSelf}
                index={pinnedSelf.rank - 1}
                isMe
                sectionLabel={sectionName(pinnedSelf.section_id)}
                onSelect={() => setSelected(pinnedSelf)}
              />
            </div>
          )}
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
  )
}

function Row({
  entry,
  index,
  isMe,
  sectionLabel,
  onSelect,
}: {
  entry: LeaderboardEntry
  index: number
  isMe: boolean
  sectionLabel: string
  onSelect: () => void
}) {
  const level = getLevelProgress(entry.lifetime_points).level
  return (
    <motion.button
      type="button"
      layout
      onClick={onSelect}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      whileTap={{ scale: 0.985 }}
      aria-label={`View ${entry.display_name}'s profile`}
      className={cn(
        'flex w-full items-center gap-3 p-4 text-left transition-colors',
        'hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40',
        isMe && 'bg-brand-500/5',
      )}
    >
      <span
        className={cn(
          'w-7 text-center font-display text-lg font-bold',
          rankStyles[entry.rank - 1] ?? 'text-muted',
        )}
      >
        {entry.rank}
      </span>
      <Avatar name={entry.display_name} url={entry.avatar_url} />
      <span className="block min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {entry.display_name} {isMe && <span className="text-brand-500">(you)</span>}
        </span>
        <span className="block text-xs text-muted">
          {sectionLabel} · Lv {level}
        </span>
      </span>
      <span className="font-display text-base font-bold text-gold-600 dark:text-gold-400">
        {entry.lifetime_points}
      </span>
    </motion.button>
  )
}
