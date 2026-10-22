import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useTransform } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { InstallButton } from '@/components/pwa/InstallButton'
import { Aurora } from '@/components/landing/Aurora'
import { Reveal, revealIconVariants } from '@/components/landing/Reveal'
import { ScoreboardDemo } from '@/components/landing/ScoreboardDemo'
import { BoardPreview } from '@/components/landing/BoardPreview'
import { LandingScrollProvider, useLandingScroll } from '@/components/landing/scroll'
import {
  BoltIcon,
  ChevronDownIcon,
  FlameIcon,
  KeyIcon,
  ScanIcon,
  StarIcon,
  TicketIcon,
  TrophyIcon,
} from '@/components/ui/icons'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/cn'

// Instructor sign-in is unlinked (router.tsx). Inside an installed PWA there's
// no address bar to type it into, so reveal it with a secret gesture: tap the
// footer 5 times within 2 seconds.
const INSTRUCTOR_PATH = '/macalesideauth'
const SECRET_TAPS = 5
const TAP_WINDOW_MS = 2000

/** Header height, in px. The hero pads by exactly this to fill one screen. */
const HEADER_H = 56

const STEPS = [
  {
    Icon: KeyIcon,
    title: 'Claim mo muna account mo',
    body: 'If wala ka pang account, contact your instructor to claim a token for account creation.',
  },
  {
    Icon: BoltIcon,
    title: 'Grind kang points sa class yah',
    body: 'Recitations and activities can gain you points, it can beawarded live while class is running.',
  },
  {
    Icon: TrophyIcon,
    title: 'Tignan mo sa leaderboard kung gaano ka kalakas',
    body: 'Points are XP. Fill the bar, level up, and watch your rank move on the rankings.',
  },
]

/** What you get, deliberately NOT a restatement of the steps above. */
const FEATURES = [
  {
    Icon: ScanIcon,
    title: 'Offline QR attendance-in',
    body: 'Point your camera. Works offline and syncs when you are back.',
  },
  {
    Icon: StarIcon,
    title: 'Badges',
    body: 'Be active to unlock certain hidden achievements.',
  },
  {
    Icon: FlameIcon,
    title: 'Streaks',
    body: 'Consistency. Turn up on time, and keep the flame lit.',
  },
  {
    Icon: TicketIcon,
    title: 'Points',
    body: 'Gain points then spend points on certain quizzes and activities.',
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
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled(y > window.innerHeight * 0.6)
  })

  /** The aurora lags the page, which is what reads as depth. */
  const auroraY = useTransform(scrollY, [0, 900], [0, 180])

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

        {/* Scroll progress, styled as an XP rail rather than as generic chrome
            — filling a gold bar is this product's own metaphor for progress,
            so the page's own scroll uses it too. Bound to a MotionValue, so it
            updates every frame without re-rendering anything. */}
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
          <Aurora offset={auroraY} />

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
                  <button
                    type="button"
                    onClick={() => navigate('/claim')}
                    className="cp-tap-y rounded-lg px-1 py-1 text-sm text-muted transition-colors hover:text-ink"
                  >
                    First time here?{' '}
                    <span className="font-semibold text-accent">Claim your account</span>
                  </button>
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
          <div className="mx-auto max-w-5xl px-5 py-16">
            <Reveal>
              <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">
                Bago pumasok? Note mo to yah
              </h2>
            </Reveal>

            <ol className="mt-10 grid gap-4 sm:grid-cols-3">
              {STEPS.map(({ Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 0.08} className="h-full">
                  <motion.li
                    whileHover={{ y: -4 }}
                    whileTap={{ y: -2, scale: 0.99 }}
                    transition={spring}
                    className="h-full rounded-xl border border-line bg-card p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-solid text-sm font-bold text-white">
                        {i + 1}
                      </span>

                      <motion.span variants={revealIconVariants} className="inline-flex">
                        <Icon className="h-5 w-5 text-accent" />
                      </motion.span>
                    </div>
                    <p className="mt-3 font-display font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-muted">{body}</p>
                  </motion.li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* what you get */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <Reveal>
              <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">
                What is in it for you
              </h2>
            </Reveal>

            <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {FEATURES.map(({ Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 0.06} className="h-full">
                  <motion.div
                    whileHover={{ y: -4 }}
                    whileTap={{ y: -2, scale: 0.99 }}
                    transition={spring}
                    className="h-full rounded-xl border border-line bg-card p-4"
                  >
                    <motion.div
                      variants={revealIconVariants}
                      className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-reward-solid/15 text-reward"
                    >
                      <Icon className="h-5 w-5" />
                    </motion.div>
                    <p className="font-display font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-muted">{body}</p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* board*/}
        <section className="border-t border-line bg-card-2">
          <div className="mx-auto max-w-xl px-5 py-16">
            <Reveal className="text-center">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Everyone can see it</h2>
              <p className="mx-auto mt-3 max-w-md text-muted">
                The board settles twice a day. Every section, one ranking, and your row is the one
                you will keep checking.
              </p>
            </Reveal>

            <BoardPreview className="mt-8" />
          </div>
        </section>

        {/*install div*/}
        <section className="border-t border-line">
          <div className="mx-auto max-w-xl px-5 py-16">
            <Reveal>
              <div className="rounded-2xl border border-line bg-card p-6 text-center">
                <Logo className="mx-auto h-12 w-12" />
                <h2 className="mt-4 font-display text-xl font-bold">Put it on your home screen</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  Opens like a real app, checks you in without a signal, and can nudge you when
                  points land.
                </p>
                <InstallButton className="mx-auto mt-5 w-full max-w-xs" />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        <button
          type="button"
          onClick={onSecretTap}
          aria-label="ClassPoint"
          className="cursor-default select-none bg-transparent text-xs text-muted focus:outline-none"
        >
          ClassPoint · Version 6.0
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
