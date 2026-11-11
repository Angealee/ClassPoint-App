import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, Rows } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/Toast'
import { PencilIcon, TrashIcon } from '@/components/ui/icons'
import { COMPONENT_LABEL, GRADE_COMPONENTS } from '@/lib/grading'
import { parseScoreInput } from '@/lib/grade-entry'
import { termOf } from '@/lib/term'
import { errorText } from '@/lib/errors'
import { createGradeItem, listSessions, setGradeItemArchived, updateGradeItem } from '@/lib/api'
import type { GradeComponent, GradeItem, SessionSummary, TermKey } from '@/lib/types'

/** "20" or "17.5" — no trailing zeros. */
const formatMax = (n: number) => String(Math.round(n * 100) / 100)

const COLUMN_PARTS = GRADE_COMPONENTS.filter((c) => c !== 'recitation')

function sessionLabel(s: SessionSummary): string {
  const day = new Date(s.startedAt).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
  return [day, s.subjectCode, s.topic].filter(Boolean).join(' · ')
}

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

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  useEffect(() => {
    let cancelled = false
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
      toast(errorText(err, 'Could not add that column.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(
    item: GradeItem,
    nextName: string,
    nextMax: string,
    pointsOff: boolean,
    nextSessionId: string | null,
  ) {
    const parsed = parseScoreInput(nextMax)
    if (!parsed.ok || parsed.value === null || parsed.value <= 0) {
      toast('A score column needs a maximum above 0.', 'error')
      return
    }
    setBusy(true)
    try {
      await updateGradeItem(item.id, {
        name: nextName,
        maxScore: parsed.value,
        ...(pointsOff !== item.assistOff ? { assistOff: pointsOff } : {}),
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
                      sessions={sessions}
                      term={term}
                      busy={busy}
                      canMoveUp={index > 0}
                      canMoveDown={index < group.length - 1}
                      onMove={(dir) => void move(item, dir)}
                      onCancel={() => setEditing(null)}
                      onSave={(n, m, off, sessionId) => void saveEdit(item, n, m, off, sessionId)}
                    />
                  ) : (
                    <div key={item.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm" title={item.name}>
                          {item.name}
                        </p>
                        <p className="text-2xs text-muted">
                          out of {item.maxScore} · {markedCounts.get(item.id) ?? 0} marked
                          {item.assistOff && <span> · points off</span>}
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

function EditRow({
  item,
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
  sessions: SessionSummary[]
  term: TermKey
  busy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (dir: -1 | 1) => void
  onCancel: () => void
  onSave: (name: string, maxScore: string, pointsOff: boolean, sessionId: string | null) => void
}) {
  const [name, setName] = useState(item.name)
  const [maxScore, setMaxScore] = useState(String(item.maxScore))
  const [pointsOff, setPointsOff] = useState(item.assistOff)
  const [sessionId, setSessionId] = useState(item.sessionId ?? '')
  const maxParsed = parseScoreInput(maxScore)
  const maxN = maxParsed.ok && maxParsed.value !== null ? maxParsed.value : item.maxScore

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

      <div className="flex items-center gap-3 rounded-xl bg-card-2 p-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">Students can use points on this column</p>
          <p className="text-2xs text-muted">
            1 point = 1 mark, never past {formatMax(maxN)}. Students who were absent can’t, and you
            approve each request.
          </p>
        </div>
        <Toggle
          on={!pointsOff}
          label="Students can use points on this column"
          onChange={(next) => setPointsOff(!next)}
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy}
          onClick={() => onSave(name, maxScore, pointsOff, sessionId === '' ? null : sessionId)}
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
