import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AwardHistory } from './AwardHistory'
import { SessionHistory } from './SessionHistory'

type HistoryTab = 'points' | 'attendance'

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
      <ScreenTitle
        title="History"
        subtitle={
          tab === 'points'
            ? 'Every award and penalty, newest first, undo any mistake.'
            : 'Every session, and who’s actually showing up.'
        }
      />

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
