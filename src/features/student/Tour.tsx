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

const TAP_GUARD_MS = 500

export function Tour({ skippable, onDone }: { skippable: boolean; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)

  const rootRef = useRef<HTMLDivElement>(null)
  // Set in an effect, not read from the clock during render.
  const bornAt = useRef(0)

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
    rootRef.current?.querySelector<HTMLElement>('[data-tour-primary]')?.focus()

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
      e.preventDefault()
      doneRef.current()
    } else if (e.key === 'Tab') {
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
      exit={{ opacity: 0 }}
      transition={ease}
    >
      <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-xs font-semibold tabular-nums text-muted" aria-live="polite">
          <span className="sr-only">Step </span>
          {index + 1} / {CARDS.length}
        </p>
        {skippable ? (
          <Button size="sm" variant="ghost" onClick={() => doneRef.current()}>
            Skip
          </Button>
        ) : (
          <span aria-hidden className="h-9" />
        )}
      </header>

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
