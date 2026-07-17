import { Sheet } from '@/components/ui/Sheet'
import { BadgeArt } from '@/components/achievements/BadgeArt'
import { cn } from '@/lib/cn'
import { ACHIEVEMENT_FLAVOR } from './achievementFlavor'
import type {
  AchievementCategory,
  AchievementProgress,
  AchievementRarity,
  AchievementState,
} from '@/lib/types'

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  points: 'Points & Participation',
  attendance: 'Attendance & Consistency',
  growth: 'Growth & Milestones',
  social: 'Social & Profile',
  fun: 'Fun & Secret',
  recognition: 'Recognition',
}

type Tier = { label: string; cls: string }

/** Rarity tiers (the user's pick): <10% Legendary, <30% Rare, else Common. */
function tierFor(pct: number): Tier {
  if (pct < 10) return { label: '✦ Legendary', cls: 'bg-gold-400/15 text-gold-700 dark:text-gold-300' }
  if (pct < 30) return { label: 'Rare', cls: 'bg-brand-500/10 text-brand-600 dark:text-brand-400' }
  return { label: 'Common', cls: 'bg-card-2 text-muted' }
}

const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function progressLine(a: AchievementState, progress: AchievementProgress | null): string | null {
  if (a.unlockedAt || !a.metric || a.threshold == null) return null
  const value = progress?.[a.metric] ?? null
  if (a.metric === 'rank') {
    return value == null
      ? `Not ranked yet · need top ${a.threshold}`
      : `Currently #${value} · need top ${a.threshold}`
  }
  return `${Math.min(value ?? 0, a.threshold)} / ${a.threshold}`
}

function progressPct(a: AchievementState, progress: AchievementProgress | null): number {
  if (!a.metric || a.threshold == null || a.metric === 'rank') return 0
  const value = progress?.[a.metric] ?? 0
  return Math.max(0, Math.min(100, (value / a.threshold) * 100))
}

/** The full story of one badge: art, rarity, unlock date, flavor, progress. */
export function AchievementDetailSheet({
  achievement: a,
  progress,
  rarity,
  open,
  onClose,
}: {
  achievement: AchievementState | null
  progress: AchievementProgress | null
  rarity: Map<string, AchievementRarity> | null
  open: boolean
  onClose: () => void
}) {
  const unlocked = !!a?.unlockedAt
  // Secret + locked = keep it a mystery (no name, description, or flavor).
  const hidden = !!a?.secret && !unlocked

  const r = a ? rarity?.get(a.code) : undefined
  const pctHolders =
    r && r.totalStudents > 0 ? Math.round((r.holders / r.totalStudents) * 100) : null
  const tier = pctHolders != null ? tierFor(pctHolders) : null

  const flavor = a && !hidden ? ACHIEVEMENT_FLAVOR[a.code] : undefined
  const label = a ? progressLine(a, progress) : null
  const pct = a ? progressPct(a, progress) : 0

  return (
    <Sheet open={open} onClose={onClose}>
      {a && (
        <div className="flex flex-col items-center gap-3 pb-1 text-center">
          <BadgeArt
            code={a.code}
            category={a.category}
            state={hidden ? 'secret' : unlocked ? 'unlocked' : 'locked'}
            isTitleGrantor={!!a.titleText}
            size="lg"
          />

          <div>
            <h2 className="font-display text-xl font-bold">{hidden ? '???' : a.name}</h2>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              {CATEGORY_LABEL[a.category]}
            </p>
          </div>

          {/* Rarity — tier + % + count, all three (the user's pick). Hidden for
              secret-locked so it can't leak how close the class is. */}
          {!hidden && tier && pctHolders != null && r && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', tier.cls)}>
                {tier.label}
              </span>
              <span className="text-xs text-muted">
                {pctHolders}% of the class · {r.holders} of {r.totalStudents}
              </span>
            </div>
          )}

          <p className="text-sm text-muted">
            {hidden ? 'Secret — keep playing to discover what unlocks it.' : a.description}
          </p>

          {flavor && (
            <p className="text-sm italic text-ink/80">“{flavor}”</p>
          )}

          {a.titleText && !hidden && (
            <p className="rounded-full bg-gold-400/15 px-3 py-1 text-xs font-semibold text-gold-700 dark:text-gold-300">
              Grants the title “{a.titleText}”
            </p>
          )}

          {unlocked ? (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Unlocked {fullDate(a.unlockedAt!)}
            </p>
          ) : label ? (
            <div className="w-full">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-muted">{label}</p>
            </div>
          ) : (
            <p className="text-xs text-muted">Locked</p>
          )}
        </div>
      )}
    </Sheet>
  )
}
