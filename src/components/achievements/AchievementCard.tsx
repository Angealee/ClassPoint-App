import { BadgeArt } from './BadgeArt'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/time'
import type { AchievementProgress, AchievementState } from '@/lib/types'

/** How a metric's raw value reads as short progress text ("7/10", "#42"). */
function progressLabel(a: AchievementState, progress: AchievementProgress | null): string | null {
  if (!a.metric || a.threshold == null) return null
  const value = progress?.[a.metric] ?? null
  if (a.metric === 'rank') {
    return value == null ? `Not yet ranked · need top ${a.threshold}` : `Currently #${value} · need top ${a.threshold}`
  }
  return `${Math.min(value ?? 0, a.threshold)} / ${a.threshold}`
}

function progressPct(a: AchievementState, progress: AchievementProgress | null): number {
  if (!a.metric || a.threshold == null || a.metric === 'rank') return 0
  const value = progress?.[a.metric] ?? 0
  return Math.max(0, Math.min(100, (value / a.threshold) * 100))
}

/** One achievement tile — badge + name + description, progress, or "???". */
export function AchievementCard({
  achievement: a,
  progress,
  onClick,
}: {
  achievement: AchievementState
  progress?: AchievementProgress | null
  onClick?: () => void
}) {
  const unlocked = !!a.unlockedAt
  const hideDetails = a.secret && !unlocked
  const label = !unlocked ? progressLabel(a, progress ?? null) : null
  const pct = !unlocked ? progressPct(a, progress ?? null) : 0

  const content = (
    <div className="flex items-center gap-3.5 p-3.5">
      <BadgeArt
        code={a.code}
        category={a.category}
        state={hideDetails ? 'secret' : unlocked ? 'unlocked' : 'locked'}
        isTitleGrantor={!!a.titleText}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{hideDetails ? '???' : a.name}</p>
        <p className="truncate text-xs text-muted">
          {hideDetails ? 'Secret — keep playing to discover it.' : a.description}
        </p>
        {a.titleText && !hideDetails && (
          <p className="mt-0.5 truncate text-[0.7rem] font-medium text-gold-600 dark:text-gold-400">
            Title: "{a.titleText}"
          </p>
        )}
        {unlocked ? (
          <p className="mt-1 text-[0.7rem] text-muted">Unlocked {timeAgo(a.unlockedAt!)}</p>
        ) : label ? (
          <div className="mt-1.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-[0.7rem] tabular-nums text-muted">{label}</p>
          </div>
        ) : null}
      </div>
    </div>
  )

  if (!onClick) return content
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('block w-full text-left transition-colors hover:bg-card-2')}
    >
      {content}
    </button>
  )
}
