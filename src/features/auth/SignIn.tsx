import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { TicketIcon } from '@/components/ui/icons'
import { useAuth } from '@/lib/auth'
import { formatCountdown, useLockout } from '@/lib/useLockout'

export function SignIn() {
  const { signInStudent } = useAuth()
  const navigate = useNavigate()
  const lock = useLockout('cp_student_login', { threshold: 5, baseMs: 60_000 })
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (lock.locked) return
    setError(undefined)
    setBusy(true)
    const { error } = await signInStudent(username, pin)
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
      title="Sign in"
      subtitle="Enter your username and PIN to see your points."
      footer={
        <>
          First time?{' '}
          <Link to="/claim" className="font-semibold text-accent hover:underline">
            Claim your account
          </Link>
        </>
      }
    >
      <Link
        to="/claim"
        className="mb-4 flex items-center gap-3 rounded-xl border border-accent-solid/30 bg-accent-solid/5 p-3 text-left transition-colors hover:bg-accent-solid/10"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-solid/10 text-accent">
          <TicketIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">First time? Have a token?</span>
          <span className="block text-xs text-muted">
            Claim your account to set your username &amp; PIN.
          </span>
        </span>
      </Link>

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          spellCheck={false}
          hint="The username you chose when claiming — not your token."
          placeholder="Your username"
          disabled={disabled}
          required
        />
        <Input
          label="PIN"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="current-password"
          placeholder="Your PIN"
          disabled={disabled}
          required
          error={error}
        />
        <div className="-mt-1 text-right">
          <Link to="/reset" className="text-sm font-medium text-accent hover:underline">
            Forgot your PIN?
          </Link>
        </div>
        {lock.locked && (
          <p className="rounded-xl bg-danger-solid/10 px-3 py-2 text-sm text-danger">
            Too many attempts. Try again in {formatCountdown(lock.remainingMs)}.
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={disabled}>
          {lock.locked
            ? `Locked · ${formatCountdown(lock.remainingMs)}`
            : busy
              ? 'Signing in…'
              : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
