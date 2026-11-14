import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { ReplayIcon } from '@/components/ui/icons'
import { RankDelta, RankTenure } from '@/components/leaderboard/RankSignals'
import { CelestialFrame } from '@/components/leaderboard/CelestialFrame'
import { BODY, RISER_H, SKY, type Place } from '@/components/leaderboard/podiumPalette'
import { Odometer } from '@/components/leaderboard/Odometer'
import { makeStars } from '@/lib/starfield'
import { takeReveal } from '@/lib/reveal-budget'
import { glide, pop, snap } from '@/lib/motion'
import { cn } from '@/lib/cn'
import type { LeaderboardEntry } from '@/lib/types'

/*
 * The podium is a night sky with three collectible cards standing on launch-pad risers.
 * 1 = a star, 2 = a ringed planet, 3 = a moon; each has its own palette and its own FOIL
 * (prismatic, pearlescent, matte), so the places differ in material rather than shade.
 *
 * Choreography is a countdown: third rises and lands, then second, then a held beat, then the
 * champion. Each landing sends one ring across the pad. The only thing that loops is the
 * sun's slow corona. Everything else is one-shot or driven by touch (foil, tilt, parallax),
 * and reduced motion shows the finished podium with a still foil.
 *
 * Every colour is a literal on purpose: the sky and the cards are fixed dark objects that do
 * not follow the theme, exactly like the home scoreboard.
 */
type Metric = 'points' | 'spent'

/** Seconds. Third place first, then second, a held beat, then the champion. */
const AT: Record<Place, { stand: number; card: number }> = {
  3: { stand: 0.35, card: 0.7 },
  2: { stand: 1.1, card: 1.45 },
  1: { stand: 2.0, card: 2.45 },
}

const SKY_LAYERS = [
  { stars: makeStars(11, 34, 0.5, 0.9, 0.3, 0.7), shift: 5 },
  { stars: makeStars(23, 16, 0.8, 1.3, 0.5, 0.85), shift: 11 },
  { stars: makeStars(37, 7, 1.2, 1.9, 0.7, 1), shift: 20 },
]

/*
 * The countdown reveal plays on the first three opens only (lib/reveal-budget.ts), then the
 * podium is simply there. React runs a lazy initialiser twice in dev, so a second take for the
 * same student within a moment gets the first answer instead of spending another play.
 */
let lastTake: { who: string; at: number; result: boolean } | null = null
function takeOnce(who: string): boolean {
  const now = Date.now()
  if (lastTake && lastTake.who === who && now - lastTake.at < 150) return lastTake.result
  const result = takeReveal(
    {
      getItem: (k) => window.localStorage.getItem(k),
      setItem: (k, v) => window.localStorage.setItem(k, v),
    },
    who,
  )
  lastTake = { who, at: now, result }
  return result
}

const valueOf = (e: LeaderboardEntry, m: Metric) => (m === 'spent' ? e.spent_points : e.points)

export function SpacePodium({
  entries,
  meId,
  metric,
  rankSignals,
  reduced,
  revealKey,
  onSelect,
}: {
  /** Whose turn to spend: the viewing student, or 'guest' where nobody is signed in as one. */
  revealKey: string
  /** The top three, best first. */
  entries: LeaderboardEntry[]
  meId?: string | null
  metric: Metric
  rankSignals?: boolean
  reduced: boolean
  onSelect?: (entry: LeaderboardEntry) => void
}) {
  const [replay, setReplay] = useState(0)
  const [turn] = useState(() => takeOnce(revealKey))
  // After the third open the entrance stays still; pressing replay always plays it.
  const intro = !reduced && (turn || replay > 0)
  const skyRef = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const signature = entries.map((e) => `${e.student_id}:${valueOf(e, metric)}`).join('|')
  const top = entries.map((entry, i) => ({ entry, place: (i + 1) as Place }))
  const slots = [top[1] ?? null, top[0] ?? null, top[2] ?? null]

  function setParallax(px: number, py: number) {
    const el = skyRef.current
    if (!el) return
    el.style.setProperty('--px', px.toFixed(3))
    el.style.setProperty('--py', py.toFixed(3))
  }

  function onSkyMove(e: RPointerEvent<HTMLDivElement>) {
    if (reduced) return
    const el = skyRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * 2 - 1
    const py = ((e.clientY - r.top) / r.height) * 2 - 1
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => setParallax(px, py))
  }

  function onSkyRest() {
    cancelAnimationFrame(raf.current)
    setParallax(0, 0)
  }

  return (
    <div
      ref={skyRef}
      onPointerMove={onSkyMove}
      onPointerLeave={onSkyRest}
      onPointerCancel={onSkyRest}
      className="relative touch-pan-y overflow-hidden rounded-2xl shadow-lg shadow-black/25 ring-1 ring-white/10"
      style={{ background: SKY, ['--px' as string]: 0, ['--py' as string]: 0 } as CSSProperties}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {SKY_LAYERS.map((layer, li) => (
          <div
            key={li}
            className="absolute -inset-5"
            style={{
              transform: `translate3d(calc(var(--px, 0) * ${layer.shift}px), calc(var(--py, 0) * ${layer.shift}px), 0)`,
              transition: 'transform 220ms ease-out',
            }}
          >
            {layer.stars.map((s, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: s.r * 2,
                  height: s.r * 2,
                  opacity: s.o,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {!reduced && (
        <div className="absolute right-1.5 top-1.5 z-10">
          <IconButton
            label="Replay the reveal"
            size="sm"
            variant="ghost"
            icon={<ReplayIcon className="h-4 w-4 text-white/60" />}
            onClick={() => setReplay((n) => n + 1)}
            className="hover:bg-white/10"
          />
        </div>
      )}

      <div
        key={`${signature}#${replay}`}
        className="relative grid grid-cols-3 items-end gap-1.5 px-2.5 pt-9 sm:gap-3 sm:px-5"
      >
        {slots.map((slot, i) =>
          slot ? (
            <Column
              key={slot.entry.student_id}
              entry={slot.entry}
              place={slot.place}
              isMe={meId === slot.entry.student_id}
              metric={metric}
              reduced={reduced}
              intro={intro}
              rankSignals={rankSignals}
              onClick={onSelect ? () => onSelect(slot.entry) : undefined}
            />
          ) : (
            <div key={`empty-${i}`} aria-hidden />
          ),
        )}
      </div>

      <div aria-hidden className="relative h-1.5 border-t border-white/20 bg-white/10" />
    </div>
  )
}

function Column({
  entry,
  place,
  isMe,
  metric,
  reduced,
  intro,
  rankSignals,
  onClick,
}: {
  entry: LeaderboardEntry
  place: Place
  isMe: boolean
  metric: Metric
  reduced: boolean
  intro: boolean
  rankSignals?: boolean
  onClick?: () => void
}) {
  const body = BODY[place]
  const at = AT[place]
  const champ = place === 1
  const spend = metric === 'spent'

  return (
    <div className="relative flex min-w-0 flex-col">
      <motion.div
        initial={intro ? { opacity: 0, y: -30, scale: champ ? 1.1 : 0.96 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...(champ ? pop : glide), delay: at.card }}
        className="relative z-[1]"
      >
        <Card
          entry={entry}
          place={place}
          isMe={isMe}
          metric={metric}
          reduced={reduced}
          intro={intro}
          rankSignals={rankSignals}
          onClick={onClick}
        />
      </motion.div>

      <div className={cn('relative w-full', RISER_H[place])}>
        {intro && (
          <>
            <DockingRing delay={at.card} />
            {champ && <DockingRing delay={at.card + 0.16} wide />}
          </>
        )}
        <div className="absolute inset-0 overflow-hidden rounded-t-md">
          <motion.div
            initial={intro ? { y: '101%' } : false}
            animate={{ y: 0 }}
            transition={{ ...(champ ? glide : snap), delay: at.stand }}
            className="absolute inset-0 flex items-center justify-center rounded-t-md border border-b-0"
            style={{
              borderColor: body.border,
              background: `linear-gradient(180deg, ${body.standTop}, ${body.standBot})`,
              boxShadow: `inset 0 1px 0 ${body.ink}66`,
            }}
          >
            <span
              aria-hidden
              className="absolute left-1.5 top-1.5 h-1 w-1 rounded-full"
              style={{ background: body.ink, opacity: 0.45 }}
            />
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full"
              style={{ background: body.ink, opacity: 0.45 }}
            />
            {spend && (
              <>
                <span
                  aria-hidden
                  className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
                  style={{ background: SKY }}
                />
                <span
                  aria-hidden
                  className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
                  style={{ background: SKY }}
                />
              </>
            )}
            <span
              className={cn('font-display font-bold leading-none', champ ? 'text-3xl' : 'text-2xl')}
              style={{ color: body.ink }}
            >
              {place}
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/** One ring across the pad when a card lands. Flattened so it reads as lying on the floor. */
function DockingRing({ delay, wide }: { delay: number; wide?: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-0 z-[2] w-[92%]"
      style={{ transform: 'translate(-50%, -50%) scaleY(0.26)' }}
    >
      <motion.span
        initial={{ scale: 0.35, opacity: 0.9 }}
        animate={{ scale: wide ? 1.5 : 1.15, opacity: 0 }}
        transition={{ duration: wide ? 1 : 0.8, ease: [0.22, 1, 0.36, 1], delay }}
        className="block aspect-square w-full rounded-full border-2 border-white/70"
      />
    </span>
  )
}

/*
 * A name on a card that is only ~95px wide. Two lines are ALWAYS reserved (a fixed box), the
 * text wraps and balances, and the font steps down one pixel at a time (never below 10px)
 * until the whole name fits in those two lines. Re-fits when the card resizes or the web font
 * arrives, so the card's height never depends on who is on it.
 */
const NAME_MIN = 10

function FitName({ name, max }: { name: string; max: number }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const box = boxRef.current
    const text = textRef.current
    if (!box || !text) return
    const fit = () => {
      let size = max
      text.style.fontSize = `${size}px`
      while (text.scrollHeight > text.clientHeight + 1 && size > NAME_MIN) {
        size -= 1
        text.style.fontSize = `${size}px`
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    void document.fonts?.ready.then(fit)
    return () => ro.disconnect()
  }, [name, max])

  return (
    <div
      ref={boxRef}
      className="relative mt-1 flex items-center justify-center"
      style={{ height: Math.ceil(max * 1.25 * 2) }}
    >
      <p
        ref={textRef}
        className="line-clamp-2 w-full text-balance break-words font-semibold leading-tight text-white"
        style={{ fontSize: max }}
      >
        {name}
      </p>
    </div>
  )
}

function Card({
  entry,
  place,
  isMe,
  metric,
  reduced,
  intro,
  rankSignals,
  onClick,
}: {
  entry: LeaderboardEntry
  place: Place
  isMe: boolean
  metric: Metric
  reduced: boolean
  intro: boolean
  rankSignals?: boolean
  onClick?: () => void
}) {
  const body = BODY[place]
  const champ = place === 1
  const tiltRef = useRef<HTMLDivElement>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const [hot, setHot] = useState(false)

  function setVars(fx: string, fy: string, rx: string, ry: string) {
    const el = tiltRef.current
    if (!el) return
    el.style.setProperty('--fx', fx)
    el.style.setProperty('--fy', fy)
    el.style.setProperty('--rx', rx)
    el.style.setProperty('--ry', ry)
  }

  function track(e: RPointerEvent<HTMLDivElement>) {
    if (reduced) return
    const el = tiltRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    setVars(
      `${Math.round(nx * 100)}%`,
      `${Math.round(ny * 100)}%`,
      `${((0.5 - ny) * 14).toFixed(1)}deg`,
      `${((nx - 0.5) * 16).toFixed(1)}deg`,
    )
    if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 6) {
      dragged.current = true
    }
    setHot(true)
  }

  function rest() {
    setVars('28%', '18%', '0deg', '0deg')
    setHot(false)
    down.current = null
  }

  const activate = () => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    onClick?.()
  }

  const value = valueOf(entry, metric)

  return (
    <div
      ref={tiltRef}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `View ${entry.display_name}'s profile, rank ${place}` : undefined}
      onClick={onClick ? activate : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY }
        dragged.current = false
      }}
      onPointerMove={track}
      onPointerLeave={rest}
      onPointerCancel={rest}
      className={cn(
        'relative touch-pan-y select-none overflow-hidden rounded-xl border px-1.5 pb-2 pt-2 text-center',
        onClick &&
          'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
      )}
      style={{
        borderColor: body.border,
        background: `linear-gradient(170deg, ${body.cardTop}, ${body.cardBot})`,
        transform: 'perspective(520px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
        transition: hot ? 'transform 90ms ease-out' : 'transform 380ms ease-out',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: hot ? body.foilHot : body.foilRest,
          background: `radial-gradient(circle at var(--fx, 28%) var(--fy, 18%), rgba(255,255,255,0.45), transparent 42%), ${body.foil}`,
          backgroundSize: '100% 100%, 240% 240%',
          backgroundPosition: '0 0, var(--fx, 28%) var(--fy, 18%)',
        }}
      />

      {intro && champ && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: AT[1].card }}
          className="pointer-events-none absolute inset-0 bg-white"
        />
      )}

      {isMe && (
        <span className="absolute left-1.5 top-1.5 z-[1] rounded bg-white/15 px-1 py-0.5 text-2xs font-bold uppercase tracking-wider text-white">
          You
        </span>
      )}

      <CelestialFrame place={place} reduced={reduced} className={champ ? '' : 'mx-auto w-[88%]'}>
        <Avatar
          name={entry.display_name}
          url={entry.avatar_url}
          className="h-full! w-full!"
          textClassName={champ ? 'text-lg' : 'text-base'}
        />
      </CelestialFrame>

      <FitName name={entry.display_name} max={champ ? 13 : 12} />

      <p
        className={cn(
          'relative mt-0.5 flex items-baseline justify-center gap-1 font-display font-bold leading-none',
          champ ? 'text-2xl' : 'text-xl',
        )}
        style={{ color: body.ink }}
      >
        <Odometer value={value} reduced={!intro} delay={AT[place].card + 0.1} />
        <span className="font-sans text-2xs font-medium text-white/60">
          {metric === 'spent' ? 'used' : 'pts'}
        </span>
      </p>

      {rankSignals && (
        <div className="relative mt-1.5 flex min-h-5 flex-wrap items-center justify-center gap-1">
          <RankDelta entry={entry} onPlate />
          <RankTenure entry={entry} onPlate />
        </div>
      )}
    </div>
  )
}
