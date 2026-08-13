import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { AwardHistory } from './AwardHistory'
import { SessionHistory } from './SessionHistory'

type HistoryTab = 'points' | 'attendance'

/**
 * One home for "what already happened": the points ledger and the attendance
 * record. Two tabs rather than two nav slots, mirroring the Requests page
 * (Points | Excuses) — the pattern this app already uses for a shared inbox.
 *
 * Class attendance stats used to hang off a text link on the Attendance screen,
 * which the live and review views replace outright — so during a running class
 * they were unreachable. Living here, they're always one tap away.
 *
 * The tab is mirrored into ?tab= so a deep link (and the browser's back button)
 * can land on the attendance side directly.
 */
export function History() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial: HistoryTab = searchParams.get('tab') === 'attendance' ? 'attendance' : 'points'
  const [tab, setTab] = useState<HistoryTab>(initial)

  function select(next: HistoryTab) {
    setTab(next)
    setSearchParams(next === 'attendance' ? { tab: 'attendance' } : {}, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold">History</h1>
        <p className="text-sm text-muted">
          {tab === 'points'
            ? 'Every award and penalty, newest first — undo any mistake.'
            : 'Every session, and who’s actually showing up.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['points', 'Points'],
            ['attendance', 'Attendance'],
          ] as Array<[HistoryTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => select(key)}
            className={cn(
              'rounded-xl border py-2 text-sm font-semibold transition-colors',
              tab === key
                ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                : 'border-line text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'points' ? <AwardHistory embedded /> : <SessionHistory embedded />}
    </div>
  )
}
