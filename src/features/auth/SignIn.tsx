import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AuthShell } from './AuthShell'
import { ClaimDoor } from '@/components/auth/ClaimDoor'
import { useAuthTransition } from '@/components/auth/AuthTransition'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { CheckIcon } from '@/components/ui/icons'
import { useAuth } from '@/lib/auth'
import { formatCountdown, useLockout } from '@/lib/useLockout'
import { forgetUsername, getRememberedUsername, rememberUsername } from '@/lib/auth-prefs'
import { useCapsLock } from '@/lib/useCapsLock'
import { listVariants, rowVariants } from '@/lib/motion'

export function SignIn() {
  const { signInStudent } = useAuth()
  const lock = useLockout('cp_student_login', { threshold: 5, baseMs: 60_000 })
  const transition = useAuthTransition()
  const { capsOn, capsProps } = useCapsLock()

  const remembered = getRememberedUsername()
  const [username, setUsername] = useState(remembered)
  const [prefilled, setPrefilled] = useState(remembered !== '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const usernameRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)

  // Land the cursor in the first EMPTY field: a returning student whose
  // username is remembered starts on the PIN, everyone else on the username.
  useEffect(() => {
    ;(remembered ? pinRef : usernameRef).current?.focus()
  }, [remembered])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (lock.locked || transition.active) return
    setError(undefined)
    setBusy(true)
    const { error } = await signInStudent(username, pin)
    setBusy(false)
    if (error) {
      lock.registerFailure()
      setError(error)
    } else {
      lock.reset()
      rememberUsername(username)
      setDone(true)
      transition.start()
    }
  }

  function notYou() {
    forgetUsername()
    setUsername('')
    setPrefilled(false)
    usernameRef.current?.focus()
  }

  const disabled = busy || lock.locked || transition.active

  return (
    <AuthShell
      title="Welcome!"
      subtitle="Log in to your account to access your progress."
      // The claim stub is the ONLY route to /claim on this screen, and it is
      // deliberately not repeated in the footer — see ClaimDoor's own note.
      below={<ClaimDoor />}
    >
      <motion.form
        onSubmit={onSubmit}
        className="space-y-4"
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={rowVariants}>
          <Input
            ref={usernameRef}
            label="Username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setPrefilled(false)
            }}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            hint={prefilled ? undefined : 'The username you chose when claiming, not your token.'}
            placeholder="Your username"
            disabled={disabled}
            required
          />
          {prefilled && (
            <button
              type="button"
              onClick={notYou}
              className="cp-tap-y mt-1.5 rounded px-0.5 text-sm text-accent hover:underline"
            >
              Not you?
            </button>
          )}
        </motion.div>

        <motion.div variants={rowVariants}>
          <Input
            ref={pinRef}
            label="PIN"
            type="password"
            revealable
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="current-password"
            placeholder="Your PIN"
            disabled={disabled}
            required
            error={error}
            {...capsProps}
          />
          {capsOn && !error && <p className="mt-1.5 text-sm text-warn">Caps Lock is on.</p>}
        </motion.div>

        <motion.div variants={rowVariants} className="-mt-1 text-right">
          <Link to="/reset" className="text-sm font-medium text-accent hover:underline">
            Forgot your PIN? Click here
          </Link>
        </motion.div>

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
              ? 'Signed in'
              : lock.locked
                ? `Locked · ${formatCountdown(lock.remainingMs)}`
                : busy
                  ? 'Signing in…'
                  : 'Sign in'}
          </Button>
        </motion.div>
      </motion.form>
    </AuthShell>
  )
}
