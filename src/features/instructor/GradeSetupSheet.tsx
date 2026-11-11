import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { WeightsPanel } from './WeightsPanel'
import { ColumnsPanel } from './ColumnsPanel'
import type { GradeItem, GradePolicy, Subject, TermKey } from '@/lib/types'

type SetupTab = 'weights' | 'columns'

/**
 * Everything you set up before you type a mark, behind one button.
 *
 * ── WHY THEY MERGED ────────────────────────────────────────────────────────
 * Weights opened from the grades LANDING and Columns from the grade sheet's
 * header, so the two halves of "set this subject up" lived on different
 * screens and neither was obviously the other's sibling. With the landing gone
 * (the sheet is now the screen — see GradeSheet), weights needed a home
 * anyway, and a toolbar already carrying Import / Export / Print did not need
 * two more buttons.
 *
 * ── ⚠ THE TWO TABS HAVE DIFFERENT SCOPES, AND THAT IS STATED ON SCREEN ─────
 * This is the whole reason the weights editor was deliberately kept OFF the
 * grade sheet when it was built: a sheet is scoped to one section, so editing
 * weights from inside one implies the change applies to that section alone —
 * when it actually reaches every section taking the subject.
 *
 * Putting them side by side does not remove that hazard, it concentrates it.
 * So each panel states its own reach in its first line (WeightsPanel: "these
 * apply to every section taking IT 32 — 3 right now"), the header below names
 * the scope of the tab you are on, and the weights confirm still counts the
 * real number of affected sections. Do not delete those sentences to tidy the
 * layout up.
 *
 * ── ONE PANEL MOUNTED AT A TIME ────────────────────────────────────────────
 * Conditional render, not `hidden`. Both panels seed their drafts on mount —
 * `WeightsPanel` used to gate that on an `open` prop because it stayed mounted
 * across opens — so mounting per tab is what keeps "open the sheet, get the
 * stored values" true. It also means switching tabs discards a half-typed
 * draft, which is correct: the two tabs write to different tables and a
 * carried-over draft would be a change you did not mean to still be making.
 */
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
  /** Every section taking this subject — the real reach of a weight change. */
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

        {/* The scope of the tab you are on, in words, above the panel. A
            student's grade moves either way; which students is the thing that
            differs, and it is not inferable from the controls. */}
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
