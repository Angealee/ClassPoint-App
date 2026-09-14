import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Meter } from '@/components/ui/Meter'
import { ChevronDownIcon } from '@/components/ui/icons'
import { ease } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/time'
import type { PeerResultRow } from '@/lib/types'

/**
 * One student on the instructor's results board.
 *
 * Collapsed: name, overall percent, rater count. Open: the per-criterion
 * breakdown and every comment WITH its author's name. The instructor always
 * sees who said what — that is the other half of the promise made to the person
 * being rated, and it is what makes a cruel comment actionable rather than just
 * upsetting.
 *
 * One card per student rather than a table (the instructor's call): you judge
 * one person at a time, and a 40-by-4 grid needs its own horizontal scroller at
 * 375px where most of this app is used.
 */
export function PeerResultCard({
  row,
  onToggleComment,
}: {
  row: PeerResultRow
  /** Hide or restore one comment. Never deletes it. */
  onToggleComment: (submissionId: string, hidden: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const rated = row.raterCount > 0 && row.overallPct !== null

  return (
    <Card pad="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!rated}
        className="flex w-full items-center gap-3 p-4 text-left disabled:cursor-default"
      >
        <Avatar name={row.fullName} url={row.avatarUrl} className="h-10 w-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{row.fullName}</span>
          <span className="block truncate text-xs text-muted">
            {[row.sectionName, row.groupName].filter(Boolean).join(' · ')}
          </span>
        </span>

        {rated ? (
          <span className="shrink-0 text-right">
            <span className="block text-lg font-bold tabular-nums">
              {Math.round(row.overallPct ?? 0)}
              <span className="text-xs font-semibold text-muted">%</span>
            </span>
            <span className="block text-2xs text-muted">
              {row.raterCount} rater{row.raterCount === 1 ? '' : 's'}
            </span>
          </span>
        ) : (
          // A data gap, not a low score, so it wears a neutral chip rather than
          // a zero that would be averaged and compared.
          <Chip tone="neutral" size="sm">
            Not rated
          </Chip>
        )}

        {rated && (
          <ChevronDownIcon
            className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && rated && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ ...ease, duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-line p-4">
              <div className="space-y-3">
                {row.criteria.map((c) => (
                  <div key={c.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {c.avg}
                        <span className="text-xs font-normal text-muted">
                          {' '}
                          / {c.scaleMax} · {Math.round(c.pct)}%
                        </span>
                      </span>
                    </div>
                    <Meter value={c.pct} max={100} />
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted">
                {/* Labelled raw, and captioned when the criteria use different
                    scales — averaging a 1-to-5 and a 0/1 gives a number with no
                    unit, and it must not be mistaken for a mark. */}
                Raw average {row.overallRaw}
                {!row.sameScale && ' (across different scales)'}
              </p>

              {row.comments.length > 0 && (
                <div className="space-y-2 border-t border-line pt-3">
                  {row.comments.map((c) => (
                    <div
                      key={c.submissionId}
                      className={cn(
                        'rounded-xl border p-3',
                        c.hiddenAt ? 'border-danger/30 bg-danger-solid/8' : 'border-line bg-card-2',
                      )}
                    >
                      <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                          {/* A permanent mark: a comment you restored keeps it,
                              so "flagged and let through" stays visible. */}
                          {c.flagged && (
                            <Chip tone="warn" size="sm">
                              Flagged
                            </Chip>
                          )}
                          <span className="min-w-0 truncate">
                            {c.evaluatorName} · {timeAgo(c.createdAt)}
                            {c.hiddenAt && ' · hidden from them'}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0"
                          onClick={() => onToggleComment(c.submissionId, c.hiddenAt === null)}
                        >
                          {c.hiddenAt ? 'Restore' : 'Hide'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
