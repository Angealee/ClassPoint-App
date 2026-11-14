import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SuccessTick } from '@/components/ui/SuccessTick'
import { useToast } from '@/components/ui/Toast'
import { GearIcon } from '@/components/ui/icons'
import { PlayerCard } from '@/components/profile/PlayerCard'
import { ProfileBanner } from '@/components/profile/ProfileBanner'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ProfileVisitors } from '@/components/profile/ProfileVisitors'
import { PinnedBadges } from '@/components/achievements/PinnedBadges'
import { InterestTags, parseInterests } from '@/components/profile/InterestTags'
import { useStudentData } from './StudentData'
import { StudentProfilePreview, type PreviewTarget } from './StudentProfilePreview'

const NAME_MAX = 40
const BIO_MAX = 160
const INTERESTS_MAX = 120

export function Profile() {
  const {
    loading,
    me,
    rank,
    sectionName,
    saveProfile,
    saveAvatar,
    clearAvatar,
    saveBanner,
    removeBanner,
    saveHeader,
    clearHeader,
    saveHeaderPos,
    achievements,
    setPinnedAchievements,
    hasUnseenAchievements,
  } = useStudentData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const reduced = useReducedMotion() ?? false
  const fileRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLInputElement>(null)
  const [headerBusy, setHeaderBusy] = useState(false)
  const [confirmHeader, setConfirmHeader] = useState(false)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [bannerBusy, setBannerBusy] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)
  const [confirmPhoto, setConfirmPhoto] = useState(false)
  const [confirmBannerUrl, setConfirmBannerUrl] = useState<string | null>(null)
  const [tick, setTick] = useState(false)
  const [viewerTarget, setViewerTarget] = useState<PreviewTarget | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [interests, setInterests] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  function openEdit() {
    setName(me?.display_name ?? '')
    setBio(me?.bio ?? '')
    setInterests(me?.interests ?? '')
    setEditOpen(true)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await saveProfile({ displayName: name, bio, interests })
    setSaving(false)
    if (error) {
      toast(error, 'error')
      return
    }
    toast('Profile updated.', 'success')
    setEditOpen(false)
    setTick(true)
  }

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setUploading(true)
    const { error } = await saveAvatar(file)
    setUploading(false)
    toast(error ?? 'Profile picture updated.', error ? 'error' : 'success')
  }

  async function onRemovePhoto() {
    setUploading(true)
    const { error } = await clearAvatar()
    setUploading(false)
    setConfirmPhoto(false)
    toast(error ?? 'Profile picture removed.', error ? 'error' : 'success')
  }

  async function onPickHeader(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setHeaderBusy(true)
    const { error } = await saveHeader(file)
    setHeaderBusy(false)
    if (error) toast(error, 'error')
  }

  async function onRepositionHeader(pos: number) {
    const { error } = await saveHeaderPos(pos)
    if (error) toast(error, 'error')
  }

  async function onRemoveHeader() {
    setHeaderBusy(true)
    const { error } = await clearHeader()
    setHeaderBusy(false)
    setConfirmHeader(false)
    if (error) toast(error, 'error')
  }

  async function onPickBanner(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setBannerBusy(true)
    const { error } = await saveBanner(file)
    setBannerBusy(false)
    if (error) toast(error, 'error')
  }

  async function onRemoveBanner(url: string) {
    setBannerBusy(true)
    const { error } = await removeBanner(url)
    setBannerBusy(false)
    setConfirmBannerUrl(null)
    if (error) toast(error, 'error')
  }

  async function onPinChange(codes: string[]) {
    setPinBusy(true)
    const { error } = await setPinnedAchievements(codes)
    setPinBusy(false)
    if (error) toast(error, 'error')
  }

  const hasAbout = !!me?.bio || parseInterests(me?.interests).length > 0
  const earned = achievements.filter((a) => a.unlockedAt).length

  return (
    <div className="space-y-5">
      <ScreenTitle
        title="Profile"
        actions={
          <IconButton
            label="Settings"
            variant="outline"
            round
            icon={<GearIcon className="h-5 w-5" />}
            onClick={() => navigate('/app/settings')}
          />
        }
      />

      {loading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !me ? (
        <EmptyState>We couldn&rsquo;t find your student record.</EmptyState>
      ) : (
        <>
          <PlayerCard
            name={me.display_name}
            title={me.display_title}
            sectionLabel={sectionName(me.section_id)}
            avatarUrl={me.avatar_url}
            coverUrl={me.header_url}
            coverPos={me.header_pos}
            points={me.semester_points}
            rank={rank}
            third={{ label: 'All-time', value: String(me.all_time_points) }}
            editable
            reduced={reduced}
            coverBusy={headerBusy}
            avatarBusy={uploading}
            onPickCover={() => headerRef.current?.click()}
            onRepositionCover={onRepositionHeader}
            onRemoveCover={() => setConfirmHeader(true)}
            onPickAvatar={() => fileRef.current?.click()}
            onRemoveAvatar={() => setConfirmPhoto(true)}
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={openEdit}
                className="cp-tap-y h-11 flex-1 rounded-xl bg-white/10 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Edit profile
              </button>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="cp-tap-y h-11 flex-1 rounded-xl border border-white/20 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Preview
              </button>
            </div>
            <p className="mt-2 text-center text-2xs text-white/60">
              Preview shows what classmates see when they tap you.
            </p>
          </PlayerCard>

          <input
            ref={headerRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onPickHeader}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onPickFile}
          />

          <section>
            <SectionLabel
              action={
                <button
                  type="button"
                  onClick={() => navigate('/app/achievements')}
                  className="cp-tap-y text-sm font-semibold text-accent transition-opacity hover:opacity-80"
                >
                  {earned}/{achievements.length} · View all
                </button>
              }
            >
              <span className="flex items-center gap-2">
                Achievements
                {hasUnseenAchievements && (
                  <span className="h-2 w-2 rounded-full bg-accent-solid" aria-label="New badges" />
                )}
              </span>
            </SectionLabel>
            <Card pad="tight">
              <PinnedBadges
                achievements={achievements}
                pinnedCodes={me.pinned_achievements ?? []}
                editable
                onChange={onPinChange}
                busy={pinBusy}
              />
            </Card>
          </section>

          <section>
            <SectionLabel
              action={
                <button
                  type="button"
                  onClick={openEdit}
                  className="cp-tap-y text-sm font-semibold text-accent transition-opacity hover:opacity-80"
                >
                  {hasAbout ? 'Edit' : 'Add'}
                </button>
              }
            >
              About
            </SectionLabel>
            <Card className="space-y-3">
              {me.bio ? (
                <p className="text-sm leading-relaxed text-ink">{me.bio}</p>
              ) : (
                <p className="text-sm text-muted">
                  No bio yet. A line about you helps classmates know who they are looking at.
                </p>
              )}
              <InterestTags raw={me.interests} />
            </Card>
          </section>

          <section>
            <SectionLabel>Photos</SectionLabel>
            <Card pad="tight">
              <ProfileBanner
                urls={me.banner_urls ?? []}
                editable
                onAdd={() => bannerRef.current?.click()}
                onRemove={(url) => setConfirmBannerUrl(url)}
                busy={bannerBusy}
              />
              <p className="mt-2 text-xs text-muted">
                Up to 3, shown on your profile. JPG, PNG, WebP or GIF, up to 5 MB.
              </p>
              <input
                ref={bannerRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={onPickBanner}
              />
            </Card>
          </section>

          <ProfileVisitors
            studentId={me.id}
            onOpenViewer={(row) =>
              setViewerTarget({
                student_id: row.studentId,
                display_name: row.displayName,
                section_id: row.sectionId,
                points: row.lifetimePoints,
                avatar_url: row.avatarUrl,
                rank: row.rank,
              })
            }
          />
        </>
      )}

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit profile">
        <form onSubmit={onSave} className="space-y-4 pb-2">
          <Input
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            placeholder="How you appear on the leaderboard"
            hint={`${name.length}/${NAME_MAX} · 2 to ${NAME_MAX} characters, shown on the leaderboard.`}
            autoFocus
            required
          />
          <div>
            <p className="mb-1.5 text-sm font-medium">Full name</p>
            <p className="rounded-xl bg-card-2 px-4 py-3 text-sm">{me?.full_name}</p>
            <p className="mt-1.5 text-xs text-muted">
              Private. Only you and your instructor can see this.
            </p>
          </div>
          <div className="w-full">
            <Textarea
              id="profile-bio"
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              placeholder="A short line about you. Classmates see it on your profile."
              rows={3}
            />
            <p className="mt-1.5 text-right text-xs tabular-nums text-muted">
              {bio.length}/{BIO_MAX}
            </p>
          </div>
          <Input
            label="Interests"
            value={interests}
            onChange={(e) => setInterests(e.target.value.slice(0, INTERESTS_MAX))}
            placeholder="anime, basketball, coding"
            hint={`${interests.length}/${INTERESTS_MAX} · optional, separate with commas.`}
          />
          <div className="sticky bottom-0 bg-canvas/95 pb-1 pt-3">
            <Button type="submit" size="lg" className="w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Sheet>

      <StudentProfilePreview
        target={
          me
            ? {
                student_id: me.id,
                display_name: me.display_name,
                section_id: me.section_id,
                points: me.semester_points,
                avatar_url: me.avatar_url,
                rank,
              }
            : null
        }
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        isMe
        sectionLabel={me ? sectionName(me.section_id) : ''}
      />

      <StudentProfilePreview
        target={viewerTarget}
        open={!!viewerTarget}
        onClose={() => setViewerTarget(null)}
        sectionLabel={viewerTarget ? sectionName(viewerTarget.section_id) : ''}
      />

      <ConfirmDialog
        open={confirmHeader}
        title="Remove cover photo?"
        message="Your profile goes back to the plain header. Classmates won't see this picture anymore."
        confirmLabel="Remove cover"
        busy={headerBusy}
        onConfirm={onRemoveHeader}
        onClose={() => setConfirmHeader(false)}
      />

      <ConfirmDialog
        open={confirmPhoto}
        title="Remove profile picture?"
        message="Your photo is removed everywhere. Classmates will see your initials instead."
        confirmLabel="Remove photo"
        busy={uploading}
        onConfirm={onRemovePhoto}
        onClose={() => setConfirmPhoto(false)}
      />

      <ConfirmDialog
        open={!!confirmBannerUrl}
        title="Remove this photo?"
        message="It disappears from your showcase. Classmates won't see it anymore."
        confirmLabel="Remove photo"
        busy={bannerBusy}
        onConfirm={() => confirmBannerUrl && void onRemoveBanner(confirmBannerUrl)}
        onClose={() => setConfirmBannerUrl(null)}
      />

      <SuccessTick show={tick} onDone={() => setTick(false)} />
    </div>
  )
}
