import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { CoverPhoto } from '@/components/profile/CoverPhoto'
import { Avatar } from '@/components/ui/Avatar'
import { XpBar } from '@/components/ui/XpBar'
import { BoltIcon, StarIcon, TrophyIcon } from '@/components/ui/icons'
import { ProfileBanner } from '@/components/profile/ProfileBanner'
import { ProfileVisitors } from '@/components/profile/ProfileVisitors'
import { PinnedBadges } from '@/components/achievements/PinnedBadges'
import { InterestTags, parseInterests } from '@/components/profile/InterestTags'
import { Stat } from '@/components/ui/Stat'
import { PointEventRow } from '@/components/points/PointEventRow'
import { getPublicProfile, listAchievements, recordProfileView } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import type { AchievementState, PublicProfile } from '@/lib/types'
import { useStudentDataOptional } from './StudentData'

/** The minimum a caller already knows so the header renders instantly. */
export interface PreviewTarget {
  student_id: string
  display_name: string
  section_id: string
  points: number
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
  const points = profile?.semester_points ?? target?.points ?? 0
  const progress = getLevelProgress(points)
  const tags = parseInterests(profile?.interests)

  return (
    <Sheet open={open} onClose={onClose}>
      {target && (
        <div className="space-y-4">
          {/*
            Cover image (0039), INSET rather than bled to the sheet's edges.

            The first version cancelled the scroll area's `px-5` with `-mx-5`,
            and that is what was cutting things off in the preview: the Sheet's
            body is `overflow-y-auto`, and per spec when one overflow axis is
            not `visible` the other computes to `auto` — so the bleed pushed
            content outside a scroller that then clipped it, taking the avatar's
            ring and the right-hand edge with it. A rounded inset cover needs no
            bleed and so cannot clip.

            Read-only here, and it honours the focal point its owner chose on
            their own Profile (0040). Same component on both screens, so the
            cover cannot end up framed differently depending on who is looking.
          */}
          <div className="relative">
            <CoverPhoto
              url={profile?.header_url ?? null}
              pos={profile?.header_pos ?? 50}
              className="h-28 rounded-2xl"
            />
            {/* Scrim so the avatar and name stay readable over any photo. */}
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-canvas/85 via-canvas/25 to-transparent" />
          </div>

          {/*
            Header. The rank USED to sit detached at the top-right — where it
            was the first thing to be cut off on a narrow phone, and where it
            duplicated the Rank stat tile a few lines below. Removing it fixes
            the crop and the duplication at once; the tile is the one that
            stays, because it sits with the other two figures it belongs with.
          */}
          <div className="-mt-11 flex items-end gap-3">
            <Avatar
              name={target.display_name}
              url={profile?.avatar_url ?? target.avatar_url}
              className="h-20 w-20 shrink-0 rounded-2xl ring-4 ring-canvas"
              textClassName="text-2xl"
            />
            <div className="min-w-0 flex-1 pb-0.5">
              <p className="truncate font-display text-xl font-bold leading-tight">
                {target.display_name}
                {isMe && <span className="ml-1 text-sm text-accent">(you)</span>}
              </p>
              {profile?.display_title && (
                <p className="truncate text-xs font-semibold text-reward">
                  {profile.display_title}
                </p>
              )}
              <p className="truncate text-sm text-muted">
                {sectionLabel} · Level {progress.level}
              </p>
            </div>
          </div>

          {/* Level / XP */}
          <div>
            {/* `min-w-0` + `truncate` on the LEFT and `shrink-0` on the right:
                without them the right-hand figure was the one that got cut, and
                "62 to n…" is the half a student actually wants. */}
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-muted">
              <span className="min-w-0 truncate">
                {progress.expIntoLevel} / {progress.expForLevel} XP
              </span>
              <span className="shrink-0">{progress.expToNext} to next</span>
            </div>
            <XpBar value={progress.progressPct} />
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile
              icon={<BoltIcon className="h-4 w-4" />}
              label="Points"
              value={String(points)}
              tone="reward"
            />
            <StatTile
              icon={<StarIcon className="h-4 w-4" />}
              label="Level"
              value={String(progress.level)}
              tone="accent"
            />
            <StatTile
              icon={<TrophyIcon className="h-4 w-4" />}
              label="Rank"
              value={target.rank != null ? `#${target.rank}` : '—'}
              tone="accent"
            />
          </div>

          {/* Who viewed you (own profile only) */}
          {isMe && (
            <div>
              <ProfileVisitors studentId={target.student_id} />
            </div>
          )}

          {/* Pinned badges */}
          {profile?.pinned_achievements && profile.pinned_achievements.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                Badges
              </p>
              <PinnedBadges achievements={catalog} pinnedCodes={profile.pinned_achievements} />
            </div>
          )}

          {/* Showcase photos */}
          {profile?.banner_urls && profile.banner_urls.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                Photos
              </p>
              <ProfileBanner urls={profile.banner_urls} />
            </div>
          )}

          {/* About */}
          {(loading || profile?.bio) && (
            <div>
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
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                Interests
              </p>
              <InterestTags raw={profile?.interests} />
            </div>
          )}

          {/* Recent points */}
          <div>
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
                {profile.events.map((e) => (
                  <PointEventRow key={e.id} event={e} compact />
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-card-2 px-4 py-3 text-sm text-muted">
                No points yet.
              </p>
            )}
          </div>

          {/* Member since */}
          {profile?.created_at && (
            <p className="text-center text-xs text-muted">
              Member since {memberSince(profile.created_at)}
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

/**
 * An icon tile wrapping the shared Stat.
 *
 * The tile shell (surface, icon chip) is this screen's own; the figure and its
 * label come from the primitive. `tone` is now a role: gold for the reward
 * figures, accent for level and rank — identity, not a warning.
 */
function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'reward' | 'accent'
}) {
  return (
    // `min-w-0` is the fix for the crop in the bug report: a grid item defaults
    // to `min-width: auto`, so it refuses to shrink below its content and a wide
    // figure pushes the whole three-up row out of the sheet instead of the row
    // adapting. With it, the tiles narrow and the numbers stay inside.
    <div className="min-w-0 rounded-xl bg-card-2 p-3">
      <div
        className={cn(
          'mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg',
          tone === 'reward' ? 'bg-gold-400/15 text-reward' : 'bg-accent-solid/10 text-accent',
        )}
      >
        {icon}
      </div>
      <Stat value={value} label={label} />
    </div>
  )
}

/** "March 2026" from an ISO timestamp. */
function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
