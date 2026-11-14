import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SuccessTick } from '@/components/ui/SuccessTick'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { getLevelProgress } from '@/lib/leveling'
import { ProfileBanner } from '@/components/profile/ProfileBanner'
import { CoverPhoto } from '@/components/profile/CoverPhoto'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { PencilIcon, XIcon } from '@/components/ui/icons'
import { ProfileVisitors } from '@/components/profile/ProfileVisitors'
import { PinnedBadges } from '@/components/achievements/PinnedBadges'
import { InterestTags, parseInterests } from '@/components/profile/InterestTags'
import { useStudentData } from './StudentData'
import { StudentProfilePreview, type PreviewTarget } from './StudentProfilePreview'

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

  return (
    <div className="space-y-4">
      <ScreenTitle title="Profile" />

      {loading ? (
        <Skeleton className="h-44 rounded-2xl" />
      ) : !me ? (
        <EmptyState>We couldn't find your student record.</EmptyState>
      ) : (
        <>
        <Card pad="none" className="overflow-hidden">
          <CoverPhoto
            url={me.header_url}
            pos={me.header_pos}
            className="h-36"
            editable
            busy={headerBusy}
            onPick={() => headerRef.current?.click()}
            onReposition={onRepositionHeader}
            action={
              me.header_url ? (
                <button
                  type="button"
                  onClick={() => setConfirmHeader(true)}
                  disabled={headerBusy}
                  aria-label="Remove cover photo"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              ) : undefined
            }
          />
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

          <div className="relative z-[1] px-5 pb-5 pt-3">
            <div className="absolute -top-10 left-5 z-[1]">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label={me.avatar_url ? 'Change profile picture' : 'Add a profile picture'}
                  className="group relative block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
                >
                  <Avatar
                    name={me.display_name}
                    url={me.avatar_url}
                    className="h-20 w-20 rounded-2xl ring-4 ring-card"
                    textClassName="text-3xl"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent-solid text-white ring-2 ring-card">
                    {uploading ? (
                      <span className="text-2xs">…</span>
                    ) : (
                      <PencilIcon className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>
                {me.avatar_url && (
                  <button
                    type="button"
                    onClick={() => setConfirmPhoto(true)}
                    disabled={uploading}
                    aria-label="Remove profile picture"
                    className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-danger-solid"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                )}
            </div>

            <div className="min-h-11 min-w-0 pl-23">
              <p className="truncate font-display text-2xl font-bold leading-tight">
                {me.display_name}
              </p>
              {me.display_title && (
                <p className="truncate text-xs font-semibold text-reward">{me.display_title}</p>
              )}
              <p className="truncate text-sm text-muted">
                {sectionName(me.section_id)} · Level {getLevelProgress(me.semester_points).level}
              </p>
            </div>

            <div className="mt-4 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={openEdit}>
                Edit profile
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
            </div>
            <p className="mt-2 text-center text-xs text-muted">
              Preview is exactly what classmates see when they tap you on the leaderboard.
            </p>
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <Field label="Display name" value={me.display_name} />
            <Field label="Full name" value={me.full_name} />
            <Field label="Section" value={sectionName(me.section_id)} />
            <Field label="This semester" value={String(me.semester_points)} />
            <Field label="All-time" value={String(me.all_time_points)} />
          </div>

          {me.bio && (
            <div className="mt-4">
              <SectionLabel>Bio</SectionLabel>
              <p className="rounded-xl bg-card-2 px-4 py-3 text-sm leading-relaxed text-ink">
                {me.bio}
              </p>
            </div>
          )}

          {parseInterests(me.interests).length > 0 && (
            <div className="mt-4">
              <SectionLabel>Interests</SectionLabel>
              <InterestTags raw={me.interests} />
            </div>
          )}
        </Card>

        <Card>
          <div>
            <SectionLabel>Photos</SectionLabel>
            <ProfileBanner
              urls={me.banner_urls ?? []}
              editable
              onAdd={() => bannerRef.current?.click()}
              onRemove={(url) => setConfirmBannerUrl(url)}
              busy={bannerBusy}
            />
            <p className="mt-2 text-xs text-muted">
              Up to 3 · classmates see these on your profile. JPG, PNG, WebP or GIF · ≤ 5 MB.
            </p>
            <input
              ref={bannerRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onPickBanner}
            />
          </div>

          <div className="mt-5">
            <SectionLabel
              action={
                <button
                  type="button"
                  onClick={() => navigate('/app/achievements')}
                  className="text-xs font-semibold text-accent transition-opacity hover:opacity-80"
                >
                  {achievements.filter((a) => a.unlockedAt).length}/{achievements.length} · View all
                  →
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
            <PinnedBadges
              achievements={achievements}
              pinnedCodes={me.pinned_achievements ?? []}
              editable
              onChange={onPinChange}
              busy={pinBusy}
            />
          </div>

          <div className="mt-5">
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
          </div>
        </Card>
        </>
      )}

      <button
        type="button"
        onClick={() => navigate('/app/settings')}
        className="block w-full text-left"
      >
        <Card interactive pad="roomy">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Settings</p>
              <p className="text-xs text-muted">
                Notifications, sounds, PIN and sign out.
              </p>
            </div>
            <span className="shrink-0 text-lg text-muted">›</span>
          </div>
        </Card>
      </button>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit profile">
        <form onSubmit={onSave} className="space-y-4">
          <Input
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How you appear on the leaderboard"
            hint="2–40 characters. Your full name stays private."
            autoFocus
            required
          />
          <div className="w-full">
            <Textarea
              id="profile-bio"
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 160))}
              placeholder="A short line about you, classmates see this on your profile."
              rows={3}
            />
            <p className="mt-1.5 text-right text-xs text-muted">{bio.length}/160</p>
          </div>
          <Input
            label="Interests"
            value={interests}
            onChange={(e) => setInterests(e.target.value.slice(0, 120))}
            placeholder="anime, basketball, coding"
            hint="Optional · separate with commas."
          />
          <Button type="submit" size="lg" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
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
        message="Your profile goes back to the plain header, classmates won't see this picture anymore."
        confirmLabel="Remove cover"
        busy={headerBusy}
        onConfirm={onRemoveHeader}
        onClose={() => setConfirmHeader(false)}
      />

      <ConfirmDialog
        open={confirmPhoto}
        title="Remove profile picture?"
        message="Your photo is removed everywhere, classmates will see your initials instead."
        confirmLabel="Remove photo"
        busy={uploading}
        onConfirm={onRemovePhoto}
        onClose={() => setConfirmPhoto(false)}
      />

      <ConfirmDialog
        open={!!confirmBannerUrl}
        title="Remove this photo?"
        message="It disappears from your showcase, classmates won't see it anymore."
        confirmLabel="Remove photo"
        busy={bannerBusy}
        onConfirm={() => confirmBannerUrl && void onRemoveBanner(confirmBannerUrl)}
        onClose={() => setConfirmBannerUrl(null)}
      />

      <SuccessTick show={tick} onDone={() => setTick(false)} />
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-card-2 px-4 py-3">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  )
}
