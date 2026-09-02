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

/**
 * The three steps, in the order a student actually lives them.
 *
 * These answer "what happens to me", which is a different question from the
 * feature list below ("what do I get"). The page this replaced asked both
 * questions with one set of three cards and so answered neither properly.
 */
const STEPS = [
  {
    Icon: KeyIcon,
    title: 'Claim your account',
    body: 'Your instructor hands you a token. Use it once to pick a username and a PIN.',
  },
  {
    Icon: BoltIcon,
    title: 'Earn in class',
    body: 'Recitations and activities are worth 1 to 5 points, awarded live while class is running.',
  },
  {
    Icon: TrophyIcon,
    title: 'Climb',
    body: 'Points are XP. Fill the bar, level up, and watch your rank move on the board.',
  },
]

/** What you get, deliberately NOT a restatement of the steps above. */
const FEATURES = [
  {
    Icon: ScanIcon,
    title: 'QR check-in',
    body: 'Point your camera at the board. Works offline and syncs when you are back.',
  },
  {
    Icon: StarIcon,
    title: 'Badges',
    body: 'Dozens to unlock. Some are obvious. Some are very much not.',
  },
  {
    Icon: FlameIcon,
    title: 'Streaks',
    body: 'Turn up, turn up on time, and keep the flame lit.',
  },
  {
    Icon: TicketIcon,
    title: 'Rewards',
    body: 'Spend points on whatever your instructor has put up for grabs.',
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

  /**
   * True once the hero is mostly behind you. Drives three things at once — the
   * header solidifying, the compact Sign in appearing, and the back-to-top
   * button — so they change together as one moment rather than at three
   * different scroll offsets.
   *
   * `setScrolled` is called on every scroll frame but React bails out when the
   * boolean is unchanged, so this re-renders twice per page: once crossing
   * down, once crossing back.
   */
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
      {/* ── HEADER ────────────────────────────────────────────────────────
          FIXED, not sticky, and that is what lets the hero be exactly one
          screen: a sticky header occupies flow height, so `min-h-dvh` below it
          would total a screen PLUS the bar and leave the next section peeking
          at the bottom. Fixed takes no flow height, and the hero pads by
          HEADER_H to sit clear of it.

          Transparent over the hero so the aurora runs edge to edge behind the
          logo, then it fades in its own surface once you have scrolled past. */}
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
            {/* Sign in follows you down the page, but only once the hero's own
                CTA has left the screen — two identical buttons visible at the
                same time would be two decisions where there is one. */}
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
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-gold-500 to-gold-300"
        />
      </header>

      <main className="flex-1">
        {/* ── HERO — exactly one screen ─────────────────────────────────────
            `min-h-dvh` with `paddingTop: HEADER_H`: Tailwind's border-box means
            the padding is INSIDE the 100dvh, so the section is one viewport
            tall including its clearance, and nothing below it can peek. The
            content takes `flex-1` and centres; the cue pins to the bottom. */}
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
                  Built for DCT-CCS
                </span>

                {/* `text-3xl` on a phone, not `text-4xl`: at 36px this headline
                    wraps to three lines and pushes the scoreboard off the
                    screen. The scoreboard IS the pitch, so it has to be in the
                    first view — a landing page that shows nothing but words on
                    first paint is the page this replaced. */}
                <h1 className="mt-4 font-display text-3xl font-bold leading-[1.1] sm:text-5xl">
                  Turn class points into <span className="text-reward">XP</span>.
                </h1>

                <p className="mx-auto mt-3 max-w-md text-muted lg:mx-0">
                  Recite, join in, show up. Your points become levels, badges, and a place on the
                  leaderboard.
                </p>

                {/* ── ONE action, one quiet alternative ───────────────────────
                    This used to be three targets of near-equal weight (sign in,
                    claim, install) stacked in a column, which is three
                    decisions where there should be one. Install moved to its
                    own section at the foot of the page: worth doing, but never
                    the reason somebody opened this URL. */}
                <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3 lg:mx-0 lg:items-start">
                  <Button size="lg" className="w-full" onClick={() => navigate('/signin')}>
                    Sign in
                  </Button>
                  <button
                    type="button"
                    onClick={() => navigate('/claim')}
                    className="rounded-lg px-1 py-1 text-sm text-muted transition-colors hover:text-ink"
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

          {/* Scroll cue, pinned to the bottom of the viewport. A real anchor
              rather than a decorative chevron: it says what is below AND takes
              you there, which is the difference between an affordance and an
              ornament. */}
          <div className="relative flex shrink-0 justify-center pb-6">
            <a
              href="#how"
              className="flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-2xs font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink"
            >
              How it works
              <ChevronDownIcon className="cp-bob h-4 w-4" />
            </a>
          </div>
        </section>

        {/* ── HOW IT WORKS ───────────────────────────────────────────────────
            Numbered, because these are sequential and the feature grid below is
            not. The number is the visual anchor; the icon supports it.
            `scroll-mt` clears the FIXED header when the cue jumps here. */}
        <section id="how" className="border-t border-line bg-card-2" style={{ scrollMarginTop: HEADER_H }}>
          <div className="mx-auto max-w-5xl px-5 py-16">
            <Reveal>
              <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">
                Three steps, then you are playing
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
                      {/* Inherits the parent Reveal's variant, so it pops just
                          after the card lands — and replays with it. */}
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

        {/* ── WHAT YOU GET ───────────────────────────────────────────────────
            Two columns even on a phone: these are four short labels, and a
            single stacked column of four would push the board preview a whole
            screen further down for no gain in legibility. */}
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

        {/* ── THE BOARD ────────────────────────────────────────────────────── */}
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

        {/* ── INSTALL ────────────────────────────────────────────────────────
            The install prompt gets its own moment at the end, where somebody
            who has read this far is actually deciding to use the thing —
            rather than as a third button competing with sign-in at the top. */}
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

      {/* Back to top. Four screens is far enough that scrolling back by hand is
          a chore, and it shares the `scrolled` moment with the header so the
          two never disagree about where the hero ended. */}
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
            className="fixed bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-muted shadow-lg transition-colors hover:text-ink"
          >
            <ChevronDownIcon className="h-5 w-5 rotate-180" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
