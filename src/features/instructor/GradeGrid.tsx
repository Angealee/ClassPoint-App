import { memo, useCallback, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/Button'
 import { EmptyState } from '@/components/ui/EmptyState'
 import { TableIcon } from '@/components/ui/icons'
 import { TableScroller } from '@/components/ui/TableScroller'
 import { cn } from '@/lib/cn'
import {
  cellKey,
  classStanding,
  CS_COMPONENTS,
  componentScores,
  COMPONENT_LABEL,
  displayGrade,
  GRADE_COMPONENTS,
  sumsFromScores,
  termGrade,
  weightedComponents,
} from '@/lib/grading'
import {
  isColumnPaste,
  isOverMax,
  parsePastedColumn,
  parseScoreInput,
} from '@/lib/grade-entry'
import { formatMarks } from '@/lib/grade-boost'
import { cellDisplay, resolveCommit, type AbsentSource, type CellState, type CellWrite } from '@/lib/grade-cell'
import { TONE } from '@/lib/tone'
import type {
  GradeAttendance,
  GradeBoost,
  GradeComponent,
  GradeItem,
  GradePolicy,
  GradeView,
  RosterPerson,
} from '@/lib/types'

export interface CellEdit extends CellWrite {
  itemId: string
  studentId: string
}

interface GradeGridProps {
  students: RosterPerson[]
  /** Already ordered and already filtered to the live columns. */
  items: GradeItem[]
  scores: Map<string, number>
  policy: GradePolicy
  view: GradeView
  failed: Set<string>
  boosts: Map<string, GradeBoost>
  absences: Map<string, AbsentSource>
  attendance: Map<string, GradeAttendance>
  onCommit: (edit: CellEdit, previous: CellState) => void
  /** A column pasted from Excel, applied in one go by the parent. */
  onPasteColumn: (itemId: string, startIndex: number, values: string[]) => void
  /** Opens the Columns sheet from the empty state. */
  onAddColumn?: () => void
}

export function GradeGrid({
  students,
  items,
  scores,
  policy,
  view,
  failed,
  boosts,
  absences,
  attendance,
  onCommit,
  onPasteColumn,
  onAddColumn,
}: GradeGridProps) {
  const inputs = useRef(new Map<string, HTMLInputElement>())

  const registerInput = useCallback((key: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(key, el)
    else inputs.current.delete(key)
  }, [])

  const moveFocus = useCallback(
    (itemId: string, studentIndex: number, delta: number) => {
      const next = students[studentIndex + delta]
      if (!next) return
      const el = inputs.current.get(cellKey(itemId, next.id))
      el?.focus()
      el?.select()
    },
    [students],
  )

  const indexById = useMemo(() => {
    const m = new Map<string, number>()
    students.forEach((s, i) => m.set(s.id, i))
    return m
  }, [students])

  const bands = useMemo(() => {
    const out: Array<{ component: GradeComponent; span: number }> = []
    for (const item of items) {
      const last = out[out.length - 1]
      if (last && last.component === item.component) last.span += 1
      else out.push({ component: item.component, span: 1 })
    }
    return out
  }, [items])

  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)

  const [live, setLive] = useState(() => new Map(scores))

  const handleCommit = useCallback(
    (edit: CellEdit, previous: CellState) => {
      setLive((prev) => {
        const next = new Map(prev)
        const key = cellKey(edit.itemId, edit.studentId)
        if (edit.value === null) next.delete(key)
        else next.set(key, edit.value)
        return next
      })
      onCommit(edit, previous)
    },
    [onCommit],
  )

  /** Per column: how many marks, and what they add to. */
  const itemStats = useMemo(() => {
    const m = new Map<string, { sum: number; count: number }>()
    for (const item of items) m.set(item.id, { sum: 0, count: 0 })
    for (const [key, value] of live) {
      const stat = m.get(key.slice(0, key.indexOf(':')))
      if (stat) {
        stat.sum += value
        stat.count += 1
      }
    }
    return m
  }, [items, live])

  const anyAttendance = useMemo(
    () => [...attendance.values()].some((a) => a.counted > 0),
    [attendance],
  )
  const visibleKey =
    view === 'official'
      ? 'all'
      : GRADE_COMPONENTS.filter((c) =>
          c === 'recitation'
            ? anyAttendance
            : items.some((i) => i.component === c && (itemStats.get(i.id)?.count ?? 0) > 0),
        ).join(',')
  const visibleComps = useMemo<GradeComponent[]>(
    () =>
      visibleKey === 'all'
        ? [...GRADE_COMPONENTS]
        : visibleKey === ''
          ? []
          : (visibleKey.split(',') as GradeComponent[]),
    [visibleKey],
  )
  const hiddenComps = GRADE_COMPONENTS.filter((c) => !visibleComps.includes(c))
  const showCs = view === 'official' || visibleComps.some((c) => CS_COMPONENTS.includes(c))
  // Columns between the marks and Term grade.
  const middleCols = visibleComps.length + (showCs ? 1 : 0)

  const weighted = useMemo(() => weightedComponents(policy), [policy])

  const termAverage = useMemo(() => {
    let sum = 0
    let n = 0
    for (const s of students) {
      const marks = new Map<string, number>()
      for (const item of items) {
        const v = live.get(cellKey(item.id, s.id))
        if (v !== undefined) marks.set(item.id, v)
      }
      const g = termGrade(sumsFromScores(items, marks, attendance.get(s.id)), policy, view)
      if (g !== null) {
        sum += g
        n += 1
      }
    }
    return { average: n > 0 ? sum / n : null, graded: n }
  }, [students, items, live, policy, view, attendance])

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<TableIcon className="h-6 w-6" />}
        description="A column is one quiz, one activity or the exam — add the first and the roster appears underneath it."
        action={
          onAddColumn ? (
            <Button size="sm" onClick={onAddColumn}>
              Add a column
            </Button>
          ) : undefined
        }
      >
        No score columns in this term yet.
      </EmptyState>
    )
  }

  return (
    <TableScroller fill>
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              colSpan={2}
              className="sticky left-0 top-0 z-40 h-6 bg-card px-3 text-left"
            >
            </th>
            {bands.map((band) => (
              <th
                key={band.component}
                scope="colgroup"
                colSpan={band.span}
                className="sticky top-0 z-30 h-6 border-l border-line/40 bg-card px-3 text-left text-xs font-medium text-muted"
                title={COMPONENT_LABEL[band.component]}
              >
                <span className="block truncate">{COMPONENT_LABEL[band.component]}</span>
              </th>
            ))}
            <th
              scope="colgroup"
              colSpan={middleCols + 1}
              className="sticky top-0 z-30 h-6 border-l-2 border-line bg-card-2 px-3 text-left text-xs font-medium text-muted"
              title={
                hiddenComps.length > 0
                  ? `Not shown yet (nothing marked): ${hiddenComps.map((c) => COMPONENT_LABEL[c]).join(', ')}. Official shows them all.`
                  : undefined
              }
            >
              Computed
              {hiddenComps.length > 0 && (
                <span className="font-normal text-muted/70"> · {hiddenComps.length} hidden</span>
              )}
            </th>
          </tr>

          <tr>
            <th
              scope="col"
              className="sticky left-0 top-6 z-30 w-8 min-w-8 border-b border-line bg-card px-0 py-2 text-center text-2xs font-medium text-muted"
            >
              #
            </th>
            <th
              scope="col"
              className="sticky left-8 top-6 z-30 w-60 min-w-60 border-b border-line bg-card px-3 py-2 text-left font-semibold"
            >
              Student
            </th>
            {items.map((item) => (
              <th
                key={item.id}
                scope="col"
                className="sticky top-6 z-20 min-w-22 border-b border-r border-line border-r-line/40 bg-card px-2 py-1.5 text-center font-semibold"
                title={`${item.name} · ${COMPONENT_LABEL[item.component]} · out of ${item.maxScore}`}
              >
                <span className="block w-0 min-w-full truncate">{item.name}</span>
                <span className="block text-2xs font-normal text-muted">/{item.maxScore}</span>
              </th>
            ))}
            {visibleComps.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  'sticky top-6 z-20 w-28 min-w-28 border-b border-line bg-card-2 px-2 py-1.5 text-center text-2xs font-semibold text-muted',
                  i === 0 && 'border-l-2 border-l-line',
                )}
              >
                {COMPONENT_LABEL[c]}
                {c === 'recitation' && (
                  // Not typed: it is the term's attendance rate, as-is.
                  <span className="block text-2xs font-normal text-muted/70">attendance</span>
                )}
              </th>
            ))}
            {showCs && (
              <th
                scope="col"
                className={cn(
                  'sticky top-6 z-20 w-28 min-w-28 border-b border-line bg-card-2 px-2 py-1.5 text-center text-2xs font-semibold text-muted',
                  visibleComps.length === 0 && 'border-l-2 border-l-line',
                )}
              >
                Class standing
              </th>
            )}
            <th
              scope="col"
              className="sticky right-0 top-6 z-30 w-32 min-w-32 border-b border-l-2 border-line border-l-line bg-card-2 px-2 py-1.5 text-center font-semibold"
            >
              Term grade
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => (
            <GradeRow
              key={student.id}
              student={student}
              rowIndex={index}
              items={items}
              scores={scores}
              policy={policy}
              view={view}
              failed={failed}
              boosts={boosts}
              absences={absences}
              attendance={attendance.get(student.id)}
              onCommit={handleCommit}
              onPasteColumn={onPasteColumn}
              registerInput={registerInput}
              moveFocus={moveFocus}
              indexById={indexById}
              focusedItemId={focusedItemId}
              onFocusColumn={setFocusedItemId}
              visibleComps={visibleComps}
              showCs={showCs}
              weighted={weighted}
            />
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td
              colSpan={2}
              className="sticky bottom-0 left-0 z-30 border-t border-line bg-card px-3 py-1 text-left text-2xs leading-tight text-muted"
            >
              <span className="block font-semibold text-ink">Class average</span>
              <span className="block">Marked</span>
            </td>
            {items.map((item) => {
              const stat = itemStats.get(item.id) ?? { sum: 0, count: 0 }
              const average = stat.count > 0 ? stat.sum / stat.count : null
              return (
                <td
                  key={item.id}
                  className="sticky bottom-0 z-20 border-t border-r border-line border-r-line/40 bg-card px-2 py-1 text-center tabular-nums leading-tight"
                >
                  <span className="block text-xs font-semibold">
                    {average === null ? '—' : String(Math.round(average * 100) / 100)}
                  </span>
                  <span
                    className={cn(
                      'block text-2xs',
                      stat.count < students.length ? 'text-warn' : 'text-muted',
                    )}
                  >
                    {stat.count}/{students.length}
                  </span>
                </td>
              )
            })}
            {middleCols > 0 && (
              <td
                colSpan={middleCols}
                className="sticky bottom-0 z-20 border-l-2 border-t border-line border-l-line bg-card-2"
              />
            )}
            <td
              className={cn(
                'sticky bottom-0 right-0 z-30 border-t border-line bg-card-2 px-2 py-1 text-center tabular-nums leading-tight',
                middleCols === 0 && 'border-l-2 border-l-line',
              )}
            >
              <span className="block text-xs font-semibold">
                {termAverage.average === null ? '—' : displayGrade(termAverage.average)}
              </span>
              <span className="block text-2xs text-muted">
                {termAverage.graded}/{students.length}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </TableScroller>
  )
}

interface GradeRowProps {
  student: RosterPerson
  rowIndex: number
  items: GradeItem[]
  scores: Map<string, number>
  policy: GradePolicy
  view: GradeView
  failed: Set<string>
  boosts: Map<string, GradeBoost>
  absences: Map<string, AbsentSource>
  attendance: GradeAttendance | undefined
  onCommit: (edit: CellEdit, previous: CellState) => void
  onPasteColumn: (itemId: string, startIndex: number, values: string[]) => void
  registerInput: (key: string, el: HTMLInputElement | null) => void
  moveFocus: (itemId: string, studentIndex: number, delta: number) => void
  indexById: Map<string, number>
  focusedItemId: string | null
  onFocusColumn: (itemId: string) => void
  visibleComps: GradeComponent[]
  showCs: boolean
  weighted: GradeComponent[]
}

const GradeRow = memo(function GradeRow({
  student,
  rowIndex,
  items,
  scores,
  policy,
  view,
  failed,
  boosts,
  absences,
  attendance,
  onCommit,
  onPasteColumn,
  registerInput,
  moveFocus,
  focusedItemId,
  onFocusColumn,
  visibleComps,
  showCs,
  weighted,
}: GradeRowProps) {
  const [values, setValues] = useState<Map<string, number | null>>(() => {
    const m = new Map<string, number | null>()
    for (const item of items) {
      const v = scores.get(cellKey(item.id, student.id))
      if (v !== undefined) m.set(item.id, v)
    }
    return m
  })
  const [absent, setAbsent] = useState<Map<string, AbsentSource>>(() => {
    const m = new Map<string, AbsentSource>()
    for (const item of items) {
      const a = absences.get(cellKey(item.id, student.id))
      if (a) m.set(item.id, a)
    }
    return m
  })
  const [badCell, setBadCell] = useState<{ itemId: string; reason: string } | null>(null)

  const stateOf = (itemId: string): CellState => ({
    value: values.get(itemId) ?? null,
    absent: absent.get(itemId) ?? null,
  })

  const figures = useMemo(() => {
    const marked = new Map<string, number>()
    for (const [itemId, v] of values) if (v !== null) marked.set(itemId, v)
    const sums = sumsFromScores(items, marked, attendance)
    const comps = componentScores(sums, policy, view)
    const unmarked = {} as Record<GradeComponent, boolean>
    for (const c of GRADE_COMPONENTS) {
      unmarked[c] = view === 'soFar' && sums[c].sumMaxMarked <= 0
    }
    const csUnmarked = CS_COMPONENTS.every((c) => unmarked[c])
    const term = termGrade(sums, policy, view)
    const partial = view === 'soFar' && term !== null && weighted.some((c) => unmarked[c])
    return {
      comps,
      unmarked,
      csUnmarked,
      cs: classStanding(comps, policy),
      term,
      partial,
      partsMarked: weighted.filter((c) => !unmarked[c]).length,
    }
  }, [values, items, policy, view, weighted, attendance])

  function commit(item: GradeItem, el: HTMLInputElement) {
    const parsed = parseScoreInput(el.value)
    const current = stateOf(item.id)

    if (!parsed.ok) {
      setBadCell({ itemId: item.id, reason: parsed.reason })
      el.value = cellDisplay(current)
      return
    }

    setBadCell(null)
    const outcome = resolveCommit(parsed, current)
    el.value = outcome.display
    if (outcome.kind === 'none') return

    setValues((m) => {
      const next = new Map(m)
      if (outcome.next.value === null) next.delete(item.id)
      else next.set(item.id, outcome.next.value)
      return next
    })
    setAbsent((m) => {
      const next = new Map(m)
      if (outcome.next.absent === null) next.delete(item.id)
      else next.set(item.id, outcome.next.absent)
      return next
    })
    onCommit({ itemId: item.id, studentId: student.id, ...outcome.write }, current)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, item: GradeItem) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      commit(item, e.currentTarget)
      moveFocus(item.id, rowIndex, 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      commit(item, e.currentTarget)
      moveFocus(item.id, rowIndex, -1)
    } else if (e.key === 'Escape') {
      e.currentTarget.value = cellDisplay(stateOf(item.id))
      setBadCell(null)
      e.currentTarget.blur()
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>, item: GradeItem) {
    const text = e.clipboardData.getData('text/plain')
    if (!isColumnPaste(text)) return // one value — let the browser paste it
    e.preventDefault()
    onPasteColumn(item.id, rowIndex, parsePastedColumn(text))
  }

  const zebra = rowIndex % 2 === 1

  return (
    <tr className="group focus-within:[&>*]:shadow-[inset_0_0_0_999px_color-mix(in_oklab,var(--color-accent-solid)_7%,transparent)]">
      <th
        scope="row"
        className={cn(
          'sticky left-0 z-10 w-8 min-w-8 border-b border-line px-0 py-0 text-center text-2xs font-normal tabular-nums text-muted',
          zebra ? 'bg-card-2' : 'bg-card',
          'group-hover:bg-card-2',
        )}
      >
        {rowIndex + 1}
      </th>
      <th
        scope="row"
        className={cn(
          'sticky left-8 z-10 w-60 min-w-60 max-w-60 truncate border-b border-line px-3 py-0 text-left font-normal',
          zebra ? 'bg-card-2' : 'bg-card',
          'group-hover:bg-card-2',
        )}
      >
        {student.fullName}
      </th>

      {items.map((item) => {
        const key = cellKey(item.id, student.id)
        const value = values.get(item.id) ?? null
        const absentSource = absent.get(item.id) ?? null
        const isA = value === null && absentSource !== null
        const over = isOverMax(value, item.maxScore)
        const isBad = badCell?.itemId === item.id
        const boost = boosts.get(key)
        const boostNote = boost
          ? value === boost.scoreAfter
            ? `Points assist +${formatMarks(boost.marksGranted)} for ${boost.pointsSpent} points (was ${formatMarks(boost.scoreBefore)}). Reverse it from Requests.`
            : `A points assist of +${formatMarks(boost.marksGranted)} was applied, but this mark has been edited since. Reverse it from Requests.`
          : undefined
        return (
          <td
            key={item.id}
            className={cn(
              'relative border-b border-r border-line border-r-line/40 p-0',
              zebra ? 'bg-card-2' : 'bg-card',
              focusedItemId === item.id &&
                'shadow-[inset_0_0_0_999px_color-mix(in_oklab,var(--color-accent-solid)_7%,transparent)]',
            )}
          >
            <input
              ref={(el) => registerInput(key, el)}
              type="text"
              inputMode="decimal"
              size={4}
              defaultValue={cellDisplay({ value, absent: absentSource })}
              aria-label={`${item.name} for ${student.fullName}${isA ? ', absent' : ''}${boost ? ', helped with points' : ''}`}
              aria-invalid={isBad || undefined}
              title={
                isBad
                  ? badCell.reason
                  : over
                    ? `Above the maximum of ${item.maxScore}`
                    : isA
                      ? absentSource === 'auto'
                        ? 'Absent — recorded absent or excused in the class this column was held in. Points can’t be used on it.'
                        : 'Absent — you marked this student absent. Points can’t be used on it.'
                      : (boostNote ??
                        (absentSource === 'auto'
                          ? 'Recorded absent or excused in the class this column was held in. Points can’t be used on it.'
                          : undefined))
              }
              onFocus={(e) => {
                e.currentTarget.select()
                onFocusColumn(item.id)
              }}
              onBlur={(e) => commit(item, e.currentTarget)}
              onKeyDown={(e) => onKeyDown(e, item)}
              onPaste={(e) => onPaste(e, item)}
              className={cn(
                'h-8 w-full bg-transparent px-2 text-center text-base tabular-nums outline-none',
                'focus:bg-accent-solid/10 focus:ring-2 focus:ring-inset focus:ring-[var(--color-ring)]',
                isBad && 'bg-danger-solid/10 text-danger',
                !isBad && over && 'bg-warn-solid/10 text-warn',
                !isBad && isA && 'font-semibold text-warn',
                !isBad && failed.has(key) && 'bg-danger-solid/10',
              )}
            />
            {!isA && absentSource === 'auto' && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-1 top-0.5 text-2xs font-semibold leading-none text-warn"
              >
                A
              </span>
            )}
            {boost && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full',
                  value === boost.scoreAfter
                    ? TONE.reward.dot
                    : 'border border-reward bg-transparent',
                )}
              />
            )}
          </td>
        )
      })}

      {visibleComps.map((c, i) => (
        <td
          key={c}
          className={cn(
            'border-b border-line px-2 py-0 text-center text-xs tabular-nums text-muted',
            zebra ? 'bg-card-2/80' : 'bg-card-2/50',
            i === 0 && 'border-l-2 border-l-line',
          )}
        >
          {figures.unmarked[c] ? <span className="text-muted/50">—</span> : displayGrade(figures.comps[c])}
        </td>
      ))}
      {showCs && (
        <td
          className={cn(
            'border-b border-line px-2 py-0 text-center text-xs tabular-nums text-muted',
            zebra ? 'bg-card-2/80' : 'bg-card-2/50',
            visibleComps.length === 0 && 'border-l-2 border-l-line',
          )}
        >
          {figures.csUnmarked ? <span className="text-muted/50">—</span> : displayGrade(figures.cs)}
        </td>
      )}
      <td
        className={cn(
          'sticky right-0 z-10 border-b border-l-2 border-line border-l-line px-2 py-0 text-center font-display font-bold tabular-nums group-hover:bg-card',
          zebra ? 'bg-card' : 'bg-card-2',
        )}
        title={
          figures.partial
            ? `So far, from ${figures.partsMarked} of ${weighted.length} parts. It will move as the rest are marked.`
            : undefined
        }
      >
        <span className={cn(figures.partial && 'font-semibold text-muted')}>
          {displayGrade(figures.term)}
        </span>
        {figures.partial && (
          <span className="ml-1 text-2xs font-normal text-warn">partial</span>
        )}
      </td>
    </tr>
  )
})
