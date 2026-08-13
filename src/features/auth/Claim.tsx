import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { USERNAME_RE, useAuth } from '@/lib/auth'
import { formatCountdown, useLockout } from '@/lib/useLockout'

export function Claim() {
  const { claim } = useAuth()
  const navigate = useNavigate()
  // Client-side speed bump over the server's per-IP limit. Only SERVER
  // rejections count — a local typo caught by validate() below is not an
  // attempt at anything.
  const lock = useLockout('cp_claim', { threshold: 5, baseMs: 60_000 })
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  function validate(): string | undefined {
    if (!token.trim()) return 'Enter the token your instructor gave you.'
    if (!USERNAME_RE.test(username.trim().toLowerCase()))
      return 'Username: 3–20 characters, lowercase letters/numbers/underscore, starting with a letter.'
    if (pin.length < 6) return 'PIN must be at least 6 characters.'
    if (pin !== pin2) return 'PINs do not match.'
    return undefined
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (lock.locked) return
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setError(undefined)
    setBusy(true)
    const { error } = await claim({
      token: token.trim(),
      username: username.trim().toLowerCase(),
      pin,
      displayName: displayName.trim() || undefined,
    })
    setBusy(false)
    if (error) {
      lock.registerFailure()
      setError(error)
    } else {
      lock.reset()
      navigate('/app', { replace: true })
    }
  }

  const disabled = busy || lock.locked

  return (
    <AuthShell
      title="Claim your account"
      subtitle="Use your one-time token to set up your login."
      footer={
        <>
          Already set up?{' '}
          <Link to="/signin" className="font-semibold text-brand-500 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Token"
          value={token}
          onChange={(e) => setToken(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="e.g. 9F3A1C7B2D8E406A"
          disabled={disabled}
          required
        />
        <Input
          label="Choose a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          hint="This is how you'll log in. Lowercase, no spaces."
          placeholder="e.g. juan_dc"
          required
        />
        <Input
          label="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          hint="Shown on the leaderboard. Leave blank to use your full name."
          placeholder="e.g. Juan D."
        />
        <Input
          label="PIN"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="new-password"
          hint="At least 6 characters."
          required
        />
        <Input
          label="Confirm PIN"
          type="password"
          value={pin2}
          onChange={(e) => setPin2(e.target.value)}
          autoComplete="new-password"
          required
          error={error}
        />
        {lock.locked && (
          <p className="rounded-xl bg-brand-500/10 px-3 py-2 text-sm text-brand-500">
            Too many attempts. Try again in {formatCountdown(lock.remainingMs)}.
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={disabled}>
          {lock.locked
            ? `Locked · ${formatCountdown(lock.remainingMs)}`
            : busy
              ? 'Setting up…'
              : 'Claim & sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
