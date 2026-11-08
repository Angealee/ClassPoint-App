import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import {
  LeaderboardDemo,
  PointsDemo,
  ScanDemo,
  SpendDemo,
} from '@/components/tour/TourDemos'
import { ease } from '@/lib/motion'
import { cn } from '@/lib/cn'

/**
 * The four cards. A title and ONE line each — the brief was that students skip
 * wordy instructions, so the demo carries the explanation and the words only
 * name it.
 *
 * DRAFT COPY, plain and friendly (the instructor's call). It is the one part of
 * this file that is not final until it has been read by the person whose
 * classroom it is.
 */
const CARDS: ReadonlyArray<{
  key: string
  title: string
  caption: string
  Demo: ComponentType
}> = [
  {
    key: 'points',
    title: 'Earn points, level up',
    caption: 'Recite and join activities to fill your bar.',
    Demo: PointsDemo,
  },
  {
    key: 'scan',
    title: 'Scan to record attendance',
    caption: 'Open Attend and scan your instructor’s QR.',
    Demo: ScanDemo,
  },
  {
    key: 'board',
    title: 'Climb the leaderboard',
    caption: 'Ranks refresh at 12:30 PM and 7:30 PM.',
    Demo: LeaderboardDemo,
  },
  {
    key: 'spend',
    title: 'Spend points wisely',
    caption: 'Use them on a quiz or activity. It lowers your rank.',
    Demo: SpendDemo,
  },
]

/** A swipe counts past this distance or this speed. */
const SWIPE_PX = 60
const SWIPE_VELOCITY = 500

/**
 * Ignore taps for this long after the tour appears.
 *
 * It arrives on its own once the student's data has loaded, not in response to
 * a tap, so a finger can easily be mid-tap on the dashboard behind it — and
 * without a guard that tap lands on "Next" and skips the first card before it
 * has drawn. Shorter than the celebrations' 700ms because those fire on the
 * very action that just ended; this one only has to outlast a stray tap.
 */
const TAP_GUARD_MS = 500

/**
 * The first-run tour: a full-screen deck of four mini demos.
 *
 * It replaces a three-step bottom sheet of paragraphs. The rules of when it
 * plays — the first three opens, replaying from the start, with Skip only from
 * the second — live in `lib/tour.ts` where they are tested; this component only
 * obeys `skippable`.
 *
 * ── z-[60] ─────────────────────────────────────────────────────────────────
 * Above Sheet (40) and the level-up and badge bursts (50), below the farewell
 * (90) and the auth transition (100). The layer above it in AppLayout is
 * responsible for not rendering it while a burst is up — two full-screen
 * overlays have already drawn on top of each other once in this app.
 *
 * ── FOCUS ──────────────────────────────────────────────────────────────────
 * It is a modal dialog, so it traps Tab itself. It cannot lean on Sheet's trap:
 * Sheet's handler is document-level, and a Sheet open BEHIND this would pull
 * focus back into itself.
 */
export function Tour({ skippable, onDone }: { skippable: boolean; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  /** +1 when moving forward, -1 back. Decides which side the card enters from. */
  const [dir, setDir] = useState<1 | -1>(1)

  const rootRef = useRef<HTMLDivElement>(null)
  // Set in an effect, not read from the clock during render.
  const bornAt = useRef(0)

  // Latest-ref so the key handler below depends on nothing that changes (an
  // inline-arrow `onDone` is a new identity every render — the Sheet
  // focus-trap bug).
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  const last = index === CARDS.length - 1
  const card = CARDS[index]

  const guarded = useCallback(() => Date.now() - bornAt.current >= TAP_GUARD_MS, [])

  const next = useCallback(() => {
    if (!guarded()) return
    if (index >= CARDS.length - 1) {
      doneRef.current()
      return
    }
    setDir(1)
    setIndex(index + 1)
  }, [guarded, index])

  const prev = useCallback(() => {
    if (!guarded() || index === 0) return
    setDir(-1)
    setIndex(index - 1)
  }, [guarded, index])

  useEffect(() => {
    bornAt.current = Date.now()
    // By attribute rather than a ref: Button does not forward one, and a shared
    // primitive is not worth changing for a single call site.
    rootRef.current?.querySelector<HTMLElement>('[data-tour-primary]')?.focus()

    // Scroll lock, as Sheet does: the page behind must not move under a swipe.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prev()
    } else if (e.key === 'Escape' && skippable) {
      // Escape is a skip, so it must obey the same rule as the Skip button:
      // open 1 has none.
      e.preventDefault()
      doneRef.current()
    } else if (e.key === 'Tab') {
      // ⚠ Only controls that can actually take focus. On card 1 the Back button
      //   is `invisible` (it holds its slot so Next does not jump) — and an
      //   invisible button is still in the DOM, so counting it made it the
      //   "first" focusable. Shift+Tab from Next then compared against a node
      //   focus could never be on, the wrap never fired, and focus left the
      //   dialog for the page behind it.
      const nodes = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((n) => getComputedStyle(n).visibility !== 'hidden')
      if (nodes.length === 0) return
      const first = nodes[0]
      const lastNode = nodes[nodes.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        lastNode.focus()
      } else if (!e.shiftKey && active === lastNode) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to ClassPoint"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[60] flex flex-col bg-canvas outline-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // The layer above wraps this in AnimatePresence, so it fades out rather
      // than vanishing a frame before "What's new" mounts underneath it.
      exit={{ opacity: 0 }}
      transition={ease}
    >
      <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-xs font-semibold tabular-nums text-muted" aria-live="polite">
          <span className="sr-only">Step </span>
          {index + 1} / {CARDS.length}
        </p>
        {/* Open 1 has NO Skip — the instructor's rule, and the whole point: a
            student's first time is the one time it must be seen. The slot is
            rendered either way so the counter does not shift. */}
        {skippable ? (
          <Button size="sm" variant="ghost" onClick={() => doneRef.current()}>
            Skip
          </Button>
        ) : (
          <span aria-hidden className="h-9" />
        )}
      </header>

      {/* The swipe target. `drag="x"` makes framer set `touch-action: pan-y`, so
          a vertical scroll is still the browser's and only a sideways gesture is
          ours. It snaps back to origin: the slide between cards is the inner
          element's job, and two things driving one transform fight. */}
      <motion.div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.x < -SWIPE_PX || info.velocity.x < -SWIPE_VELOCITY) next()
          else if (info.offset.x > SWIPE_PX || info.velocity.x > SWIPE_VELOCITY) prev()
        }}
      >
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={card.key}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 48 }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: d * -48 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={ease}
            className="flex w-full flex-col items-center gap-6 text-center"
          >
            <card.Demo />
            <div className="max-w-xs space-y-2">
              <h2 className="font-display text-2xl font-bold leading-tight">{card.title}</h2>
              <p className="text-sm text-muted">{card.caption}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <footer className="shrink-0 space-y-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <div className="flex justify-center gap-1.5" aria-hidden>
          {CARDS.map((c, i) => (
            <span
              key={c.key}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-5 bg-accent-solid' : 'w-1.5 bg-line',
              )}
            />
          ))}
        </div>

        <div className="mx-auto flex w-full max-w-sm gap-2">
          {/* Back occupies its slot on card 1 too, so Next does not jump. */}
          <Button
            variant="outline"
            className={cn('flex-1', index === 0 && 'invisible')}
            onClick={prev}
            tabIndex={index === 0 ? -1 : undefined}
            aria-hidden={index === 0 || undefined}
          >
            Back
          </Button>
          <Button data-tour-primary size="lg" className="flex-[2]" onClick={next}>
            {last ? 'Let’s go' : 'Next'}
          </Button>
        </div>
      </footer>
    </motion.div>
  )
}
