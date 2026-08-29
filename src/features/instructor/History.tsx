import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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

      <SegmentedControl
        label="History view"
        value={tab}
        onChange={select}
        options={[
          { value: 'points', label: 'Points' },
          { value: 'attendance', label: 'Attendance' },
        ]}
      />

      {tab === 'points' ? <AwardHistory embedded /> : <SessionHistory embedded />}
    </div>
  )
}
