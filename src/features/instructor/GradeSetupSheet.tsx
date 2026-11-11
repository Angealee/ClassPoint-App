import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { WeightsPanel } from './WeightsPanel'
import { ColumnsPanel } from './ColumnsPanel'
import type { GradeItem, GradePolicy, Subject, TermKey } from '@/lib/types'

type SetupTab = 'weights' | 'columns'

export function GradeSetupSheet({
  open,
  onClose,
  // Weights — subject-wide.
  subject,
  policies,
  sectionIds,
  onPoliciesSaved,
  // Columns — this section, this term.
  sectionId,
  term,
  items,
  markedCounts,
  onItemsChanged,
}: {
  open: boolean
  onClose: () => void
  subject: Subject
  policies: GradePolicy[]
  sectionIds: string[]
  onPoliciesSaved: () => void
  sectionId: string
  term: TermKey
  items: GradeItem[]
  markedCounts: Map<string, number>
  onItemsChanged: () => void
}) {
  const [tab, setTab] = useState<SetupTab>('columns')

  return (
    <Sheet open={open} onClose={onClose} title={`${subject.code} setup`}>
      <div className="space-y-4">
        <SegmentedControl
          label="What to set up"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'columns', label: 'Columns' },
            { value: 'weights', label: 'Weights' },
          ]}
        />

        <p className="text-xs text-muted">
          {tab === 'columns'
            ? 'Score columns belong to this section and this term.'
            : `Weights apply to every section taking ${subject.code}, in all three terms.`}
        </p>

        {open &&
          (tab === 'columns' ? (
            <ColumnsPanel
              sectionId={sectionId}
              subjectId={subject.id}
              term={term}
              items={items}
              markedCounts={markedCounts}
              onChanged={onItemsChanged}
            />
          ) : (
            <WeightsPanel
              subject={subject}
              policies={policies}
              sectionIds={sectionIds}
              onSaved={onPoliciesSaved}
              onDone={onClose}
            />
          ))}
      </div>
    </Sheet>
  )
}
