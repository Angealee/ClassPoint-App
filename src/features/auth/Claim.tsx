import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AuthShell } from './AuthShell'
import { useAuthTransition } from '@/components/auth/AuthTransition'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { CheckIcon, TicketIcon } from '@/components/ui/icons'
import { USERNAME_RE, useAuth } from '@/lib/auth'
import { formatCountdown, useLockout } from '@/lib/useLockout'
import { rememberUsername } from '@/lib/auth-prefs'
import { useCapsLock } from '@/lib/useCapsLock'
import { listVariants, rowVariants } from '@/lib/motion'

export function Claim() {
  const { claim } = useAuth()
  // Client-side speed bump over the server's per-IP limit. Only SERVER
  // rejections count — a local typo caught by validate() below is not an
  // attempt at anything.
  const lock = useLockout('cp_claim', { threshold: 5, baseMs: 60_000 })
  const transition = useAuthTransition()
  const { capsOn, capsProps } = useCapsLock()
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const tokenRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    tokenRef.current?.focus()
  }, [])

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
    if (lock.locked || transition.active) return
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
    })
    setBusy(false)
    if (error) {
      lock.registerFailure()
      setError(error)
    } else {
      lock.reset()
      // So their first ordinary sign-in on this phone remembers them.
      rememberUsername(username)
      setDone(true)
      transition.start()
    }
  }

  const disabled = busy || lock.locked || transition.active

  return (
    <AuthShell
      title="Claim your account"
      subtitle="One token, once. Then you pick the username and PIN you keep."
      icon={<TicketIcon className="h-6 w-6" />}
      footer={
        <>
          Already set up?{' '}
          <Link to="/signin" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {/* Six stacked fields read as a wall, and they are not one job: the token
          is something you were HANDED, the rest is something you CHOOSE. The
          two groups say that, so nobody hunts for which box the token goes in. */}
      <motion.form
        onSubmit={onSubmit}
        className="space-y-6"
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        <motion.section variants={rowVariants}>
          <SectionLabel>1 · From your instructor</SectionLabel>
          <Input
            ref={tokenRef}
            label="Token"
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            hint="One-time. It stops working the moment this account exists."
            placeholder="e.g. 9F3A1C7B2D8E406A"
            disabled={disabled}
            required
          />
        </motion.section>

        <motion.section variants={rowVariants} className="space-y-4 border-t border-line pt-5">
          <SectionLabel className="mb-0">2 · The login you keep</SectionLabel>
          <Input
            label="Choose a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            hint="This is how you'll log in. Lowercase, no spaces."
            placeholder="e.g. juan_dc"
            disabled={disabled}
            required
          />
          <div>
            <Input
              label="PIN"
              type="password"
              revealable
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="new-password"
              hint="At least 6 characters."
              disabled={disabled}
              required
              {...capsProps}
            />
            {capsOn && <p className="mt-1.5 text-sm text-warn">Caps Lock is on.</p>}
          </div>
          <Input
            label="Confirm PIN"
            type="password"
            revealable
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
            autoComplete="new-password"
            disabled={disabled}
            required
            {...capsProps}
          />
        </motion.section>

        {/* The error used to render under "Confirm PIN" whatever it was about,
            so "Enter the token your instructor gave you." appeared at the far
            end of the form from the token box. It gets its own block now. */}
        {error && (
          <motion.p
            variants={rowVariants}
            role="alert"
            className="rounded-xl bg-danger-solid/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </motion.p>
        )}
        {lock.locked && (
          <motion.p
            variants={rowVariants}
            className="rounded-xl bg-danger-solid/10 px-3 py-2 text-sm text-danger"
          >
            Too many attempts. Try again in {formatCountdown(lock.remainingMs)}.
          </motion.p>
        )}
        <motion.div variants={rowVariants}>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={disabled}
            loading={busy}
            icon={done ? <CheckIcon className="h-5 w-5" /> : undefined}
          >
            {done
              ? 'All set'
              : lock.locked
                ? `Locked · ${formatCountdown(lock.remainingMs)}`
                : busy
                  ? 'Setting up…'
                  : 'Claim & sign in'}
          </Button>
        </motion.div>
      </motion.form>
    </AuthShell>
  )
}
