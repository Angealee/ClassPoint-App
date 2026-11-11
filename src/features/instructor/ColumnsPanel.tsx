import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, Rows } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toast'
import { PencilIcon, TrashIcon } from '@/components/ui/icons'
import { COMPONENT_LABEL, GRADE_COMPONENTS } from '@/lib/grading'
import { parseScoreInput } from '@/lib/grade-entry'
import {
  assistModeOf,
  boostTermsError,
  effectiveTerms,
  formatMarks,
  type AssistMode,
} from '@/lib/grade-boost'
import { termOf } from '@/lib/term'
import { errorText } from '@/lib/errors'
import {
  createGradeItem,
  listGradeAssistDefaults,
  listSessions,
  setGradeItemArchived,
  updateGradeItem,
} from '@/lib/api'
import type {
  GradeAssistDefault,
  GradeComponent,
  GradeItem,
  SessionSummary,
  TermKey,
} from '@/lib/types'

/** The parts a typed column can belong to. Recitation is attendance (0063). */
const COLUMN_PARTS = GRADE_COMPONENTS.filter((c) => c !== 'recitation')

/** "Mon, Jun 15 · IT 32 · Topic" — enough to tell one class from the next. */
function sessionLabel(s: SessionSummary): string {
  const day = new Date(s.startedAt).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
  return [day, s.subjectCode, s.topic].filter(Boolean).join(' · ')
}

/** What the instructor chose for a column's points assist, ready to save. */
interface AssistChoice {
  mode: AssistMode
  cost: number | null
  bonus: number | null
}

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

  // The subject's terms per part, and this section's classes — each in its OWN
  // catch (the 0034 SectionGrid precedent): before 0063 neither exists, and that
  // must cost the "follow the part" sentence and the class picker, never the panel.
  const [defaults, setDefaults] = useState<GradeAssistDefault[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  useEffect(() => {
    let cancelled = false
    listGradeAssistDefaults(subjectId)
      .then((rows) => !cancelled && setDefaults(rows))
      .catch(() => !cancelled && setDefaults([]))
    listSessions(sectionId)
      .then((rows) => !cancelled && setSessions(rows.filter((r) => r.subjectId === subjectId)))
      .catch(() => !cancelled && setSessions([]))
    return () => {
      cancelled = true
    }
  }, [sectionId, subjectId])

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
    assist: AssistChoice,
    nextSessionId: string | null,
  ) {
    const parsed = parseScoreInput(nextMax)
    if (!parsed.ok || parsed.value === null || parsed.value <= 0) {
      toast('A score column needs a maximum above 0.', 'error')
      return
    }
    setBusy(true)
    try {
      // The points-assist setup and the class link are sent only when they
      // CHANGED. A rename on a database that has not had 0062 / 0063 yet must keep
      // working, and it cannot if every save carries columns it does not know.
      //   default → no terms of its own, on
      //   own     → this column's cost and marks
      //   off     → no terms, switched off
      const assistChanged =
        assist.mode !== assistModeOf(item) ||
        (assist.mode === 'own' &&
          (assist.cost !== item.pointsCost || assist.bonus !== item.pointsBonus))
      await updateGradeItem(item.id, {
        name: nextName,
        maxScore: parsed.value,
        ...(assistChanged
          ? {
              assistOff: assist.mode === 'off',
              pointsCost: assist.mode === 'own' ? assist.cost : null,
              pointsBonus: assist.mode === 'own' ? assist.bonus : null,
            }
          : {}),
        ...(nextSessionId !== item.sessionId ? { sessionId: nextSessionId } : {}),
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
              {COLUMN_PARTS.map((c) => (
                <option key={c} value={c}>
                  {COMPONENT_LABEL[c]}
                </option>
              ))}
            </Select>
            <p className="text-2xs text-muted">
              Recitation isn’t a column: it is each student’s attendance for the term,
              worked out from your class attendance.
            </p>
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

        {COLUMN_PARTS.map((c) => {
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
                      defaults={defaults}
                      sessions={sessions}
                      term={term}
                      busy={busy}
                      canMoveUp={index > 0}
                      canMoveDown={index < group.length - 1}
                      onMove={(dir) => void move(item, dir)}
                      onCancel={() => setEditing(null)}
                      onSave={(n, m, assist, sessionId) =>
                        void saveEdit(item, n, m, assist, sessionId)
                      }
                    />
                  ) : (
                    // ⚠ `gap-3`, not `gap-2`: two `sm` IconButtons (32px) have
                    // 44px hit regions, and centres 40px apart overlap by 4px —
                    // where the LATER element wins, so a tap near the seam hit
                    // Retire instead of Edit. 32 + 12 = 44 touches exactly. This
                    // is the adjacency rule in IconButton, measured here at 320px.
                    <div key={item.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm" title={item.name}>
                          {item.name}
                        </p>
                        <p className="text-2xs text-muted">
                          out of {item.maxScore} · {markedCounts.get(item.id) ?? 0} marked
                          <AssistTag item={item} defaults={defaults} />
                          {item.sessionId && (
                            <span>
                              {' '}
                              · held{' '}
                              {(() => {
                                const linked = sessions.find((x) => x.id === item.sessionId)
                                return linked ? sessionLabel(linked).split(' · ')[0] : 'in a class'
                              })()}
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

/** The points-assist note on a column row: its terms, where they come from, or off. */
function AssistTag({
  item,
  defaults,
}: {
  item: GradeItem
  defaults: readonly GradeAssistDefault[]
}) {
  const mode = assistModeOf(item)
  if (mode === 'off') return <span> · points off</span>
  const eff = effectiveTerms(item, defaults)
  if (!eff) return null
  return (
    <span className="text-reward">
      {' '}
      · {eff.cost} pts → +{formatMarks(eff.bonus)}
      {eff.source === 'default' ? ' (part)' : ''}
    </span>
  )
}

const MODE_LABEL: Record<AssistMode, string> = {
  default: 'Follow the part',
  own: 'Own terms',
  off: 'Off',
}

function EditRow({
  item,
  defaults,
  sessions,
  term,
  busy,
  canMoveUp,
  canMoveDown,
  onMove,
  onCancel,
  onSave,
}: {
  item: GradeItem
  defaults: GradeAssistDefault[]
  sessions: SessionSummary[]
  term: TermKey
  busy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (dir: -1 | 1) => void
  onCancel: () => void
  onSave: (
    name: string,
    maxScore: string,
    assist: AssistChoice,
    sessionId: string | null,
  ) => void
}) {
  const [name, setName] = useState(item.name)
  const [maxScore, setMaxScore] = useState(String(item.maxScore))
  const [mode, setMode] = useState<AssistMode>(() => assistModeOf(item))
  const [cost, setCost] = useState(item.pointsCost === null ? '' : String(item.pointsCost))
  const [bonus, setBonus] = useState(item.pointsBonus === null ? '' : formatMarks(item.pointsBonus))
  const [sessionId, setSessionId] = useState(item.sessionId ?? '')

  // NaN stands for "typed, but not a number" so the shared validator can name it.
  const costN = cost.trim() === '' ? null : /^\d+$/.test(cost.trim()) ? Number(cost.trim()) : NaN
  const bonusParsed = parseScoreInput(bonus)
  const bonusN = bonusParsed.ok ? bonusParsed.value : NaN
  const maxParsed = parseScoreInput(maxScore)
  const maxN = maxParsed.ok && maxParsed.value !== null ? maxParsed.value : item.maxScore
  // Own terms must be COMPLETE: both blank is "follow the part", which is a
  // different choice, and silently saving it as that would hide a half-finished edit.
  const ownError =
    mode !== 'own'
      ? null
      : costN === null && bonusN === null
        ? 'Fill in the points and the marks.'
        : boostTermsError(costN, bonusN, maxN)
  const ownTerms =
    mode === 'own' && ownError === null && costN !== null && bonusN !== null
      ? { cost: costN, bonus: bonusN }
      : null
  const partTerms = effectiveTerms(
    { component: item.component, assistOff: false, pointsCost: null, pointsBonus: null },
    defaults,
  )

  // This term's classes for this subject — plus the linked one, so editing a
  // column tied to a class outside the list never silently drops the link.
  const choices = sessions.filter(
    (x) => x.id === item.sessionId || termOf(x.startedAt) === term || termOf(x.startedAt) === null,
  )

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

      {/* The class this column was held in (0063). Anyone recorded absent OR
          excused there is marked Absent on this column — so an absentee is never
          typed twice, and cannot be given a points assist for a quiz they missed. */}
      <div className="space-y-1 rounded-xl bg-card-2 p-2.5">
        <Select
          label="Held in class"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">Not tied to a class</option>
          {choices.map((x) => (
            <option key={x.id} value={x.id}>
              {sessionLabel(x)}
            </option>
          ))}
        </Select>
        <p className="text-2xs text-muted">
          Students recorded absent or excused in that class are marked{' '}
          <b className="text-ink">A</b> on this column automatically, and can’t use points on it.
          You can also type A in any cell yourself.
        </p>
      </div>

      {/* Points assist for THIS column (0063). Three choices, because the common
          case — follow the part — needs no typing at all. Stated as the exact
          trade, since that is the sentence the student is shown before they confirm. */}
      <div className="space-y-2 rounded-xl bg-card-2 p-2.5">
        <p className="text-xs font-medium">Points assist</p>
        <SegmentedControl
          label="Points assist for this column"
          size="sm"
          value={mode}
          onChange={setMode}
          options={(['default', 'own', 'off'] as AssistMode[]).map((m) => ({
            value: m,
            label: MODE_LABEL[m],
          }))}
        />
        {mode === 'own' && (
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
        )}
        {mode === 'own' && ownError ? (
          <p className="text-2xs text-danger">{ownError}</p>
        ) : mode === 'own' && ownTerms ? (
          <p className="text-2xs text-muted">
            A student whose mark is in can spend{' '}
            <span className="font-semibold text-ink">{ownTerms.cost} points</span> to add{' '}
            <span className="font-semibold text-ink">{formatMarks(ownTerms.bonus)} marks</span>{' '}
            (never past {formatMarks(maxN)}). Once per column, and you approve each one.
          </p>
        ) : mode === 'default' ? (
          partTerms ? (
            <p className="text-2xs text-muted">
              Follows {COMPONENT_LABEL[item.component]}: a student whose mark is in can spend{' '}
              <span className="font-semibold text-ink">{partTerms.cost} points</span> to add{' '}
              <span className="font-semibold text-ink">{formatMarks(partTerms.bonus)} marks</span>{' '}
              (never past {formatMarks(maxN)}).
            </p>
          ) : (
            <p className="text-2xs text-muted">
              No terms are set for {COMPONENT_LABEL[item.component]} yet, so this column isn’t
              offered. Set them in the <b className="text-ink">Points assist</b> tab.
            </p>
          )
        ) : mode === 'off' ? (
          <p className="text-2xs text-muted">Not offered, whatever the part says.</p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={ownError !== null}
          onClick={() =>
            onSave(
              name,
              maxScore,
              { mode, cost: ownTerms?.cost ?? null, bonus: ownTerms?.bonus ?? null },
              sessionId === '' ? null : sessionId,
            )
          }
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
