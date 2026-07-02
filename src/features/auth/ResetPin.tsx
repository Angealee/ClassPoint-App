import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from './AuthShell'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/lib/auth'

export function ResetPin() {
  const { resetPin } = useAuth()
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  function validate(): string | undefined {
    if (!token.trim()) return 'Enter the reset code your instructor gave you.'
    if (pin.length < 6) return 'PIN must be at least 6 characters.'
    if (pin !== pin2) return 'PINs do not match.'
    return undefined
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setError(undefined)
    setBusy(true)
    const { error } = await resetPin(token.trim(), pin)
    setBusy(false)
    if (error) setError(error)
    else navigate('/app', { replace: true })
  }

  return (
    <AuthShell
      title="Reset your PIN"
      subtitle="Ask your instructor for a reset code, then choose a new PIN."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/signin" className="font-semibold text-brand-500 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Reset code"
          value={token}
          onChange={(e) => setToken(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          hint="A one-time code from your instructor. Expires after 24 hours."
          placeholder="e.g. 9F3A1C7B"
          required
        />
        <Input
          label="New PIN"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="new-password"
          hint="At least 6 characters."
          required
        />
        <Input
          label="Confirm new PIN"
          type="password"
          value={pin2}
          onChange={(e) => setPin2(e.target.value)}
          autoComplete="new-password"
          required
          error={error}
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Resetting…' : 'Reset PIN & sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
