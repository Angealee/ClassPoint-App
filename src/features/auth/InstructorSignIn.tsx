import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ShieldIcon } from '@/components/ui/icons'
import { useAuth } from '@/lib/auth'
import { formatCountdown, useLockout } from '@/lib/useLockout'

export function InstructorSignIn() {
  const { signInInstructor } = useAuth()
  const navigate = useNavigate()
  const lock = useLockout('cp_instr_login', { threshold: 5, baseMs: 60_000 })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (lock.locked) return
    setError(undefined)
    setBusy(true)
    const { error } = await signInInstructor(email, password)
    setBusy(false)
    if (error) {
      lock.registerFailure()
      setError(error)
    } else {
      lock.reset()
      navigate('/teach', { replace: true })
    }
  }

  const disabled = busy || lock.locked

  return (
    <AuthShell
      title="Instructor sign in"
      subtitle="Manage sections, students, and points."
      footer={
        <Link to="/signin" className="text-muted hover:text-ink">
          ← Student sign in
        </Link>
      }
    >
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
        <ShieldIcon className="h-6 w-6" />
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none"
          autoComplete="email"
          spellCheck={false}
          placeholder="you@dct.edu.ph"
          disabled={disabled}
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={disabled}
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
              ? 'Signing in…'
              : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
