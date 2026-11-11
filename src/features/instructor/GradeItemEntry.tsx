import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Rows } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Meter } from '@/components/ui/Meter'
import { cn } from '@/lib/cn'
import {
  cellKey,
  COMPONENT_LABEL,
  displayGrade,
  GRADE_COMPONENTS,
  sumsFromScores,
  termGrade,
} from '@/lib/grading'
import { isOverMax, parseScoreInput } from '@/lib/grade-entry'
import { cellDisplay, resolveCommit, type AbsentSource, type CellState } from '@/lib/grade-cell'
import { type CellEdit } from './GradeGrid'
import type { GradeAttendance, GradeItem, GradePolicy, GradeView, RosterPerson } from '@/lib/types'

/**
 * Entering marks on a phone: one column at a time, down the roster.
 *
 * The grid is the right shape on a desktop and the wrong one here — a name plus
 * twenty columns cannot be read two columns at a time. This is the same data
 * and the same commit path, turned ninety degrees: pick the quiz you have just
 * marked, then type one number per student.
 *
 * It is mounted INSTEAD of the grid, never alongside it (see GradeSheet): two
 * editors would mean two inputs per cell, and the keyboard navigation and the
 * failed-cell flagging both assume one.
 */

interface GradeItemEntryProps {
  students: RosterPerson[]
  items: GradeItem[]
  scores: Map<string, number>
  /** cellKey → why a cell reads Absent (0063). */
  absences: Map<string, AbsentSource>
  /** studentId → attendance counts; Recitation is computed from them (0063). */
  attendance: Map<string, GradeAttendance>
  /** For the term figure under each name — the same policy and view the grid uses. */
  policy: GradePolicy
  view: GradeView
  failed: Set<string>
  onCommit: (edit: CellEdit, previous: CellState) => void
}

export function GradeItemEntry({
  students,
  items,
  scores,
  absences,
  attendance,
  policy,
  view,
  failed,
  onCommit,
}: GradeItemEntryProps) {
  const [itemId, setItemId] = useState<string>(() => items[0]?.id ?? '')
  const item = items.find((i) => i.id === itemId) ?? items[0]

  // Seeded per item: switching columns re-reads the parent's map, which is
  // always current because every commit writes through to it.
  const [values, setValues] = useState<Map<string, CellState>>(new Map())
  const [badCell, setBadCell] = useState<{ studentId: string; reason: string } | null>(null)

  // The roster's inputs, by row. Enter walks to the next one through this map
  // rather than `document.getElementById('entry-N')`: that was a convention in a
  // global namespace (any other element with the same id would have taken the
  // walk) and a lookup that has to search the whole document on every Enter.
  const inputs = useRef(new Map<number, HTMLInputElement>())

  const current = useMemo(() => {
    if (!item) return new Map<string, CellState>()
    const m = new Map<string, CellState>()
    for (const s of students) {
      const own = values.get(cellKey(item.id, s.id))
      if (own !== undefined) m.set(s.id, own)
      else {
        const v = scores.get(cellKey(item.id, s.id))
        m.set(s.id, {
          value: v === undefined ? null : v,
          absent: absences.get(cellKey(item.id, s.id)) ?? null,
        })
      }
    }
    return m
  }, [item, students, scores, absences, values])

  const marked = useMemo(
    () => [...current.values()].filter((c) => c.value !== null).length,
    [current],
  )

  /**
   * Each student's TERM figure, so you can see what the mark you are typing does
   * to them without leaving the phone for the desktop grid.
   *
   * No arithmetic of its own: `sumsFromScores` and `termGrade` are the very
   * functions the grid's rows call, so the two screens cannot disagree about a
   * grade. A mark typed in THIS session lives in `values` (keyed like cellKey),
   * everything else in `scores`; a cleared mark is `null` and drops out of the
   * denominator exactly as it does on the grid.
   */
  const termFigures = useMemo(() => {
    const out = new Map<string, number | null>()
    for (const s of students) {
      const marks = new Map<string, number>()
      for (const i of items) {
        const key = cellKey(i.id, s.id)
        const typed = values.get(key)
        const v = typed !== undefined ? typed.value : scores.get(key)
        if (v !== undefined && v !== null) marks.set(i.id, v)
      }
      out.set(s.id, termGrade(sumsFromScores(items, marks, attendance.get(s.id)), policy, view))
    }
    return out
  }, [students, items, scores, values, policy, view, attendance])

  if (!item) {
    return (
      <EmptyState compact>No score columns yet. Add one to start entering marks.</EmptyState>
    )
  }

  function commit(student: RosterPerson, el: HTMLInputElement) {
    if (!item) return
    const parsed = parseScoreInput(el.value)
    const before: CellState = current.get(student.id) ?? { value: null, absent: null }

    if (!parsed.ok) {
      setBadCell({ studentId: student.id, reason: parsed.reason })
      el.value = cellDisplay(before)
      return
    }

    setBadCell(null)
    // The same rule the desktop grid uses (lib/grade-cell.ts): a mark, A, or a clear.
    const outcome = resolveCommit(parsed, before)
    el.value = outcome.display
    if (outcome.kind === 'none') return

    setValues((m) => new Map(m).set(cellKey(item.id, student.id), outcome.next))
    onCommit({ itemId: item.id, studentId: student.id, ...outcome.write }, before)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.currentTarget.blur()
    // Walk down the roster, the way the grid's Enter does.
    const next = inputs.current.get(index + 1)
    if (next) {
      next.focus()
      next.select()
    }
  }

  return (
    <div className="space-y-3">
      <Select
        label="Score column"
        value={item.id}
        onChange={(e) => {
          setItemId(e.target.value)
          setBadCell(null)
        }}
      >
        {GRADE_COMPONENTS.map((c) => {
          const group = items.filter((i) => i.component === c)
          if (group.length === 0) return null
          return (
            <optgroup key={c} label={COMPONENT_LABEL[c]}>
              {group.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · out of {i.maxScore}
                </option>
              ))}
            </optgroup>
          )
        })}
      </Select>

      <div className="flex items-center gap-3">
        <Meter value={marked} max={students.length} className="flex-1" />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {marked} of {students.length} marked
        </span>
      </div>

      <Rows>
        {students.map((student, index) => {
          const cell = current.get(student.id) ?? { value: null, absent: null }
          const value = cell.value
          const isA = value === null && cell.absent !== null
          const over = isOverMax(value, item.maxScore)
          const isBad = badCell?.studentId === student.id
          return (
            <div key={student.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{student.fullName}</p>
                <p className="text-2xs tabular-nums text-muted">
                  Term {displayGrade(termFigures.get(student.id) ?? null)}
                  {view === 'soFar' ? ' so far' : ''}
                </p>
              </div>
              <input
                ref={(el) => {
                  if (el) inputs.current.set(index, el)
                  else inputs.current.delete(index)
                }}
                type="text"
                // The decimal pad, because numbers are what this is for. It has no
                // letters, so Absent is the A button beside it, not a typed key.
                inputMode="decimal"
                defaultValue={cellDisplay(cell)}
                aria-label={`${item.name} for ${student.fullName}${isA ? ', absent' : ''}`}
                aria-invalid={isBad || undefined}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => commit(student, e.currentTarget)}
                onKeyDown={(e) => onKeyDown(e, index)}
                className={cn(
                  // text-base, or iOS zooms the page on every single cell.
                  'h-11 w-16 shrink-0 rounded-xl border border-line bg-canvas text-center text-base tabular-nums',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]',
                  isBad && 'border-danger text-danger',
                  !isBad && over && 'border-warn text-warn',
                  !isBad && isA && 'border-warn font-semibold text-warn',
                  !isBad && failed.has(cellKey(item.id, student.id)) && 'border-danger',
                )}
              />
              {/* Absent. A toggle: it marks the student absent, or takes a TYPED A
                  back off. An A that comes from attendance can't be toggled here
                  (it is about the class) and the button says so. */}
              <button
                type="button"
                aria-pressed={isA}
                aria-label={`Absent: ${student.fullName}`}
                disabled={cell.absent === 'auto'}
                title={
                  cell.absent === 'auto'
                    ? 'Recorded absent or excused in the class this column was held in.'
                    : isA
                      ? 'Marked absent — tap to undo'
                      : 'Mark absent'
                }
                onClick={() => {
                  const el = inputs.current.get(index)
                  if (!el) return
                  el.value = cell.absent === 'manual' ? '' : 'A'
                  commit(student, el)
                }}
                className={cn(
                  'h-11 w-11 shrink-0 rounded-xl border text-sm font-semibold',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]',
                  isA
                    ? 'border-warn bg-warn-solid/10 text-warn'
                    : 'border-line text-muted hover:text-ink',
                  'disabled:opacity-60',
                )}
              >
                A
              </button>
              <span className="w-9 shrink-0 text-right text-2xs text-muted">
                /{item.maxScore}
              </span>
            </div>
          )
        })}
      </Rows>

      {badCell && <p className="text-xs text-danger">{badCell.reason}</p>}
    </div>
  )
}
