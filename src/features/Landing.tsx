import { useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { BoltIcon, StarIcon, TrophyIcon } from '@/components/ui/icons'

// Instructor sign-in is unlinked (router.tsx). Inside an installed PWA there's
// no address bar to type it, so reveal it with a secret gesture: tap the footer
// 5 times within 2 seconds.
const INSTRUCTOR_PATH = '/macalesideauth'
const SECRET_TAPS = 5
const TAP_WINDOW_MS = 2000

const features = [
  { Icon: BoltIcon, title: 'Earn points', body: 'Recitation and activities — 1 to 5 points, awarded live in class.' },
  { Icon: StarIcon, title: 'Level up', body: 'Points become XP. Fill the bar, level up, and keep grinding.' },
  { Icon: TrophyIcon, title: 'Climb ranks', body: 'See where you stand across every section on the leaderboard.' },
]

export function Landing() {
  const navigate = useNavigate()

  // Secret tap counter for revealing the instructor sign-in inside the PWA.
  const taps = useRef(0)
  const firstTapAt = useRef(0)

  function onSecretTap() {
    const now = Date.now()
    if (now - firstTapAt.current > TAP_WINDOW_MS) {
      taps.current = 0
      firstTapAt.current = now
    }
    taps.current += 1
    if (taps.current >= SECRET_TAPS) {
      taps.current = 0
      navigate(INSTRUCTOR_PATH)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="font-display text-lg font-bold tracking-tight">ClassPoint</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center">
            <Logo className="h-20 w-20" />
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight">
            Turn class points into <span className="text-brand-500">XP</span>.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            A pointing/leveling system for the classroom. Earn points in class, level up, and climb the
            leaderboard, built for DCT-CCS students who likes the grind.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-8 grid w-full max-w-sm gap-3"
        >
          <Button size="lg" onClick={() => navigate('/signin')}>
            <StarIcon className="h-5 w-5" /> Student sign in
          </Button>
          <button
            type="button"
            onClick={() => navigate('/claim')}
            className="text-sm text-muted hover:text-ink"
          >
            First time? <span className="font-semibold text-brand-500">Claim your account</span>
          </button>
        </motion.div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {features.map(({ Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
              className="rounded-2xl border border-line bg-card p-4"
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                <Icon className="h-5 w-5" />
              </div>
              <p className="font-display font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </motion.div>
          ))}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted">
        <button
          type="button"
          onClick={onSecretTap}
          aria-label="ClassPoint"
          className="cursor-default select-none bg-transparent text-xs text-muted focus:outline-none"
        >
          ClassPoint · early build
        </button>
      </footer>
    </div>
  )
}
