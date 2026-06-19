import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { useInstructor } from './InstructorLayout'
import { listLeaderboard } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import type { LeaderboardRow } from '@/lib/types'

const rankColor = ['text-gold-400', 'text-zinc-400', 'text-amber-700']

export function InstructorLeaderboard() {
  const { sections } = useInstructor()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    listLeaderboard()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  const sectionName = (id: string) => sections.find((s) => s.id === id)?.name ?? ''

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.section_id === filter)),
    [rows, filter],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted">Ranked by total points</p>
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
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No students yet.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {visible.map((r, i) => {
            const level = getLevelProgress(r.lifetime_points).level
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className="flex items-center gap-3 p-3.5"
              >
                <span className={cn('w-7 text-center font-display text-lg font-bold', rankColor[i] ?? 'text-muted')}>
                  {i + 1}
                </span>
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
        </Card>
      )}
    </div>
  )
}
