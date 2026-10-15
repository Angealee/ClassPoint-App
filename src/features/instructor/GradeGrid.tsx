import { memo, useCallback, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import {
  classStanding,
  componentScores,
  COMPONENT_LABEL,
  displayGrade,
  GRADE_COMPONENTS,
  sumsFromScores,
  termGrade,
} from '@/lib/grading'
import {
  formatScoreInput,
  isColumnPaste,
  isOverMax,
  parsePastedColumn,
  parseScoreInput,
} from '@/lib/grade-entry'
import type { GradeItem, GradePolicy, GradeView, RosterPerson } from '@/lib/types'

/**
 * The spreadsheet: students down, score columns across.
 *
 * ── WHY THE INPUTS ARE UNCONTROLLED ─────────────────────────────────────────
 * ⚠ Every other input in this codebase is controlled, and `defaultValue`
 * appears nowhere else. That is deliberate here and should not be "fixed" back.
 * A section's term is ~40 students × ~20 items ≈ 800 inputs; a controlled grid
 * re-renders all of them on every keystroke. Each ROW owns its committed values
 * in local state, the inputs hold the in-progress text themselves, and a commit
 * re-renders exactly one row to update its own figures. Nothing above the row
 * re-renders while typing at all.
 *
 * The consequence to respect: the DOM is the source of truth between commits.
 * Anything that changes values from outside (undo, a pasted column) goes
 * through the parent's authoritative map and remounts this component with a
 * fresh `key` — both are deliberate one-off actions where a remount is free.
 */

export interface CellEdit {
  itemId: string
  studentId: string
  value: number | null
}

export function cellKey(itemId: string, studentId: string): string {
  return `${itemId}:${studentId}`
}

interface GradeGridProps {
  students: RosterPerson[]
  /** Already ordered and already filtered to the live columns. */
  items: GradeItem[]
  /** cellKey → score. A missing entry means "not marked yet", never zero. */
  scores: Map<string, number>
  policy: GradePolicy
  view: GradeView
  /** Cells whose last write failed — kept on screen, flagged, never discarded. */
  failed: Set<string>
  onCommit: (edit: CellEdit, previous: number | null) => void
  /** A column pasted from Excel, applied in one go by the parent. */
  onPasteColumn: (itemId: string, startIndex: number, values: string[]) => void
}

export function GradeGrid({
  students,
  items,
  scores,
  policy,
  view,
  failed,
  onCommit,
  onPasteColumn,
}: GradeGridProps) {
  const inputs = useRef(new Map<string, HTMLInputElement>())

  const registerInput = useCallback((key: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(key, el)
    else inputs.current.delete(key)
  }, [])

  /**
   * Enter and the up/down arrows walk the column, which is how a column of
   * forty marks gets typed without touching the mouse.
   *
   * Left/right are deliberately NOT bound: they would fight the text caret
   * inside the cell you are editing. Tab already moves across, natively.
   */
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

  if (items.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted">
        No score columns yet. Add one to start entering marks.
      </p>
    )
  }

  return (
    // ⚠ THE SCROLLER OWNS BOTH AXES, AND THAT IS WHAT MAKES THE HEADERS STICK.
    //
    // A horizontal scroller is not optional even on a wide route: a name column
    // plus ~20 items plus five derived columns measures ~2,500px against the
    // 1,152px `wide` gives us. But a sticky element only sticks inside its own
    // scroll container — with the height unbounded the page scrolled instead,
    // and the column headers slid away after about twelve rows (measured at
    // -503px), so you could no longer tell which quiz you were typing into.
    //
    // `max-h` is what bounds it. `flex-1` was tried first and does nothing:
    // every height in the shell chain is a `min-h`, so the column grows to its
    // content and the scroller never gets a ceiling (measured 1,539px tall and
    // not scrolling). A viewport-relative cap needs no agreement with Shell's
    // paddings — the trap CLAUDE.md records for `calc(100dvh - …)` layouts —
    // and a grid shorter than the cap simply never scrolls.
    <div className="-mx-1 max-h-[75dvh] overflow-auto overscroll-contain px-1 pb-2">
      <table className="w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-30 border-b border-line bg-card px-3 py-2 text-left font-semibold"
            >
              Student
            </th>
            {items.map((item) => (
              <th
                key={item.id}
                scope="col"
                className="sticky top-0 z-20 min-w-22 border-b border-line bg-card px-2 py-2 text-center font-semibold"
                title={`${COMPONENT_LABEL[item.component]} · out of ${item.maxScore}`}
              >
                <span className="block truncate">{item.name}</span>
                <span className="block text-2xs font-normal text-muted">/{item.maxScore}</span>
              </th>
            ))}
            {GRADE_COMPONENTS.map((c) => (
              <th
                key={c}
                scope="col"
                className="sticky top-0 z-20 min-w-20 border-b border-line bg-card-2 px-2 py-2 text-center text-2xs font-semibold text-muted"
              >
                {COMPONENT_LABEL[c]}
              </th>
            ))}
            <th
              scope="col"
              className="sticky top-0 z-20 min-w-20 border-b border-line bg-card-2 px-2 py-2 text-center text-2xs font-semibold text-muted"
            >
              Class standing
            </th>
            <th
              scope="col"
              className="sticky top-0 z-20 min-w-20 border-b border-line bg-card-2 px-2 py-2 text-center font-semibold"
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
              onCommit={onCommit}
              onPasteColumn={onPasteColumn}
              registerInput={registerInput}
              moveFocus={moveFocus}
              indexById={indexById}
            />
          ))}
        </tbody>
      </table>
    </div>
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
  onCommit: (edit: CellEdit, previous: number | null) => void
  onPasteColumn: (itemId: string, startIndex: number, values: string[]) => void
  registerInput: (key: string, el: HTMLInputElement | null) => void
  moveFocus: (itemId: string, studentIndex: number, delta: number) => void
  indexById: Map<string, number>
}

/**
 * One student.
 *
 * Memoised, and the props are all stable (the parent memoises its callbacks and
 * its item list), so typing in row 7 cannot re-render rows 1–40.
 */
const GradeRow = memo(function GradeRow({
  student,
  rowIndex,
  items,
  scores,
  policy,
  view,
  failed,
  onCommit,
  onPasteColumn,
  registerInput,
  moveFocus,
}: GradeRowProps) {
  // The row's committed values. Seeded once from the parent's map; anything
  // that changes them from outside remounts the grid (see the file header).
  const [values, setValues] = useState<Map<string, number | null>>(() => {
    const m = new Map<string, number | null>()
    for (const item of items) {
      const v = scores.get(cellKey(item.id, student.id))
      if (v !== undefined) m.set(item.id, v)
    }
    return m
  })
  const [badCell, setBadCell] = useState<{ itemId: string; reason: string } | null>(null)

  const figures = useMemo(() => {
    const marked = new Map<string, number>()
    for (const [itemId, v] of values) if (v !== null) marked.set(itemId, v)
    const sums = sumsFromScores(items, marked)
    const comps = componentScores(sums, policy, view)
    return { comps, cs: classStanding(comps, policy), term: termGrade(sums, policy, view) }
  }, [values, items, policy, view])

  function commit(item: GradeItem, el: HTMLInputElement) {
    const parsed = parseScoreInput(el.value)
    const previous = values.get(item.id) ?? null

    if (!parsed.ok) {
      // Put the last good value back rather than keeping something that is not
      // a score — the cell is one input wide and cannot carry an error label.
      setBadCell({ itemId: item.id, reason: parsed.reason })
      el.value = formatScoreInput(previous)
      return
    }

    setBadCell(null)
    el.value = formatScoreInput(parsed.value)
    if (previous === parsed.value) return

    setValues((m) => {
      const next = new Map(m)
      if (parsed.value === null) next.delete(item.id)
      else next.set(item.id, parsed.value)
      return next
    })
    onCommit({ itemId: item.id, studentId: student.id, value: parsed.value }, previous)
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
      e.currentTarget.value = formatScoreInput(values.get(item.id) ?? null)
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

  return (
    <tr className="group">
      <th
        scope="row"
        className="sticky left-0 z-10 max-w-52 truncate border-b border-line bg-card px-3 py-1 text-left font-normal group-hover:bg-card-2"
      >
        {student.fullName}
      </th>

      {items.map((item) => {
        const key = cellKey(item.id, student.id)
        const value = values.get(item.id) ?? null
        const over = isOverMax(value, item.maxScore)
        const isBad = badCell?.itemId === item.id
        return (
          <td key={item.id} className="border-b border-line p-0">
            <input
              ref={(el) => registerInput(key, el)}
              // NOT type="number": its spinners hijack the mouse wheel over a
              // scrolling grid, and it cannot reliably tell "" from invalid
              // across browsers — which is exactly the blank-versus-zero
              // distinction this whole feature rests on.
              type="text"
              inputMode="decimal"
              // ⚠ LOAD-BEARING. An <input> has an intrinsic width of ~20
              // characters, and in an auto-layout table that is what sizes the
              // column — `w-full` does not constrain it, because the column is
              // sized from content first. Without this each item column came
              // out 228px and twenty of them made the table 5,343px: usable,
              // but only four columns visible at a time. At size 4 the column
              // is ~88px and you can read nine.
              size={4}
              defaultValue={formatScoreInput(value)}
              aria-label={`${item.name} for ${student.fullName}`}
              aria-invalid={isBad || undefined}
              title={isBad ? badCell.reason : over ? `Above the maximum of ${item.maxScore}` : undefined}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => commit(item, e.currentTarget)}
              onKeyDown={(e) => onKeyDown(e, item)}
              onPaste={(e) => onPaste(e, item)}
              className={cn(
                // text-base is not a style choice: below 16px iOS Safari zooms
                // the viewport on focus and never zooms back.
                'h-9 w-full bg-transparent px-2 text-center text-base tabular-nums outline-none',
                'focus:bg-accent-solid/10 focus:ring-2 focus:ring-[var(--color-ring)]',
                isBad && 'bg-danger-solid/10 text-danger',
                !isBad && over && 'bg-warn-solid/10 text-warn',
                !isBad && failed.has(key) && 'bg-danger-solid/10',
              )}
            />
          </td>
        )
      })}

      {GRADE_COMPONENTS.map((c) => (
        <td
          key={c}
          className="border-b border-line bg-card-2/50 px-2 py-1 text-center text-xs tabular-nums text-muted"
        >
          {displayGrade(figures.comps[c])}
        </td>
      ))}
      <td className="border-b border-line bg-card-2/50 px-2 py-1 text-center text-xs tabular-nums text-muted">
        {displayGrade(figures.cs)}
      </td>
      <td className="border-b border-line bg-card-2/50 px-2 py-1 text-center font-display font-bold tabular-nums">
        {displayGrade(figures.term)}
      </td>
    </tr>
  )
})
