import { EmptyState } from '@/components/ui/EmptyState'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { AchievementCard } from '@/components/achievements/AchievementCard'
import { AchievementDetailSheet } from './AchievementDetailSheet'
import { getAchievementRarity } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { AchievementCategory, AchievementRarity, AchievementState } from '@/lib/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { useStudentData } from './StudentData'

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  points: 'Points & Participation',
  attendance: 'Attendance & Consistency',
  growth: 'Growth & Milestones',
  social: 'Social & Profile',
  fun: 'Fun & Secret',
  recognition: 'Recognition',
}

const CATEGORY_SHORT: Record<AchievementCategory, string> = {
  points: 'Points',
  attendance: 'Attendance',
  growth: 'Growth',
  social: 'Social',
  fun: 'Fun',
  recognition: 'Recognition',
}

const CATEGORY_ORDER: AchievementCategory[] = [
  'points',
  'attendance',
  'growth',
  'social',
  'fun',
  'recognition',
]

type CategoryFilter = AchievementCategory | 'all'
type StatusFilter = 'all' | 'unlocked' | 'locked'

/** A pill toggle used by the category + status filter rows. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-brand-500 bg-brand-500/10 text-brand-500'
          : 'border-line text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/** The full "trophy case": every achievement, grouped by category, plus the
 * title-equip picker for whichever ones the student has unlocked. */
export function Achievements() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    me,
    achievements,
    achievementsLoading,
    achievementsError,
    retryAchievements,
    achievementProgress,
    setDisplayTitle: equipTitle,
    markAchievementsSeen,
  } = useStudentData()
  const [equipping, setEquipping] = useState(false)
  const [catFilter, setCatFilter] = useState<CategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [detail, setDetail] = useState<AchievementState | null>(null)
  const [rarity, setRarity] = useState<Map<string, AchievementRarity> | null>(null)

  // Viewing the trophy case clears the "new badge" nudge dot.
  useEffect(() => {
    markAchievementsSeen()
  }, [markAchievementsSeen])

  // Rarity is class-wide, so fetch it once for the whole page and share it
  // across every detail sheet.
  useEffect(() => {
    getAchievementRarity().then(setRarity).catch(() => {})
  }, [])

  const unlockedCount = achievements.filter((a) => a.unlockedAt).length
  const filtered = useMemo(
    () =>
      achievements.filter(
        (a) =>
          (catFilter === 'all' || a.category === catFilter) &&
          (statusFilter === 'all' ||
            (statusFilter === 'unlocked' ? !!a.unlockedAt : !a.unlockedAt)),
      ),
    [achievements, catFilter, statusFilter],
  )
  const grouped = useMemo(() => {
    const map = new Map<AchievementCategory, AchievementState[]>()
    for (const a of filtered) {
      const list = map.get(a.category) ?? []
      list.push(a)
      map.set(a.category, list)
    }
    return map
  }, [filtered])

  const unlockedTitles = achievements.filter((a) => a.unlockedAt && a.titleText)

  async function onEquip(title: string | null) {
    setEquipping(true)
    const { error } = await equipTitle(title)
    setEquipping(false)
    if (error) toast(error, 'error')
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Back is history-aware: arriving from Home used to dump you on Profile,
          a screen you had never visited. Profile stays the cold-start fallback. */}
      <PageHeader
        title="Achievements"
        subtitle={`${unlockedCount} / ${achievements.length} unlocked`}
        fallback="/app/profile"
      />

      {unlockedTitles.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Your titles</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEquip(null)}
              disabled={equipping}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                !me?.display_title
                  ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                  : 'border-line text-muted hover:text-ink',
              )}
            >
              None
            </button>
            {unlockedTitles.map((a) => (
              <button
                key={a.code}
                type="button"
                onClick={() => onEquip(a.titleText)}
                disabled={equipping}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  me?.display_title === a.titleText
                    ? 'border-gold-400 bg-gold-400/15 text-warn'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                {a.titleText}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Filters — narrow a 30-badge list by category and unlock status. */}
      {!achievementsLoading && achievements.length > 0 && (
        <div className="space-y-2">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <FilterChip active={catFilter === 'all'} onClick={() => setCatFilter('all')}>
              All
            </FilterChip>
            {CATEGORY_ORDER.map((c) => (
              <FilterChip key={c} active={catFilter === c} onClick={() => setCatFilter(c)}>
                {CATEGORY_SHORT[c]}
              </FilterChip>
            ))}
          </div>
          <div className="flex gap-2">
            {(['all', 'unlocked', 'locked'] as const).map((s) => (
              <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {s === 'all' ? 'All' : s === 'unlocked' ? 'Unlocked' : 'Locked'}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {achievementsLoading ? (
        <Card pad="none" className="h-64 animate-pulse bg-card-2" />
      ) : achievementsError ? (
        /* Without this the failed load left an empty catalog, which hid the
           filters above and then said "try a different filter" — with no
           filters on screen and no way out but reloading the app. */
        <Card className="p-6 text-center">
          <p className="text-sm text-brand-500">Couldn’t load your badges.</p>
          <p className="mt-1 text-xs text-muted">Nothing is lost — this is just the connection.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={retryAchievements}>
            Try again
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState>Nothing here — try a different filter.</EmptyState>
      ) : (
        CATEGORY_ORDER.map((cat) => {
          const list = grouped.get(cat)
          if (!list || list.length === 0) return null
          return (
            <div key={cat}>
              <h2 className="mb-2 px-1 text-sm font-semibold text-muted">{CATEGORY_LABELS[cat]}</h2>
              <Card pad="none" className="divide-y divide-line">
                {list.map((a) => (
                  <AchievementCard
                    key={a.code}
                    achievement={a}
                    progress={achievementProgress}
                    onClick={() => setDetail(a)}
                  />
                ))}
              </Card>
            </div>
          )
        })
      )}

      <Button variant="ghost" className="w-full text-muted" onClick={() => navigate('/app/profile')}>
        Back to profile
      </Button>

      <AchievementDetailSheet
        achievement={detail}
        progress={achievementProgress}
        rarity={rarity}
        open={!!detail}
        onClose={() => setDetail(null)}
      />
    </div>
  )
}
