import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, Rows } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { PencilIcon, TrashIcon } from '@/components/ui/icons'
import { COMPONENT_LABEL, GRADE_COMPONENTS } from '@/lib/grading'
import { parseScoreInput } from '@/lib/grade-entry'
import { errorText } from '@/lib/errors'
import { createGradeItem, setGradeItemArchived, updateGradeItem } from '@/lib/api'
import type { GradeComponent, GradeItem, TermKey } from '@/lib/types'

/**
 * Add, rename, re-weight and retire the score columns of one term.
 *
 * Two of these actions move every grade in the section and are gated the same
 * way a weight change is: changing an item's maximum, and archiving one. Both
 * rescale the component they belong to, which is not obvious from the control
 * you are pressing — hence the confirm that says how many marks it touches.
 */

interface GradeItemsSheetProps {
  open: boolean
  onClose: () => void
  sectionId: string
  subjectId: string
  term: TermKey
  items: GradeItem[]
  /** itemId → how many students already have a mark on it. */
  markedCounts: Map<string, number>
  onChanged: () => void
}

export function GradeItemsSheet({
  open,
  onClose,
  sectionId,
  subjectId,
  term,
  items,
  markedCounts,
  onChanged,
}: GradeItemsSheetProps) {
  const { toast } = useToast()
  const [component, setComponent] = useState<GradeComponent>('quiz')
  const [name, setName] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<GradeItem | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<GradeItem | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    const parsed = parseScoreInput(maxScore)
    if (!parsed.ok || parsed.value === null || parsed.value <= 0) {
      toast('A score column needs a maximum above 0.', 'error')
      return
    }
    if (name.trim().length === 0) {
      toast('Give the column a name.', 'error')
      return
    }

    setBusy(true)
    try {
      await createGradeItem({
        sectionId,
        subjectId,
        term,
        component,
        name,
        maxScore: parsed.value,
        position: items.filter((i) => i.component === component).length,
      })
      setName('')
      setMaxScore('')
      onChanged()
      toast('Column added.', 'success')
    } catch (err) {
      // The unique index is the likely one: two live columns cannot share a
      // name inside one component, or the export has two identical headers.
      toast(errorText(err, 'Could not add that column.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(item: GradeItem, nextName: string, nextMax: string) {
    const parsed = parseScoreInput(nextMax)
    if (!parsed.ok || parsed.value === null || parsed.value <= 0) {
      toast('A score column needs a maximum above 0.', 'error')
      return
    }
    setBusy(true)
    try {
      await updateGradeItem(item.id, { name: nextName, maxScore: parsed.value })
      setEditing(null)
      onChanged()
    } catch (err) {
      toast(errorText(err, 'Could not save that column.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function archive(item: GradeItem) {
    setBusy(true)
    try {
      await setGradeItemArchived(item.id, item.archivedAt === null)
      setArchiveTarget(null)
      onChanged()
    } catch (err) {
      toast(errorText(err, 'Could not retire that column.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const live = items.filter((i) => i.archivedAt === null)
  const retired = items.filter((i) => i.archivedAt !== null)

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Score columns">
        <div className="space-y-5">
          <Card pad="tight" className="space-y-3">
            <SectionLabel>Add a column</SectionLabel>
            <form onSubmit={add} className="space-y-3">
              <Select
                label="Part of"
                value={component}
                onChange={(e) => setComponent(e.target.value as GradeComponent)}
              >
                {GRADE_COMPONENTS.map((c) => (
                  <option key={c} value={c}>
                    {COMPONENT_LABEL[c]}
                  </option>
                ))}
              </Select>
              <div className="flex gap-3">
                <Input
                  label="Name"
                  placeholder="Quiz 1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  wrapperClassName="min-w-0 flex-1"
                  maxLength={60}
                />
                <Input
                  label="Out of"
                  placeholder="20"
                  inputMode="decimal"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  wrapperClassName="w-24 shrink-0"
                />
              </div>
              <Button type="submit" loading={busy} className="w-full">
                Add column
              </Button>
            </form>
          </Card>

          {GRADE_COMPONENTS.map((c) => {
            const group = live.filter((i) => i.component === c)
            if (group.length === 0) return null
            return (
              <div key={c} className="space-y-2">
                <SectionLabel>{COMPONENT_LABEL[c]}</SectionLabel>
                <Rows>
                  {group.map((item) =>
                    editing?.id === item.id ? (
                      <EditRow
                        key={item.id}
                        item={item}
                        busy={busy}
                        onCancel={() => setEditing(null)}
                        onSave={(n, m) => void saveEdit(item, n, m)}
                      />
                    ) : (
                      <div key={item.id} className="flex items-center gap-2 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{item.name}</p>
                          <p className="text-2xs text-muted">
                            out of {item.maxScore} · {markedCounts.get(item.id) ?? 0} marked
                          </p>
                        </div>
                        <IconButton
                          label={`Edit ${item.name}`}
                          icon={<PencilIcon className="h-4 w-4" />}
                          size="sm"
                          onClick={() => setEditing(item)}
                        />
                        <IconButton
                          label={`Retire ${item.name}`}
                          icon={<TrashIcon className="h-4 w-4" />}
                          size="sm"
                          variant="danger"
                          onClick={() => setArchiveTarget(item)}
                        />
                      </div>
                    ),
                  )}
                </Rows>
              </div>
            )
          })}

          {retired.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Retired</SectionLabel>
              <Rows>
                {retired.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-muted">{item.name}</p>
                      <p className="text-2xs text-muted">
                        out of {item.maxScore} · marks kept
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void archive(item)}>
                      Restore
                    </Button>
                  </div>
                ))}
              </Rows>
              <p className="text-2xs text-muted">
                A retired column leaves the computation but keeps its marks, so restoring it
                puts every grade back exactly.
              </p>
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Retire this column?"
        message={
          archiveTarget
            ? `"${archiveTarget.name}" stops counting towards ${COMPONENT_LABEL[archiveTarget.component]}.`
            : ''
        }
        detail={
          archiveTarget
            ? `Its ${archiveTarget.maxScore} marks leave the total, so EVERY student's ${COMPONENT_LABEL[
                archiveTarget.component
              ].toLowerCase()} score changes — the same as editing a weight. The ${
                markedCounts.get(archiveTarget.id) ?? 0
              } marks already entered are kept, and restoring it puts everything back.`
            : ''
        }
        confirmLabel="Retire column"
        busy={busy}
        onConfirm={() => archiveTarget && void archive(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
      />
    </>
  )
}

function EditRow({
  item,
  busy,
  onCancel,
  onSave,
}: {
  item: GradeItem
  busy: boolean
  onCancel: () => void
  onSave: (name: string, maxScore: string) => void
}) {
  const [name, setName] = useState(item.name)
  const [maxScore, setMaxScore] = useState(String(item.maxScore))

  return (
    <div className="space-y-2 p-3">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          wrapperClassName="min-w-0 flex-1"
          aria-label="Column name"
          maxLength={60}
        />
        <Input
          value={maxScore}
          inputMode="decimal"
          onChange={(e) => setMaxScore(e.target.value)}
          wrapperClassName="w-20 shrink-0"
          aria-label="Out of"
        />
      </div>
      {maxScore !== String(item.maxScore) && (
        <p className="text-2xs text-warn">
          Changing the maximum rescales this component for every student.
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={() => onSave(name, maxScore)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
