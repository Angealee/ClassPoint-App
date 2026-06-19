import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ShieldIcon } from '@/components/ui/icons'
import { useAuth } from '@/lib/auth'

export function InstructorSignIn() {
  const { signInInstructor } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    setBusy(true)
    const { error } = await signInInstructor(email, password)
    setBusy(false)
    if (error) setError(error)
    else navigate('/teach', { replace: true })
  }

  return (
    <AuthShell
      title="Instructor sign in"
      subtitle="Manage sections, rosters, and points."
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
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          error={error}
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
