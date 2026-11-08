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
} from '@/lib/grading'
import {
  formatScoreInput,
  isColumnPaste,
  isOverMax,
  parsePastedColumn,
  parseScoreInput,
} from '@/lib/grade-entry'
import { formatMarks } from '@/lib/grade-boost'
import { TONE } from '@/lib/tone'
import type {
  GradeBoost,
  GradeComponent,
  GradeItem,
  GradePolicy,
  GradeView,
  RosterPerson,
} from '@/lib/types'

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
  /**
   * cellKey → the receipt, for every mark a student's points changed (0062).
   * Drawn as a dot in the cell's corner. It is decoration over the cell — the
   * mark itself is the ordinary score, so nothing about typing changes — and an
   * empty map (the usual case, and the case before the migration) draws nothing.
   */
  boosts: Map<string, GradeBoost>
  onCommit: (edit: CellEdit, previous: number | null) => void
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
  onCommit,
  onPasteColumn,
  onAddColumn,
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

  /**
   * The component band's cells: one per component that HAS columns, spanning
   * them.
   *
   * Built from `items` rather than from GRADE_COMPONENTS so a component with
   * no columns yet contributes no cell — an empty "Recitation" band over zero
   * columns would be a header for nothing. `items` arrives already ordered by
   * component then position (`orderedItems`), which is what makes a contiguous
   * span correct; if that ordering ever changes, this has to become a group-by
   * rather than a run-length pass.
   */
  const bands = useMemo(() => {
    const out: Array<{ component: GradeComponent; span: number }> = []
    for (const item of items) {
      const last = out[out.length - 1]
      if (last && last.component === item.component) last.span += 1
      else out.push({ component: item.component, span: 1 })
    }
    return out
  }, [items])

  /**
   * Which COLUMN has focus, for the crosshair.
   *
   * ⚠ The hot path is free, and that is why this is affordable. Walking a
   *   column with Enter fires `onFocus` 40 times with the SAME item id, and
   *   React bails out of a `setState` to an identical value — so typing down a
   *   column causes ZERO extra renders. Only moving ACROSS columns (Tab)
   *   re-renders the rows, once.
   *
   *   The row half needs no state at all: `:focus-within` on the `<tr>` does
   *   it in CSS.
   */
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)

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
    // ⚠ THE SCROLLER OWNS BOTH AXES, AND THAT IS WHAT MAKES THE HEADERS STICK.
    //
    // A horizontal scroller is not optional even on a wide route: a name column
    // plus ~20 items plus five derived columns measures ~2,500px against the
    // 1,152px `wide` gives us. But a sticky element only sticks inside its own
    // scroll container — with the height unbounded the page scrolled instead,
    // and the column headers slid away after about twelve rows (measured at
    // -503px), so you could no longer tell which quiz you were typing into.
    //
    // `flex-1 min-h-0` NOW WORKS, and it did not before. The first attempt
    // failed because every height in the Shell chain was a `min-h`, so the
    // column grew to its content and this never got a ceiling (measured
    // 1,539px tall and not scrolling); the fix then was a `max-h-[75dvh]` cap.
    // `width="full"` pins the viewport height on desktop and passes `min-h-0`
    // all the way down, so the grid can finally take exactly the room that is
    // left instead of a guessed fraction of the window.
    //
    // `max-h-[75dvh]` survives as the MOBILE fallback, where the page still
    // scrolls normally, and `min-h-64` means a broken chain can only ever make
    // this short — never zero-height, which would look like a failed render.
    <TableScroller fill className="pb-2">
      <table className="w-max border-separate border-spacing-0 text-sm">
        <thead>
          {/* ── THE COMPONENT BAND ───────────────────────────────────────────
              Which component a column belongs to used to live only in the
              cell's `title` attribute — invisible on a touch screen and
              invisible while typing. It is the first thing you need: a quiz
              and a performance task weigh differently, and a column named
              "Activity 3" does not say which it is.

              This mirrors the instructor's own spreadsheet, which carries
              merged group headers over the same columns.

              ⚠ TWO STICKY ROWS NEED TWO OFFSETS. The band is `top-0` and the
                header below it is `top-6` — 24px, which is exactly `h-6` on
                the band's cells. Both numbers reference the same step on
                purpose: a measured magic number here drifts the moment the
                band's padding changes, and the symptom is a header row that
                overlaps the band by a few pixels while scrolling. */}
          <tr>
            <th
              scope="col"
              colSpan={2}
              className="sticky left-0 top-0 z-40 h-6 border-b border-line bg-card px-3 text-left text-2xs font-semibold uppercase tracking-wider text-muted"
            >
              {/* The gutter + the name column. Deliberately blank: a label
                  here would be a second screen title. */}
            </th>
            {bands.map((band) => (
              <th
                key={band.component}
                scope="colgroup"
                colSpan={band.span}
                className="sticky top-0 z-30 h-6 border-b border-l border-line bg-card px-2 text-center text-2xs font-semibold uppercase tracking-wider text-muted"
                title={COMPONENT_LABEL[band.component]}
              >
                <span className="block truncate">{COMPONENT_LABEL[band.component]}</span>
              </th>
            ))}
            {/* Where typing ends and arithmetic begins — the same `border-l-2`
                the header below uses, so the seam is one line down the grid. */}
            <th
              scope="colgroup"
              colSpan={GRADE_COMPONENTS.length + 2}
              className="sticky top-0 z-30 h-6 border-b border-l-2 border-line border-l-line bg-card-2 px-2 text-center text-2xs font-semibold uppercase tracking-wider text-muted"
            >
              Computed
            </th>
          </tr>

          <tr>
            {/* Row numbers, like a spreadsheet's. Frozen with the name, because
                a gutter that scrolls away is worse than none. */}
            <th
              scope="col"
              className="sticky left-0 top-6 z-30 w-8 min-w-8 border-b border-line bg-card px-0 py-2 text-center text-2xs font-semibold text-muted"
            >
              #
            </th>
            <th
              scope="col"
              className="sticky left-8 top-6 z-30 border-b border-line bg-card px-3 py-2 text-left font-semibold"
            >
              Student
            </th>
            {items.map((item) => (
              <th
                key={item.id}
                scope="col"
                // ⚠ `max-w` IS LOAD-BEARING, and its absence was a real bug: an
                // auto-layout column sizes to its widest content, and that is
                // the HEADER, not the input. `size={4}` caps the cell at ~88px
                // while a name like "Sample Recitation" pushed its column to
                // ~180px, so a few long names shoved the term grade off screen.
                // The cap plus `truncate` keeps every column the same width,
                // and the full name stays in the title.
                className="sticky top-6 z-20 w-22 min-w-22 max-w-22 border-b border-line bg-card px-2 py-1.5 text-center font-semibold"
                title={`${item.name} · ${COMPONENT_LABEL[item.component]} · out of ${item.maxScore}`}
              >
                <span className="block truncate">{item.name}</span>
                <span className="block text-2xs font-normal text-muted">/{item.maxScore}</span>
              </th>
            ))}
            {GRADE_COMPONENTS.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  'sticky top-6 z-20 min-w-20 border-b border-line bg-card-2 px-2 py-1.5 text-center text-2xs font-semibold text-muted',
                  // Where typing ends and arithmetic begins. Without it the two
                  // halves blend and a derived column invites a click.
                  i === 0 && 'border-l-2 border-l-line',
                )}
              >
                {COMPONENT_LABEL[c]}
              </th>
            ))}
            <th
              scope="col"
              className="sticky top-6 z-20 min-w-20 border-b border-line bg-card-2 px-2 py-1.5 text-center text-2xs font-semibold text-muted"
            >
              Class standing
            </th>
            {/* Pinned to the right edge: the name says who a row is, this says
                what it comes to, and the marks scroll between them. It is the
                point of the screen and was the one column you could not see. */}
            <th
              scope="col"
              className="sticky right-0 top-6 z-30 min-w-20 border-b border-l-2 border-line border-l-line bg-card-2 px-2 py-1.5 text-center font-semibold"
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
              onCommit={onCommit}
              onPasteColumn={onPasteColumn}
              registerInput={registerInput}
              moveFocus={moveFocus}
              indexById={indexById}
              focusedItemId={focusedItemId}
              onFocusColumn={setFocusedItemId}
            />
          ))}
        </tbody>
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
  onCommit: (edit: CellEdit, previous: number | null) => void
  onPasteColumn: (itemId: string, startIndex: number, values: string[]) => void
  registerInput: (key: string, el: HTMLInputElement | null) => void
  moveFocus: (itemId: string, studentIndex: number, delta: number) => void
  indexById: Map<string, number>
  /** The column with focus, for the crosshair. Null when nothing has it. */
  focusedItemId: string | null
  onFocusColumn: (itemId: string) => void
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
  boosts,
  onCommit,
  onPasteColumn,
  registerInput,
  moveFocus,
  focusedItemId,
  onFocusColumn,
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
    // Which components have nothing marked for this student — the "So far"
    // view renders a dash there instead of the floor.
    const unmarked = {} as Record<GradeComponent, boolean>
    for (const c of GRADE_COMPONENTS) {
      unmarked[c] = view === 'soFar' && sums[c].sumMaxMarked <= 0
    }
    // Class standing follows its own components: with nothing marked in any of
    // the three it would otherwise read 60.00 beside three dashes, which is the
    // same floor the dashes exist to stop showing.
    const csUnmarked = CS_COMPONENTS.every((c) => unmarked[c])
    return {
      comps,
      unmarked,
      csUnmarked,
      cs: classStanding(comps, policy),
      term: termGrade(sums, policy, view),
    }
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

  // Zebra, applied PER CELL rather than on the <tr>.
  //
  // ⚠ A stripe on the row is invisible in the frozen columns: the name and the
  //   term grade set their own opaque background (they have to, or the marks
  //   scroll underneath them), and that background paints over the row's. So
  //   the stripe would appear only between the frozen edges and read as a
  //   rendering fault rather than as banding.
  const zebra = rowIndex % 2 === 1

  return (
    // `focus-within` is the row half of the crosshair, and it costs nothing:
    // no state, no re-render, pure CSS.
    <tr className="group focus-within:[&>*]:bg-accent-solid/5">
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
          'sticky left-8 z-10 max-w-52 truncate border-b border-line px-3 py-0 text-left font-normal',
          zebra ? 'bg-card-2' : 'bg-card',
          'group-hover:bg-card-2',
        )}
      >
        {student.fullName}
      </th>

      {items.map((item) => {
        const key = cellKey(item.id, student.id)
        const value = values.get(item.id) ?? null
        const over = isOverMax(value, item.maxScore)
        const isBad = badCell?.itemId === item.id
        const boost = boosts.get(key)
        // The receipt remembers what the boost WROTE. A cell that no longer
        // holds it has been retyped since, and saying "boosted +3" over a mark
        // that no longer includes the boost would be a small lie in the one
        // place the instructor looks to find out.
        const boostNote = boost
          ? value === boost.scoreAfter
            ? `Boosted +${formatMarks(boost.marksGranted)} for ${boost.pointsSpent} points (was ${formatMarks(boost.scoreBefore)}). Reverse it from Requests.`
            : `A boost of +${formatMarks(boost.marksGranted)} was applied, but this mark has been edited since. Reverse it from Requests.`
          : undefined
        return (
          <td
            key={item.id}
            className={cn(
              // `relative` anchors the boost dot; the cell is otherwise a plain
              // pass-through for the input.
              'relative border-b border-line p-0',
              zebra && 'bg-card-2/40',
              // The column half of the crosshair. A tint on the CELL rather
              // than the input, so it reads as a column rather than as a row
              // of highlighted boxes.
              focusedItemId === item.id && 'bg-accent-solid/5',
            )}
          >
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
              aria-label={`${item.name} for ${student.fullName}${boost ? ', boosted with points' : ''}`}
              aria-invalid={isBad || undefined}
              title={
                isBad
                  ? badCell.reason
                  : over
                    ? `Above the maximum of ${item.maxScore}`
                    : boostNote
              }
              onFocus={(e) => {
                e.currentTarget.select()
                // Same id while walking DOWN a column, so React bails out of
                // the setState and the hot path renders nothing extra.
                onFocusColumn(item.id)
              }}
              onBlur={(e) => commit(item, e.currentTarget)}
              onKeyDown={(e) => onKeyDown(e, item)}
              onPaste={(e) => onPaste(e, item)}
              className={cn(
                // text-base is not a style choice: below 16px iOS Safari zooms
                // the viewport on focus and never zooms back.
                'h-8 w-full bg-transparent px-2 text-center text-base tabular-nums outline-none',
                'focus:bg-accent-solid/10 focus:ring-2 focus:ring-[var(--color-ring)]',
                isBad && 'bg-danger-solid/10 text-danger',
                !isBad && over && 'bg-warn-solid/10 text-warn',
                !isBad && failed.has(key) && 'bg-danger-solid/10',
              )}
            />
            {boost && (
              // A dot, not a chip: the cell is 88px with the input filling it,
              // and anything with width would sit on top of the mark. It is
              // pointer-events-none so it can never intercept a click meant for
              // the cell, and it hollows out when the mark has been retyped.
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

      {GRADE_COMPONENTS.map((c, i) => (
        <td
          key={c}
          className={cn(
            'border-b border-line px-2 py-0 text-center text-xs tabular-nums text-muted',
            zebra ? 'bg-card-2/80' : 'bg-card-2/50',
            i === 0 && 'border-l-2 border-l-line',
          )}
        >
          {/* "So far" asks how a student is doing on what has been MARKED, and
              for a component with nothing marked the honest answer is nothing
              yet — not the 60.00 floor, which filled the screen with identical
              numbers. Official still shows it, because there it really does
              count. Display only: no arithmetic moves. */}
          {figures.unmarked[c] ? <span className="text-muted/50">—</span> : displayGrade(figures.comps[c])}
        </td>
      ))}
      <td
        className={cn(
          'border-b border-line px-2 py-0 text-center text-xs tabular-nums text-muted',
          zebra ? 'bg-card-2/80' : 'bg-card-2/50',
        )}
      >
        {figures.csUnmarked ? <span className="text-muted/50">—</span> : displayGrade(figures.cs)}
      </td>
      <td
        className={cn(
          'sticky right-0 z-10 border-b border-l-2 border-line border-l-line px-2 py-0 text-center font-display font-bold tabular-nums group-hover:bg-card',
          zebra ? 'bg-card' : 'bg-card-2',
        )}
      >
        {displayGrade(figures.term)}
      </td>
    </tr>
  )
})
