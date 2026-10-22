import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AuthShell } from './AuthShell'
import { useAuthTransition } from '@/components/auth/AuthTransition'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { CheckIcon, KeyIcon } from '@/components/ui/icons'
import { useAuth } from '@/lib/auth'
import { formatCountdown, useLockout } from '@/lib/useLockout'
import { useCapsLock } from '@/lib/useCapsLock'
import { listVariants, rowVariants } from '@/lib/motion'

export function ResetPin() {
  const { resetPin } = useAuth()
  // Client-side speed bump over the server's per-IP limit. Only SERVER
  // rejections count — a local typo caught by validate() below is not an
  // attempt at anything.
  const lock = useLockout('cp_reset_pin', { threshold: 5, baseMs: 60_000 })
  const transition = useAuthTransition()
  const { capsOn, capsProps } = useCapsLock()
  const [token, setToken] = useState('')
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
    if (!token.trim()) return 'Enter the reset code your instructor gave you.'
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
    const { error } = await resetPin(token.trim(), pin)
    setBusy(false)
    if (error) {
      lock.registerFailure()
      setError(error)
    } else {
      lock.reset()
      setDone(true)
      transition.start()
    }
  }

  const disabled = busy || lock.locked || transition.active

  return (
    <AuthShell
      title="Reset your PIN"
      subtitle="Ask your instructor for a reset code, then choose a new PIN."
      icon={<KeyIcon className="h-6 w-6" />}
      footer={
        <>
          Remembered it?{' '}
          <Link to="/signin" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {/* Same two-group split as Claim, for the same reason: the code is handed
          to you, the PIN is chosen by you. */}
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
            label="Reset code"
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            hint="A one-time code. Expires after 24 hours."
            placeholder="e.g. 9F3A1C7B2D8E406A"
            disabled={disabled}
            required
          />
        </motion.section>

        <motion.section variants={rowVariants} className="space-y-4 border-t border-line pt-5">
          <SectionLabel className="mb-0">2 · Your new PIN</SectionLabel>
          <div>
            <Input
              label="New PIN"
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
            label="Confirm new PIN"
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

        {/* Was rendered under "Confirm new PIN", so a complaint about the RESET
            CODE appeared at the opposite end of the form from the code box. */}
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
              ? 'Done'
              : lock.locked
                ? `Locked · ${formatCountdown(lock.remainingMs)}`
                : busy
                  ? 'Resetting…'
                  : 'Reset PIN & sign in'}
          </Button>
        </motion.div>
      </motion.form>
    </AuthShell>
  )
}
