import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { PlayerCard } from '@/components/profile/PlayerCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { ProfileBanner } from '@/components/profile/ProfileBanner'
import { ProfileVisitors } from '@/components/profile/ProfileVisitors'
import { PinnedBadges } from '@/components/achievements/PinnedBadges'
import { InterestTags, parseInterests } from '@/components/profile/InterestTags'
import { PointEventRow } from '@/components/points/PointEventRow'
import { getPublicProfile, listAchievements, recordProfileView } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import type { AchievementState, PublicProfile } from '@/lib/types'
import { useStudentDataOptional } from './StudentData'

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

export function StudentProfilePreview({ target, open, onClose, isMe, sectionLabel }: Props) {
  const studentCtx = useStudentDataOptional()
  const syncMyAchievements = studentCtx?.syncMyAchievements
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
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

  useEffect(() => {
    if (!open || !studentId || isMe) return
    void recordProfileView(studentId)
      .then(() => syncMyAchievements?.())
      .catch(() => {})
  }, [open, studentId, isMe, syncMyAchievements])

  const points = profile?.semester_points ?? target?.points ?? 0
  const progress = getLevelProgress(points)
  const tags = parseInterests(profile?.interests)

  return (
    <Sheet open={open} onClose={onClose}>
      {target && (
        <div className="space-y-4">
          <PlayerCard
            name={target.display_name}
            title={profile?.display_title}
            sectionLabel={sectionLabel}
            avatarUrl={profile?.avatar_url ?? target.avatar_url}
            coverUrl={profile?.header_url ?? null}
            coverPos={profile?.header_pos ?? 50}
            points={points}
            rank={target.rank}
            third={{ label: 'Level', value: String(progress.level) }}
            isMe={isMe}
          />

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
                <Skeleton className="h-12 rounded-xl" />
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
                  <Skeleton key={i} className="h-14 rounded-xl" />
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

/** "March 2026" from an ISO timestamp. */
function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
