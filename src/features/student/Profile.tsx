import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { getLevelProgress } from '@/lib/leveling'
import { getSoundMuted, setSoundMuted } from '@/lib/sound'
import { getHapticsMuted, hapticsSupported, setHapticsMuted, vibrateOnce } from '@/lib/haptics'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push'
import { useAuth } from '@/lib/auth'
import { useStudentData } from './StudentData'

export function Profile() {
  const { signOut } = useAuth()
  const { loading, me, sectionName, saveDisplayName, saveAvatar, clearAvatar } = useStudentData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [pushState, setPushState] = useState<PushState>('default')
  const [pushBusy, setPushBusy] = useState(false)
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
    setEditOpen(true)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await saveDisplayName(name)
    setSaving(false)
    if (error) {
      toast(error, 'error')
      return
    }
    toast('Display name updated.', 'success')
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
    toast(error ?? 'Profile picture removed.', error ? 'error' : 'success')
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
                onClick={onRemovePhoto}
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

          <Button variant="outline" className="mt-5 w-full" onClick={openEdit}>
            Edit display name
          </Button>
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
      </Card>

      <Button variant="ghost" className="w-full text-muted" onClick={onSignOut}>
        Sign out
      </Button>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit display name">
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
          <Button type="submit" size="lg" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </Sheet>
    </div>
  )
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
