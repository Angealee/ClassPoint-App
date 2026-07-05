import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ArrowLeftIcon } from '@/components/ui/icons'
import { AchievementCard } from '@/components/achievements/AchievementCard'
import { cn } from '@/lib/cn'
import type { AchievementCategory, AchievementState } from '@/lib/types'
import { useStudentData } from './StudentData'

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  points: 'Points & Participation',
  attendance: 'Attendance & Consistency',
  growth: 'Growth & Milestones',
  social: 'Social & Profile',
  fun: 'Fun & Secret',
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

/** The full "trophy case": every achievement, grouped by category, plus the
 * title-equip picker for whichever ones the student has unlocked. */
export function Achievements() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    me,
    achievements,
    achievementsLoading,
    achievementProgress,
    setDisplayTitle: equipTitle,
  } = useStudentData()
  const [equipping, setEquipping] = useState(false)

  const unlockedCount = achievements.filter((a) => a.unlockedAt).length
  const grouped = useMemo(() => {
    const map = new Map<AchievementCategory, AchievementState[]>()
    for (const a of achievements) {
      const list = map.get(a.category) ?? []
      list.push(a)
      map.set(a.category, list)
    }
    return map
  }, [achievements])

  const unlockedTitles = achievements.filter((a) => a.unlockedAt && a.titleText)

  async function onEquip(title: string | null) {
    setEquipping(true)
    const { error } = await equipTitle(title)
    setEquipping(false)
    if (error) toast(error, 'error')
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/app/profile')}
          aria-label="Back to profile"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold">Achievements</h1>
          <p className="text-sm text-muted">{unlockedCount} / {achievements.length} unlocked</p>
        </div>
      </div>

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
                    ? 'border-gold-400 bg-gold-400/15 text-gold-700 dark:text-gold-300'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                {a.titleText}
              </button>
            ))}
          </div>
        </Card>
      )}

      {achievementsLoading ? (
        <Card className="h-64 animate-pulse bg-card-2" />
      ) : (
        CATEGORY_ORDER.map((cat) => {
          const list = grouped.get(cat)
          if (!list || list.length === 0) return null
          return (
            <div key={cat}>
              <h2 className="mb-2 px-1 text-sm font-semibold text-muted">{CATEGORY_LABELS[cat]}</h2>
              <Card className="divide-y divide-line">
                {list.map((a) => (
                  <AchievementCard key={a.code} achievement={a} progress={achievementProgress} />
                ))}
              </Card>
            </div>
          )
        })
      )}

      <Button variant="ghost" className="w-full text-muted" onClick={() => navigate('/app/profile')}>
        Back to profile
      </Button>
    </div>
  )
}
