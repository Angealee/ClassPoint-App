import { motion } from 'framer-motion'
import { DigitDrum } from '@/components/leaderboard/Odometer'
import { IconButton } from '@/components/ui/IconButton'
import { DownloadIcon, EyeIcon, EyeOffIcon } from '@/components/ui/icons'
import { displayGrade } from '@/lib/grading'
import { glide } from '@/lib/motion'
import type { BreakdownSegment } from '@/lib/student-grades'
import type { GradeComponent } from '@/lib/types'

/*
 * The term's report card: the same fixed dark plate as the home scoreboard and the leaderboard,
 * so the three screens a student checks most read as one family. The figure is hidden until the
 * eye is tapped (the instructor's rule), but the WEIGHTS are not secret, so the breakdown bar
 * still shows how the term is built while the figure is hidden: the plate is never an empty box.
 * Every value is a literal on purpose: the plate does not follow the theme.
 */
export function BreakdownBar({
  segments,
  reveal,
  reduced,
  onPick,
}: {
  segments: BreakdownSegment[]
  reveal: boolean
  reduced: boolean
  onPick?: (component: GradeComponent) => void
}) {
  return (
    <div role="group" aria-label="How each part counts toward the term" className="flex gap-1">
      {segments.map((s, i) => (
        <button
          key={s.component}
          type="button"
          onClick={() => onPick?.(s.component)}
          style={{ flexGrow: s.weightPct, flexBasis: 0 }}
          className="min-w-0 rounded-md py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label={`${s.label}, ${s.weightPct}% of the term${
            reveal && s.score !== null ? `, score ${displayGrade(s.score)}` : ''
          }`}
        >
          <span className="block h-3 overflow-hidden rounded-sm bg-white/10">
            {reveal && s.fill !== null && (
              <motion.span
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: s.fill }}
                transition={{ ...glide, delay: 0.08 * i }}
                className="block h-full origin-left bg-gold-300"
              />
            )}
          </span>
          <span className="mt-1.5 block truncate text-2xs font-semibold text-white/85">{s.short}</span>
          <span className="block text-2xs tabular-nums text-white/55">{s.weightPct}%</span>
          {reveal && (
            <span className="block truncate text-2xs font-semibold tabular-nums text-gold-300">
              {s.score === null ? '-' : displayGrade(s.score)}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/** The big number. Hidden it is dots; revealed, each digit rolls once into place. */
function Figure({ text, reveal, reduced }: { text: string; reveal: boolean; reduced: boolean }) {
  if (!reveal) {
    return (
      <p
        aria-label="Hidden"
        className="font-display text-4xl font-bold leading-none tracking-[0.2em] text-white/70"
      >
        ••••
      </p>
    )
  }
  return (
    <p className="font-display text-4xl font-bold leading-none tabular-nums">
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {[...text].map((ch, i) =>
          /\d/.test(ch) ? (
            <DigitDrum key={i} digit={Number(ch)} index={i} reduced={reduced} />
          ) : (
            <span key={i} className="inline-block w-[0.34em] text-center">
              {ch}
            </span>
          ),
        )}
      </span>
    </p>
  )
}

export function ReportPlate({
  termTitle,
  figure,
  reveal,
  onToggle,
  marked,
  total,
  segments,
  note,
  reduced,
  onShare,
  onPickPart,
}: {
  termTitle: string
  /** The formatted figure, or a dash when nothing is marked yet. */
  figure: string
  reveal: boolean
  onToggle: () => void
  marked: number
  total: number
  segments: BreakdownSegment[] | null
  note: string
  reduced: boolean
  /** Present only when a card may be saved (revealed, and something is marked). */
  onShare?: () => void
  onPickPart?: (component: GradeComponent) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-plate-2 to-plate p-5 text-white shadow-lg shadow-black/25 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-widest text-white/55">
          {termTitle} · so far
        </p>
        <div className="-mr-1.5 -mt-1.5 flex items-center gap-3">
          {onShare && (
            <IconButton
              label="Save as an image"
              size="sm"
              onClick={onShare}
              icon={<DownloadIcon className="h-4.5 w-4.5" />}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            />
          )}
          <IconButton
            label={reveal ? 'Hide grades' : 'Show grades'}
            aria-pressed={reveal}
            size="sm"
            onClick={onToggle}
            icon={
              reveal ? <EyeIcon className="h-4.5 w-4.5" /> : <EyeOffIcon className="h-4.5 w-4.5" />
            }
            className="text-white/70 hover:bg-white/10 hover:text-white"
          />
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <Figure key={reveal ? 'shown' : 'hidden'} text={figure} reveal={reveal} reduced={reduced} />
        <p className="pb-1 text-right text-xs tabular-nums text-white/60">
          {marked} of {total} marked
        </p>
      </div>

      {segments && (
        <div className="mt-4">
          <BreakdownBar segments={segments} reveal={reveal} reduced={reduced} onPick={onPickPart} />
        </div>
      )}

      <p className="mt-3 text-xs text-white/60">{note}</p>
    </div>
  )
}
