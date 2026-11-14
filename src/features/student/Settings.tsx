import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LogOutIcon } from '@/components/ui/icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/components/ui/Toast'
import { InstallButton } from '@/components/pwa/InstallButton'
import { ChangelogList } from '@/components/changelog/ChangelogList'
import { CHANGELOG, LATEST_VERSION } from '@/lib/changelog'
import { getSoundMuted, setSoundMuted } from '@/lib/sound'
import { getHapticsMuted, hapticsSupported, setHapticsMuted, vibrateOnce } from '@/lib/haptics'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push'
import { sendTestPush } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useStudentData } from './StudentData'

export function Settings() {
  const { signOut, changePin } = useAuth()
  const { me } = useStudentData()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [pushState, setPushState] = useState<PushState>('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [muted, setMuted] = useState(() => getSoundMuted())
  const vibeSupported = useMemo(() => hapticsSupported(), [])
  const [vibeMuted, setVibeMuted] = useState(() => getHapticsMuted())

  const [whatsNewOpen, setWhatsNewOpen] = useState(false)

  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

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
        toast('Notifications are blocked, enable them in your browser settings.', 'error')
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
      toast('Test sent, check your lock screen.', 'success')
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
    if (!nextMuted) vibrateOnce()
    toast(nextMuted ? 'Vibration off.' : 'Vibration on.', 'info')
  }

  async function onSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  function openPin() {
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setPinError(null)
    setPinOpen(true)
  }

  async function onChangePin(e: FormEvent) {
    e.preventDefault()
    setPinError(null)
    if (newPin !== confirmPin) {
      setPinError("Those two PINs don't match.")
      return
    }
    setPinSaving(true)
    const { error } = await changePin(currentPin, newPin)
    setPinSaving(false)
    if (error) {
      setPinError(error)
      return
    }
    setPinOpen(false)
    toast('PIN changed. Use it next time you sign in.', 'success')
  }

  return (
    <div className="space-y-5 pb-4">
      <PageHeader title="Settings" fallback="/app/profile" />

      <div>
        <SectionLabel>Notifications</SectionLabel>
        <Card pad="roomy">
          <p className="text-xs text-muted">
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
                loading={pushBusy}
              >
                {pushState === 'subscribed' ? 'Turn off' : 'Turn on'}
              </Button>
            )}
          </div>

          {pushState === 'subscribed' && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Test it</p>
                <p className="text-xs text-muted">
                  Lock your phone, then tap, it should buzz within a few seconds.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onTestPush}
                loading={testBusy}
                loadingLabel="Sending…"
              >
                Send test
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionLabel>Account</SectionLabel>
        <div className="space-y-3">
          <button type="button" onClick={openPin} className="block w-full text-left">
            <Card interactive pad="roomy">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Change PIN</p>
                  <p className="text-xs text-muted">Pick a new PIN for signing in.</p>
                </div>
                <span className="shrink-0 text-lg text-muted">›</span>
              </div>
            </Card>
          </button>

          <button
            type="button"
            onClick={() => setWhatsNewOpen(true)}
            className="block w-full text-left"
          >
            <Card interactive pad="roomy">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">What's new</p>
                  <p className="text-xs text-muted">See the latest updates and features.</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted">
                  v{LATEST_VERSION}
                </span>
              </div>
            </Card>
          </button>

          <InstallButton className="w-full" />
        </div>
      </div>

      <Button
        variant="ghost"
        className="w-full text-danger"
        onClick={() => setSignOutOpen(true)}
      >
        <LogOutIcon className="h-4.5 w-4.5" /> Sign out
      </Button>

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        message="You'll need your username and PIN to get back in."
        confirmLabel="Sign out"
        busy={signingOut}
        onConfirm={() => void onSignOut()}
        onClose={() => setSignOutOpen(false)}
      />

      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="Change PIN">
        <form onSubmit={onChangePin} className="space-y-4">
          <Input
            label="Current PIN"
            type="password"
            revealable
            inputMode="numeric"
            autoComplete="current-password"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
            required
          />
          <Input
            label="New PIN"
            type="password"
            revealable
            inputMode="numeric"
            autoComplete="new-password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            required
          />
          <Input
            label="Confirm new PIN"
            type="password"
            revealable
            inputMode="numeric"
            autoComplete="new-password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            error={pinError ?? undefined}
            required
          />
          <Button type="submit" size="lg" className="w-full" loading={pinSaving}>
            Change PIN
          </Button>
        </form>
      </Sheet>

      <Sheet open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} title="What's new">
        <ChangelogList entries={CHANGELOG} />
        <Button size="lg" className="mt-5 w-full" onClick={() => setWhatsNewOpen(false)}>
          Got it
        </Button>
      </Sheet>
    </div>
  )
}

function pushHint(state: PushState): string {
  switch (state) {
    case 'subscribed':
      return 'On, alerts arrive even when the app is closed.'
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
