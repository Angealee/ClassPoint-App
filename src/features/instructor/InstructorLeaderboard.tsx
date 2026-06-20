import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { SnapshotStamp } from '@/components/ui/SnapshotStamp'
import { useInstructor } from './InstructorLayout'
import { getLeaderboardSnapshot } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import type { LeaderboardEntry } from '@/lib/types'

const rankColor = ['text-gold-400', 'text-zinc-400', 'text-amber-700']

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
        <Card className="overflow-hidden">
          <motion.div className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {visible.map((r, i) => {
                const level = getLevelProgress(r.lifetime_points).level
                return (
                  <motion.div
                    key={r.student_id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="flex items-center gap-3 p-3.5"
                  >
                    <span
                      className={cn(
                        'w-7 text-center font-display text-lg font-bold',
                        rankColor[r.rank - 1] ?? 'text-muted',
                      )}
                    >
                      {r.rank}
                    </span>
                    <Avatar name={r.display_name} url={r.avatar_url} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.display_name}</p>
                      <p className="text-xs text-muted">
                        {sectionName(r.section_id)} · Lv {level}
                      </p>
                    </div>
                    <span className="font-display text-base font-bold text-gold-600 dark:text-gold-400">
                      {r.lifetime_points}
                    </span>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </motion.div>
        </Card>
      )}
    </div>
  )
}
