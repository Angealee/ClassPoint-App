import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, Rows } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/components/ui/Toast'
import { PencilIcon, TrashIcon } from '@/components/ui/icons'
import { COMPONENT_LABEL, GRADE_COMPONENTS } from '@/lib/grading'
import { parseScoreInput } from '@/lib/grade-entry'
import { boostTermsError, formatMarks } from '@/lib/grade-boost'
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

interface ColumnsPanelProps {
  sectionId: string
  subjectId: string
  term: TermKey
  items: GradeItem[]
  /** itemId → how many students already have a mark on it. */
  markedCounts: Map<string, number>
  onChanged: () => void
}

export function ColumnsPanel({
  sectionId,
  subjectId,
  term,
  items,
  markedCounts,
  onChanged,
}: ColumnsPanelProps) {
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

  async function saveEdit(
    item: GradeItem,
    nextName: string,
    nextMax: string,
    boost: { cost: number | null; bonus: number | null },
  ) {
    const parsed = parseScoreInput(nextMax)
    if (!parsed.ok || parsed.value === null || parsed.value <= 0) {
      toast('A score column needs a maximum above 0.', 'error')
      return
    }
    setBusy(true)
    try {
      // The boost terms are sent only when they CHANGED. A rename on a database
      // that has not had 0062 yet must keep working, and it cannot if every
      // save carries two columns that database does not know about.
      const boostChanged = boost.cost !== item.pointsCost || boost.bonus !== item.pointsBonus
      await updateGradeItem(item.id, {
        name: nextName,
        maxScore: parsed.value,
        ...(boostChanged ? { pointsCost: boost.cost, pointsBonus: boost.bonus } : {}),
      })
      setEditing(null)
      onChanged()
    } catch (err) {
      toast(errorText(err, 'Could not save that column.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Move a column one place earlier or later within its component.
   *
   * `position` was written once, at creation, and nothing ever changed it — so a
   * column added in the wrong order stayed in the wrong order. The list below is
   * the grid's column order (both come from `orderedItems` over the same
   * database order), so what moves here moves there.
   *
   * Every column in the group is renumbered 0..n-1 rather than just swapping two
   * values: positions are not guaranteed unique (a restored column keeps its old
   * number), and swapping two equal numbers does nothing. Only the rows whose
   * number actually changes are written.
   */
  async function move(item: GradeItem, dir: -1 | 1) {
    const group = items.filter((i) => i.archivedAt === null && i.component === item.component)
    const from = group.findIndex((i) => i.id === item.id)
    const to = from + dir
    if (from < 0 || to < 0 || to >= group.length) return

    const reordered = [...group]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)

    setBusy(true)
    try {
      await Promise.all(
        reordered.flatMap((it, index) =>
          it.position === index ? [] : [updateGradeItem(it.id, { position: index })],
        ),
      )
      onChanged()
    } catch (err) {
      toast(errorText(err, 'Could not move that column.'), 'error')
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
                {group.map((item, index) =>
                  editing?.id === item.id ? (
                    <EditRow
                      key={item.id}
                      item={item}
                      busy={busy}
                      canMoveUp={index > 0}
                      canMoveDown={index < group.length - 1}
                      onMove={(dir) => void move(item, dir)}
                      onCancel={() => setEditing(null)}
                      onSave={(n, m, boost) => void saveEdit(item, n, m, boost)}
                    />
                  ) : (
                    <div key={item.id} className="flex items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.name}</p>
                        <p className="text-2xs text-muted">
                          out of {item.maxScore} · {markedCounts.get(item.id) ?? 0} marked
                          {item.pointsCost !== null && item.pointsBonus !== null && (
                            <span className="text-reward">
                              {' '}
                              · {item.pointsCost} pts → +{formatMarks(item.pointsBonus)} boost
                            </span>
                          )}
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
  canMoveUp,
  canMoveDown,
  onMove,
  onCancel,
  onSave,
}: {
  item: GradeItem
  busy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (dir: -1 | 1) => void
  onCancel: () => void
  onSave: (
    name: string,
    maxScore: string,
    boost: { cost: number | null; bonus: number | null },
  ) => void
}) {
  const [name, setName] = useState(item.name)
  const [maxScore, setMaxScore] = useState(String(item.maxScore))
  const [cost, setCost] = useState(item.pointsCost === null ? '' : String(item.pointsCost))
  const [bonus, setBonus] = useState(item.pointsBonus === null ? '' : formatMarks(item.pointsBonus))

  // NaN stands for "typed, but not a number" so the shared validator can name it.
  const costN = cost.trim() === '' ? null : /^\d+$/.test(cost.trim()) ? Number(cost.trim()) : NaN
  const bonusParsed = parseScoreInput(bonus)
  const bonusN = bonusParsed.ok ? bonusParsed.value : NaN
  const maxParsed = parseScoreInput(maxScore)
  const maxN = maxParsed.ok && maxParsed.value !== null ? maxParsed.value : item.maxScore
  const boostError = boostTermsError(costN, bonusN, maxN)
  const terms =
    costN !== null && bonusN !== null && boostError === null
      ? { cost: costN, bonus: bonusN }
      : null

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

      {/* Column order. Side by side rather than as icon buttons in the row: four
          small controls in one line would break the tap-target adjacency rule,
          and two labelled buttons say what they do. Moves are saved at once —
          they are not part of the Save below. */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!canMoveUp || busy}
          onClick={() => onMove(-1)}
        >
          Move up
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canMoveDown || busy}
          onClick={() => onMove(1)}
        >
          Move down
        </Button>
      </div>

      {/* Let students spend points on this column (0062). Blank = not offered.
          Stated as the exact trade, because that is the sentence the student
          will be shown before they confirm. */}
      <div className="space-y-1.5 rounded-xl bg-card-2 p-2.5">
        <p className="text-xs font-medium">Let students spend points on this column</p>
        <div className="flex items-end gap-2">
          <Input
            value={cost}
            inputMode="numeric"
            onChange={(e) => setCost(e.target.value)}
            wrapperClassName="min-w-0 flex-1"
            aria-label="Points a student spends"
            placeholder="Points"
            hint="Points spent"
          />
          <Input
            value={bonus}
            inputMode="decimal"
            onChange={(e) => setBonus(e.target.value)}
            wrapperClassName="min-w-0 flex-1"
            aria-label="Marks added"
            placeholder="Marks"
            hint="Marks added"
          />
        </div>
        {boostError ? (
          <p className="text-2xs text-danger">{boostError}</p>
        ) : terms ? (
          <p className="text-2xs text-muted">
            A student whose mark is in can spend{' '}
            <span className="font-semibold text-ink">{terms.cost} points</span> to add{' '}
            <span className="font-semibold text-ink">{formatMarks(terms.bonus)} marks</span> (never
            past {formatMarks(maxN)}). Once per column, and you approve each one.
          </p>
        ) : (
          <p className="text-2xs text-muted">Leave both blank and this column isn’t offered.</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={boostError !== null}
          onClick={() => onSave(name, maxScore, { cost: costN, bonus: bonusN })}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
