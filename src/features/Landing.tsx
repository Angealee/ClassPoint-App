import { LATEST_VERSION } from '@/lib/changelog'
import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { InstallButton } from '@/components/pwa/InstallButton'
import { ClaimDoor } from '@/components/auth/ClaimDoor'
import { Reveal } from '@/components/landing/Reveal'
import { ScoreboardDemo } from '@/components/landing/ScoreboardDemo'
import { BoardPreview } from '@/components/landing/BoardPreview'
import { LandingScrollProvider, useLandingScroll } from '@/components/landing/scroll'
import { ChevronDownIcon } from '@/components/ui/icons'
import { usePwaInstall } from '@/lib/pwa'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/cn'

const INSTRUCTOR_PATH = '/macalesideauth'
const SECRET_TAPS = 5
const TAP_WINDOW_MS = 2000

const HEADER_H = 56

const STEPS = [
  {
    title: 'Claim mo muna account mo',
    body: 'If wala ka pang account, contact your instructor to claim a token for account creation.',
  },
  {
    title: 'Grind kang points sa class yah',
    body: 'Recitations and activities can gain you points, it can be awarded live while class is running.',
  },
  {
    title: 'Tignan mo sa leaderboard kung gaano ka kalakas',
    body: 'Points are XP. Fill the bar, level up, and watch your rank move on the rankings.',
  },
]

export function Landing() {
  return (
    <LandingScrollProvider>
      <LandingPage />
    </LandingScrollProvider>
  )
}

function LandingPage() {
  const navigate = useNavigate()
  const { scrollY, progress } = useLandingScroll()
  const { state: installState } = usePwaInstall()
  const canInstall = installState === 'installable' || installState === 'ios' || installState === 'inapp'
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled(y > window.innerHeight * 0.6)
  })

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
    <div className="flex min-h-dvh flex-col">
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-30 transition-colors duration-300',
          scrolled ? 'border-b border-line bg-canvas/80 backdrop-blur-md' : 'border-b border-transparent',
        )}
        style={{ height: HEADER_H }}
      >
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="font-display text-lg font-bold tracking-tight">ClassPoint</span>
          </div>

          <div className="flex items-center gap-2">

            <AnimatePresence>
              {scrolled && (
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={spring}
                >
                  <Button size="sm" onClick={() => navigate('/signin')}>
                    Sign in
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            <ThemeToggle />
          </div>
        </div>

        <motion.div
          aria-hidden
          style={{ scaleX: progress }}
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-linear-to-r from-gold-500 to-gold-300"
        />
      </header>

      <main className="flex-1">
       
        <section
          className="relative flex min-h-dvh flex-col"
          style={{ paddingTop: HEADER_H }}
        >
          <div className="relative mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-6">
            <div className="grid w-full gap-8 lg:grid-cols-2 lg:gap-14">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className="text-center lg:text-left"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-solid/10 px-3 py-1 text-2xs font-semibold uppercase tracking-widest text-accent">
                  Built by the CEO
                </span>

                <h1 className="mt-4 font-display text-3xl font-bold leading-[1.1] sm:text-5xl">
                  Class 'points' into <span className="text-reward">XP</span>.
                </h1>

                <p className="mx-auto mt-3 max-w-md text-muted lg:mx-0">
                  Recite, be active, get points. See your progress on the
                  leaderboard.
                </p>

                
                <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3 lg:mx-0 lg:items-start">
                  <Button size="lg" className="w-full" onClick={() => navigate('/signin')}>
                    Sign in
                  </Button>
                  <ClaimDoor className="w-full text-left" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: 0.12 }}
                className="mx-auto w-full max-w-sm lg:max-w-none"
              >
                <ScoreboardDemo />
              </motion.div>
            </div>
          </div>

          <div className="relative flex shrink-0 justify-center pb-6">
            <a
              href="#how"
              className="cp-tap-y flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-2xs font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink"
            >
              How it works
              <ChevronDownIcon className="cp-bob h-4 w-4" />
            </a>
          </div>
        </section>

        <section id="how" className="border-t border-line bg-card-2" style={{ scrollMarginTop: HEADER_H }}>
          <div className="mx-auto max-w-2xl px-5 py-14">
            <Reveal>
              <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">
                Bago pumasok? Note mo to yah
              </h2>
            </Reveal>

            <ol className="mt-8 divide-y divide-line border-y border-line">
              {STEPS.map(({ title, body }, i) => (
                <li key={title} className="flex gap-4 py-4">
                  <span
                    aria-hidden
                    className="w-6 shrink-0 pt-0.5 text-right font-display text-xl font-bold tabular-nums text-accent"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display font-semibold">{title}</p>
                    <p className="mt-0.5 text-sm text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-6 text-center text-sm text-ink">
              Points reset every semester and never become your grade.
            </p>
          </div>
        </section>

        {/* board*/}
        <section className="border-t border-line bg-card-2">
          <div className="mx-auto max-w-xl px-5 py-16">
            <Reveal className="text-center">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Everyone can see it</h2>
              <p className="mx-auto mt-3 max-w-md text-muted">
                Leaderboard settle per day. Will you be able to reach the top?
              </p>
            </Reveal>

            <BoardPreview className="mt-8" />
          </div>
        </section>

        {canInstall && (
          <section className="border-t border-line">
            <div className="mx-auto max-w-xl px-5 py-12">
              <Reveal>
                <div className="rounded-2xl border border-line bg-card p-6 text-center">
                  <Logo className="mx-auto h-12 w-12" />
                  <h2 className="mt-4 font-display text-xl font-bold">Put it on your home screen</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                    Opens like an app and records your attendance even without a signal.
                  </p>
                  <InstallButton className="mx-auto mt-5 w-full max-w-xs" />
                </div>
              </Reveal>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        <button
          type="button"
          onClick={onSecretTap}
          aria-label="ClassPoint"
          className="cursor-default select-none bg-transparent text-xs text-muted focus:outline-none"
        >
          ClassPoint · Version {LATEST_VERSION}
        </button>
      </footer>
      
      <AnimatePresence>
        {scrolled && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            transition={spring}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
            className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-muted shadow-lg transition-colors hover:text-ink"
          >
            <ChevronDownIcon className="h-5 w-5 rotate-180" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
