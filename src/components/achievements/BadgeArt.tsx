import { cn } from '@/lib/cn'
import { BADGE_MOTIFS } from './badgeMotifs'
import type { AchievementCategory } from '@/lib/types'

/**
 * Gradient + glow per category, mirroring `LevelUpBurst`'s
 * `bg-gradient-to-br from-gold-300 to-gold-500` badge treatment — every
 * category gets the same style of "illustrated" gradient frame, just a
 * different hue, so all 30 badges read as one consistent family.
 */
const CATEGORY_STYLE: Record<AchievementCategory, { gradient: string; glow: string }> = {
  points: { gradient: 'from-gold-300 to-gold-500', glow: 'shadow-gold-500/40' },
  attendance: { gradient: 'from-emerald-300 to-emerald-600', glow: 'shadow-emerald-500/40' },
  growth: { gradient: 'from-sky-300 to-sky-600', glow: 'shadow-sky-500/40' },
  social: { gradient: 'from-violet-300 to-violet-600', glow: 'shadow-violet-500/40' },
  fun: { gradient: 'from-rose-300 to-rose-600', glow: 'shadow-rose-500/40' },
  recognition: { gradient: 'from-cyan-300 to-cyan-600', glow: 'shadow-cyan-500/40' },
}

const SIZES = { sm: 'h-11 w-11', md: 'h-16 w-16', lg: 'h-24 w-24' } as const

interface BadgeArtProps {
  code: string
  category: AchievementCategory
  /** 'locked' = greyed silhouette; 'secret' = hidden "?"; 'unlocked' = full reveal. */
  state: 'locked' | 'unlocked' | 'secret'
  /** Marks the badge as a title-grantor with a small sparkle accent. */
  isTitleGrantor?: boolean
  size?: keyof typeof SIZES
  className?: string
}

/** One illustrated achievement badge — the gradient frame + its motif. */
export function BadgeArt({
  code,
  category,
  state,
  isTitleGrantor,
  size = 'md',
  className,
}: BadgeArtProps) {
  const Motif = BADGE_MOTIFS[code]
  const style = CATEGORY_STYLE[category]
  const locked = state === 'locked' || state === 'secret'

  return (
    <div className={cn('relative shrink-0', SIZES[size], className)}>
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg',
          locked ? 'from-card-2 to-card-2 opacity-60 shadow-none grayscale' : cn(style.gradient, style.glow),
        )}
      >
        {state === 'secret' ? (
          <span className="font-display text-lg font-bold text-white/70">?</span>
        ) : Motif ? (
          <Motif className={cn('h-[55%] w-[55%]', locked ? 'text-muted' : 'text-white')} />
        ) : null}
      </div>
      {isTitleGrantor && !locked && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold-400 text-[0.6rem] shadow-sm">
          ✦
        </span>
      )}
    </div>
  )
}
