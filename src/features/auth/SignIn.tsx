import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { TicketIcon } from '@/components/ui/icons'
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
      <Link
        to="/claim"
        className="mb-4 flex items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 text-left transition-colors hover:bg-brand-500/10"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
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
        <div className="-mt-1 text-right">
          <Link to="/reset" className="text-sm font-medium text-brand-500 hover:underline">
            Forgot your PIN?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
