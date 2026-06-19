import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/lib/auth'

export function SignIn() {
  const { signInStudent } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    setBusy(true)
    const { error } = await signInStudent(username, pin)
    setBusy(false)
    if (error) setError(error)
    else navigate('/app', { replace: true })
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Enter your username and PIN to see your points."
      footer={
        <>
          First time?{' '}
          <Link to="/claim" className="font-semibold text-brand-500 hover:underline">
            Claim your account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          spellCheck={false}
          placeholder="e.g. juan_dc"
          required
        />
        <Input
          label="PIN"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="current-password"
          placeholder="Your PIN"
          required
          error={error}
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 border-t border-line pt-4 text-center">
        <Link to="/instructor/signin" className="text-sm text-muted hover:text-ink">
          Instructor sign in
        </Link>
      </div>
    </AuthShell>
  )
}
