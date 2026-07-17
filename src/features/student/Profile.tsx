import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { getLevelProgress } from '@/lib/leveling'
import { getSoundMuted, setSoundMuted } from '@/lib/sound'
import { getHapticsMuted, hapticsSupported, setHapticsMuted, vibrateOnce } from '@/lib/haptics'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push'
import { sendTestPush } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ProfileBanner } from '@/components/profile/ProfileBanner'
import { ProfileVisitors } from '@/components/profile/ProfileVisitors'
import { PinnedBadges } from '@/components/achievements/PinnedBadges'
import { InstallButton } from '@/components/pwa/InstallButton'
import { ChangelogList } from '@/components/changelog/ChangelogList'
import { CHANGELOG, LATEST_VERSION } from '@/lib/changelog'
import { useStudentData } from './StudentData'
import { StudentProfilePreview } from './StudentProfilePreview'

export function Profile() {
  const { signOut } = useAuth()
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
    achievements,
    setPinnedAchievements,
    hasUnseenAchievements,
  } = useStudentData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [bannerBusy, setBannerBusy] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [confirmPhoto, setConfirmPhoto] = useState(false)
  const [confirmBannerUrl, setConfirmBannerUrl] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [interests, setInterests] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [pushState, setPushState] = useState<PushState>('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [muted, setMuted] = useState(() => getSoundMuted())
  const vibeSupported = useMemo(() => hapticsSupported(), [])
  const [vibeMuted, setVibeMuted] = useState(() => getHapticsMuted())

  useEffect(() => {
    getPushState().then(setPushState)
  }, [])

  async function togglePush() {
    if (!me) return
    setPushBusy(true)
    try {
      const next = pushState === 'subscribed' ? await disablePush() : await enablePush(me.id)
      setPushState(next)
      if (next === 'subscribed') toast('Push notifications on.', 'success')
      else if (next === 'denied')
        toast('Notifications are blocked — enable them in your browser settings.', 'error')
      else if (pushState === 'subscribed') toast('Push notifications off.', 'info')
    } catch {
      toast('Could not update notifications. Try again.', 'error')
    } finally {
      setPushBusy(false)
    }
  }

  async function onTestPush() {
    setTestBusy(true)
    try {
      await sendTestPush()
      toast('Test sent — check your lock screen.', 'success')
    } catch {
      toast('Could not send the test. Try again.', 'error')
    } finally {
      setTestBusy(false)
    }
  }

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setSoundMuted(next)
    toast(next ? 'Sounds muted.' : 'Sounds on.', 'info')
  }

  function toggleVibe() {
    const nextMuted = !vibeMuted
    setVibeMuted(nextMuted)
    setHapticsMuted(nextMuted)
    if (!nextMuted) vibrateOnce() // confirm with a quick buzz when turning on
    toast(nextMuted ? 'Vibration off.' : 'Vibration on.', 'info')
  }

  async function onSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

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
      <h1 className="font-display text-2xl font-bold">Profile</h1>

      {loading ? (
        <Card className="h-44 animate-pulse bg-card-2" />
      ) : !me ? (
        <Card className="p-8 text-center text-sm text-muted">
          We couldn't find your student record.
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Change profile picture"
              className="group relative rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            >
              <Avatar
                name={me.display_name}
                url={me.avatar_url}
                className="h-16 w-16 rounded-2xl"
                textClassName="text-2xl"
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45 text-[0.7rem] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                {uploading ? '…' : 'Change'}
              </span>
            </button>
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-bold">{me.display_name}</p>
              {me.display_title && (
                <p className="truncate text-xs font-semibold text-gold-600 dark:text-gold-400">
                  {me.display_title}
                </p>
              )}
              <p className="text-sm text-muted">
                {sectionName(me.section_id)} · Level {getLevelProgress(me.lifetime_points).level}
              </p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onPickFile}
          />

          <div className="mt-3 flex gap-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : me.avatar_url ? 'Change photo' : 'Add photo'}
            </Button>
            {me.avatar_url && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted"
                onClick={() => setConfirmPhoto(true)}
                disabled={uploading}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">JPG, PNG, WebP or GIF · up to 5 MB.</p>

          <div className="mt-5 space-y-3">
            <Field label="Display name" value={me.display_name} />
            <Field label="Full name" value={me.full_name} />
            <Field label="Section" value={sectionName(me.section_id)} />
            <Field label="Total points" value={String(me.lifetime_points)} />
          </div>

          {me.bio && (
            <div className="mt-3 rounded-xl bg-card-2 px-4 py-3">
              <p className="mb-1 text-sm text-muted">Bio</p>
              <p className="text-sm leading-relaxed text-ink">{me.bio}</p>
            </div>
          )}

          {interestTags(me.interests).length > 0 && (
            <div className="mt-3 rounded-xl bg-card-2 px-4 py-3">
              <p className="mb-2 text-sm text-muted">Interests</p>
              <div className="flex flex-wrap gap-2">
                {interestTags(me.interests).map((tag) => (
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

          {/* Showcase photos (up to 3) */}
          <div className="mt-5">
            <p className="mb-2 text-sm text-muted">Photos</p>
            <ProfileBanner
              urls={me.banner_urls ?? []}
              editable
              onAdd={() => bannerRef.current?.click()}
              onRemove={(url) => setConfirmBannerUrl(url)}
              busy={bannerBusy}
            />
            <p className="mt-1.5 text-xs text-muted">
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

          {/* Achievements */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm text-muted">
                Achievements
                {hasUnseenAchievements && (
                  <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="New badges" />
                )}
              </p>
              <button
                type="button"
                onClick={() => navigate('/app/achievements')}
                className="text-xs font-semibold text-brand-500 transition-opacity hover:opacity-80"
              >
                {achievements.filter((a) => a.unlockedAt).length}/{achievements.length} · View all →
              </button>
            </div>
            <PinnedBadges
              achievements={achievements}
              pinnedCodes={me.pinned_achievements ?? []}
              editable
              onChange={onPinChange}
              busy={pinBusy}
            />
          </div>

          {/* Who viewed your profile */}
          <div className="mt-5">
            <ProfileVisitors studentId={me.id} />
          </div>

          <div className="mt-5 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={openEdit}>
              Edit profile
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
          </div>
          <p className="mt-1.5 text-center text-xs text-muted">
            Preview is exactly what classmates see when they tap you on the leaderboard.
          </p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="font-display text-lg font-bold">Notifications</h2>
        <p className="mt-0.5 text-xs text-muted">
          Get alerted for points, level-ups, and rank changes.
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Sounds</p>
            <p className="text-xs text-muted">Play a chime for in-app alerts.</p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleMute}>
            {muted ? 'Off' : 'On'}
          </Button>
        </div>

        {vibeSupported && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Vibration</p>
              <p className="text-xs text-muted">Buzz this phone for in-app alerts.</p>
            </div>
            <Button variant="outline" size="sm" onClick={toggleVibe}>
              {vibeMuted ? 'Off' : 'On'}
            </Button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Push to this device</p>
            <p className="text-xs text-muted">{pushHint(pushState)}</p>
          </div>
          {pushState === 'unsupported' || pushState === 'unconfigured' ? (
            <Button variant="outline" size="sm" disabled>
              N/A
            </Button>
          ) : (
            <Button
              variant={pushState === 'subscribed' ? 'ghost' : 'outline'}
              size="sm"
              onClick={togglePush}
              disabled={pushBusy || pushState === 'denied'}
            >
              {pushBusy ? '…' : pushState === 'subscribed' ? 'Turn off' : 'Turn on'}
            </Button>
          )}
        </div>

        {/* Runs the real pipeline (outbox → edge function → your lock screen),
            so it proves delivery rather than just the UI. */}
        {pushState === 'subscribed' && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Test it</p>
              <p className="text-xs text-muted">
                Lock your phone, then tap — it should buzz within a few seconds.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onTestPush} disabled={testBusy}>
              {testBusy ? 'Sending…' : 'Send test'}
            </Button>
          </div>
        )}
      </Card>

      <InstallButton className="w-full" />

      <button
        type="button"
        onClick={() => setWhatsNewOpen(true)}
        className="flex w-full items-center justify-between rounded-2xl border border-line bg-card px-5 py-4 text-left transition-colors hover:bg-card-2"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">What's new</p>
          <p className="text-xs text-muted">See the latest updates and features.</p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-muted">v{LATEST_VERSION}</span>
      </button>

      <Button variant="ghost" className="w-full text-muted" onClick={onSignOut}>
        Sign out
      </Button>

      <Sheet open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} title="What's new">
        <ChangelogList entries={CHANGELOG} />
        <Button size="lg" className="mt-5 w-full" onClick={() => setWhatsNewOpen(false)}>
          Got it
        </Button>
      </Sheet>

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
            <label htmlFor="profile-bio" className="mb-1.5 block text-sm font-medium text-ink">
              Bio
            </label>
            <textarea
              id="profile-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 160))}
              placeholder="A short line about you — classmates see this on your profile."
              rows={3}
              className="w-full resize-none rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
                lifetime_points: me.lifetime_points,
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

      <ConfirmDialog
        open={confirmPhoto}
        title="Remove profile picture?"
        message="Your photo is removed everywhere — classmates will see your initials instead."
        confirmLabel="Remove photo"
        busy={uploading}
        onConfirm={onRemovePhoto}
        onClose={() => setConfirmPhoto(false)}
      />

      <ConfirmDialog
        open={!!confirmBannerUrl}
        title="Remove this photo?"
        message="It disappears from your showcase — classmates won't see it anymore."
        confirmLabel="Remove photo"
        busy={bannerBusy}
        onConfirm={() => confirmBannerUrl && void onRemoveBanner(confirmBannerUrl)}
        onClose={() => setConfirmBannerUrl(null)}
      />
    </div>
  )
}

/** Split a comma-separated interests string into trimmed, non-empty tags. */
function interestTags(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12)
}

function pushHint(state: PushState): string {
  switch (state) {
    case 'subscribed':
      return 'On — alerts arrive even when the app is closed.'
    case 'denied':
      return 'Blocked. Allow notifications in your browser settings.'
    case 'unsupported':
      return 'Not supported on this device. On iPhone, add the app to your Home Screen first.'
    case 'unconfigured':
      return 'Not set up by your school yet.'
    default:
      return 'Off. Turn on to get alerts on your lock screen.'
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-card-2 px-4 py-3">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  )
}
