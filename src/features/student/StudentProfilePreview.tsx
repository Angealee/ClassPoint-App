import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { XpBar } from '@/components/ui/XpBar'
import { BoltIcon, StarIcon, TrophyIcon } from '@/components/ui/icons'
import { ProfileBanner } from '@/components/profile/ProfileBanner'
import { ProfileVisitors } from '@/components/profile/ProfileVisitors'
import { PinnedBadges } from '@/components/achievements/PinnedBadges'
import { getPublicProfile, listAchievements, recordProfileView } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { AchievementState, PublicProfile } from '@/lib/types'
import { useStudentDataOptional } from './StudentData'

/** The minimum a caller already knows so the header renders instantly. */
export interface PreviewTarget {
  student_id: string
  display_name: string
  section_id: string
  lifetime_points: number
  avatar_url: string | null
  /** Snapshot rank, or null if not ranked. */
  rank: number | null
}

interface Props {
  target: PreviewTarget | null
  open: boolean
  onClose: () => void
  isMe?: boolean
  sectionLabel: string
}

/**
 * Tap-to-open preview of any classmate's public profile, launched from a
 * leaderboard row. The header (name, avatar, points, rank) shows immediately
 * from data the leaderboard already has; the bio, interests, "member since",
 * and recent point history are loaded lazily from `getPublicProfile`.
 */
export function StudentProfilePreview({ target, open, onClose, isMe, sectionLabel }: Props) {
  // Optional: this sheet is shared with the instructor's Rank tab, which has no
  // StudentDataProvider around it. Fall back gracefully when the context is absent.
  const studentCtx = useStudentDataOptional()
  const syncMyAchievements = studentCtx?.syncMyAchievements
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // Achievement catalog for rendering the viewed student's pinned badges. From
  // student context when available; otherwise fetched directly (instructor view).
  const [fallbackCatalog, setFallbackCatalog] = useState<AchievementState[]>([])
  const catalog = studentCtx?.achievements ?? fallbackCatalog

  const studentId = target?.student_id
  useEffect(() => {
    if (!open || !studentId) return
    let active = true
    setProfile(null)
    setFailed(false)
    setLoading(true)
    getPublicProfile(studentId)
      .then((p) => active && setProfile(p))
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [open, studentId])

  // No student context (instructor view) → load the static catalog once so the
  // viewed student's pinned badges still render.
  useEffect(() => {
    if (studentCtx || !open) return
    let active = true
    listAchievements()
      .then((list) => active && setFallbackCatalog(list.map((a) => ({ ...a, unlockedAt: null }))))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [studentCtx, open])

  // Count a profile view — but never your own (the RPC also guards this) — then
  // re-check the viewer's own achievements (only meaningful in student context).
  useEffect(() => {
    if (!open || !studentId || isMe) return
    void recordProfileView(studentId)
      .then(() => syncMyAchievements?.())
      .catch(() => {})
  }, [open, studentId, isMe, syncMyAchievements])

  // Prefer the live total once loaded (more current than the frozen snapshot).
  const points = profile?.lifetime_points ?? target?.lifetime_points ?? 0
  const progress = getLevelProgress(points)
  const tags = splitInterests(profile?.interests)

  return (
    <Sheet open={open} onClose={onClose}>
      {target && (
        <div>
          {/* Header */}
          <div className="flex items-center gap-4">
            <Avatar
              name={target.display_name}
              url={profile?.avatar_url ?? target.avatar_url}
              className="h-16 w-16 rounded-2xl"
              textClassName="text-2xl"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-bold">
                {target.display_name}
                {isMe && <span className="ml-1 text-sm text-brand-500">(you)</span>}
              </p>
              {profile?.display_title && (
                <p className="truncate text-xs font-semibold text-gold-600 dark:text-gold-400">
                  {profile.display_title}
                </p>
              )}
              <p className="text-sm text-muted">
                {sectionLabel} · Level {progress.level}
              </p>
            </div>
            {target.rank != null && (
              <div className="shrink-0 text-right">
                <p className="font-display text-2xl font-bold text-gold-600 dark:text-gold-400">
                  #{target.rank}
                </p>
                <p className="text-[0.65rem] uppercase tracking-wider text-muted">rank</p>
              </div>
            )}
          </div>

          {/* Level / XP */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
              <span>
                {progress.expIntoLevel} / {progress.expForLevel} XP
              </span>
              <span>{progress.expToNext} to next</span>
            </div>
            <XpBar value={progress.progressPct} />
          </div>

          {/* Stat tiles */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <Stat icon={<BoltIcon className="h-4 w-4" />} label="Points" value={String(points)} tone="gold" />
            <Stat
              icon={<StarIcon className="h-4 w-4" />}
              label="Level"
              value={String(progress.level)}
              tone="brand"
            />
            <Stat
              icon={<TrophyIcon className="h-4 w-4" />}
              label="Rank"
              value={target.rank != null ? `#${target.rank}` : '—'}
              tone="brand"
            />
          </div>

          {/* Who viewed you (own profile only) */}
          {isMe && (
            <div className="mt-4">
              <ProfileVisitors studentId={target.student_id} />
            </div>
          )}

          {/* Pinned badges */}
          {profile?.pinned_achievements && profile.pinned_achievements.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                Badges
              </p>
              <PinnedBadges achievements={catalog} pinnedCodes={profile.pinned_achievements} />
            </div>
          )}

          {/* Showcase photos */}
          {profile?.banner_urls && profile.banner_urls.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                Photos
              </p>
              <ProfileBanner urls={profile.banner_urls} />
            </div>
          )}

          {/* About */}
          {(loading || profile?.bio) && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">About</p>
              {loading && !profile ? (
                <div className="h-12 animate-pulse rounded-xl bg-card-2" />
              ) : (
                <p className="rounded-xl bg-card-2 px-4 py-3 text-sm leading-relaxed text-ink">
                  {profile?.bio}
                </p>
              )}
            </div>
          )}

          {/* Interests */}
          {tags.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                Interests
              </p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent points */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              Recent points
            </p>
            {failed ? (
              <p className="rounded-xl bg-card-2 px-4 py-3 text-sm text-muted">
                Couldn't load recent activity.
              </p>
            ) : loading && !profile ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-card-2" />
                ))}
              </div>
            ) : profile && profile.events.length > 0 ? (
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {profile.events.map((e) => {
                  const negative = e.points < 0
                  return (
                    <div key={e.id} className="flex items-center gap-3 p-3">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                          negative
                            ? 'bg-red-500/10 text-red-500'
                            : e.category === 'activity'
                              ? 'bg-brand-500/10 text-brand-500'
                              : 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
                        )}
                      >
                        {negative ? e.points : `+${e.points}`}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {e.note ?? (negative ? 'Deduction' : 'Class points')}
                        </p>
                        <p className="text-xs capitalize text-muted">
                          {e.category} · {timeAgo(e.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-card-2 px-4 py-3 text-sm text-muted">
                No points yet.
              </p>
            )}
          </div>

          {/* Member since */}
          {profile?.created_at && (
            <p className="mt-4 text-center text-xs text-muted">
              Member since {memberSince(profile.created_at)}
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'gold' | 'brand'
}) {
  return (
    <div className="rounded-xl bg-card-2 p-3 text-center">
      <div
        className={cn(
          'mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg',
          tone === 'gold'
            ? 'bg-gold-400/15 text-gold-600 dark:text-gold-400'
            : 'bg-brand-500/10 text-brand-500',
        )}
      >
        {icon}
      </div>
      <p className="font-display text-lg font-bold leading-none">{value}</p>
      <p className="mt-1 text-[0.65rem] uppercase tracking-wider text-muted">{label}</p>
    </div>
  )
}

/** Split a comma-separated interests string into trimmed, non-empty tags. */
function splitInterests(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12)
}

/** "March 2026" from an ISO timestamp. */
function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
