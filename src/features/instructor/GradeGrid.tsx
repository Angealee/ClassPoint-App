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

/**
 * One committed cell. `absent: true` is the instructor typing A (0063); a clear is
 * `value: null, absent: false`. What a commit MEANS lives in `lib/grade-cell.ts`.
 */
export interface CellEdit extends CellWrite {
  itemId: string
  studentId: string
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
  /**
   * cellKey → why the cell reads Absent (0063): 'manual' typed, 'auto' from the
   * attendance of the class the column was held in. A snapshot, like `scores`.
   */
  absences: Map<string, AbsentSource>
  /**
   * studentId → classes attended / counted this term. RECITATION IS THIS (0063),
   * so it goes into every row's sums beside the typed marks.
   */
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

  /**
   * Every mark on screen, kept current as cells commit.
   *
   * Rows own their values while you type (that is the whole point of the
   * uncontrolled design), so nothing above them knows a mark has been entered
   * until it commits. The footer's averages and "which computed parts are worth
   * showing" both need that, so each commit is mirrored here.
   *
   * ⚠ This costs one grid-level render PER COMMIT (a blur or an Enter), never per
   *   keystroke — and it does not re-render the rows: they take `scores`, which
   *   is the ORIGINAL snapshot, and the stable `handleCommit` below. Anything
   *   that changes marks from outside still remounts the grid, re-seeding this.
   */
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

  /**
   * Which computed parts are worth a column.
   *
   * In SO FAR, a part with no mark from anyone reads "—" down the whole class —
   * three or four grey columns that say nothing, beside the two that matter. So
   * it is left out, and the band says how many are hidden. OFFICIAL shows all of
   * them, because there an unmarked part really does count (as a zero).
   *
   * Held as a STRING and split back, so the array's identity only changes when
   * the SET does — a new mark in a part that already had marks must not hand
   * every memoised row a fresh array and re-render all forty of them.
   */
  // Recitation has no typed columns any more (0063): it is worth showing once
  // anyone has a class counted, which is the attendance equivalent of "has a mark".
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
  // Class standing is derived from three of the parts: worth a column only if at
  // least one of them is on show (Official always shows it).
  const showCs = view === 'official' || visibleComps.some((c) => CS_COMPONENTS.includes(c))
  // Columns between the marks and Term grade.
  const middleCols = visibleComps.length + (showCs ? 1 : 0)

  /** The parts that carry weight — what a "partial" grade is missing. */
  const weighted = useMemo(() => weightedComponents(policy), [policy])

  /** Class average of the Term grade column, from the same functions the rows use. */
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
    // No bottom padding: the pinned footer sits at the scrollport's edge, and
    // 8px of padding under it was a strip where rows scrolled by. It was only
    // there so an OUTER focus ring would not be clipped, and the ring is inset now.
    <TableScroller fill>
      {/* FILLS THE WIDTH, edge to edge with the toolbar above it.
          Centring (the previous try) left a narrow island in a 1,900px window;
          the instructor asked for the grid to line up with the header instead.

          `w-full min-w-max`: at least as wide as its content (so a 20-column
          term still scrolls sideways) and otherwise the whole scroller. The
          spare width goes to the SCORE columns only — the gutter, the name and
          the computed columns have fixed widths, and in an auto-layout table
          the excess is handed to the columns that do not. */}
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
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
              className="sticky left-0 top-0 z-40 h-6 bg-card px-3 text-left"
            >
              {/* The gutter + the name column. Deliberately blank: a label
                  here would be a second screen title. */}
            </th>
            {/* CALM, on purpose. The band used to be a row of boxes — uppercase,
                tracked, bordered underneath and on the left — which shouted
                over the column names it exists to explain. Now it is quiet
                sentence-case text with NO bottom border, so it reads as the
                first line of one header block whose only rule is the hairline
                under the column names below. A faint left hairline stays so the
                groups are still groups. */}
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
            {/* Where typing ends and arithmetic begins — the same `border-l-2`
                the header below uses, so the seam is one line down the grid.
                Says what it left out, because a column that vanishes without
                a word looks like a bug. */}
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
            {/* Row numbers, like a spreadsheet's. Frozen with the name, because
                a gutter that scrolls away is worse than none. */}
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
                // ⚠ THE NAME MUST NOT SET THE COLUMN'S WIDTH, and that is a real
                // bug it prevents: an auto-layout column sizes to its widest
                // content, and that is the HEADER, not the input. A name like
                // "Sample Recitation" once pushed its column to ~180px, so a few
                // long names shoved the term grade off screen.
                //
                // The table now FILLS its container, so a hard `max-w` would
                // also stop the columns taking their share of the spare width.
                // Instead the name's box is `w-0 min-w-full`: it contributes
                // NOTHING to the column's intrinsic width (so the input and
                // `min-w-22` decide it), then stretches to whatever width the
                // column ends up with and truncates there. The full name stays
                // in the title.
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
                  // Where typing ends and arithmetic begins. Without it the two
                  // halves blend and a derived column invites a click.
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
            {/* Pinned to the right edge: the name says who a row is, this says
                what it comes to, and the marks scroll between them. It is the
                point of the screen and was the one column you could not see. */}
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

        {/* ── THE FOOTER: WHAT IS STILL MISSING ────────────────────────────────
            Per column, the class average and how many marks are in. "How many of
            the forty have I entered for Quiz 2" used to mean scrolling the whole
            roster and counting blanks. Pinned to the bottom of the scroller so
            it is on screen whatever the roster length.

            Average of the MARKED scores, raw — not a percentage, and not
            counting blanks as zeros: it answers "how did the class do on this",
            which an unmarked student has no part in yet. The right-hand cell is
            the class average of the Term grade itself, from the same functions
            the rows use. */}
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
  /** The whole snapshot; the row reads only its own cells, once, to seed itself. */
  absences: Map<string, AbsentSource>
  /** This student's attendance counts — Recitation. Stable identity per student. */
  attendance: GradeAttendance | undefined
  onCommit: (edit: CellEdit, previous: CellState) => void
  onPasteColumn: (itemId: string, startIndex: number, values: string[]) => void
  registerInput: (key: string, el: HTMLInputElement | null) => void
  moveFocus: (itemId: string, studentIndex: number, delta: number) => void
  indexById: Map<string, number>
  /** The column with focus, for the crosshair. Null when nothing has it. */
  focusedItemId: string | null
  onFocusColumn: (itemId: string) => void
  /** The computed parts on show. Identity changes only when the SET does. */
  visibleComps: GradeComponent[]
  showCs: boolean
  /** The parts that carry weight, for flagging a partial term grade. */
  weighted: GradeComponent[]
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
  // Why each of this row's cells reads Absent (0063), seeded once like `values`.
  const [absent, setAbsent] = useState<Map<string, AbsentSource>>(() => {
    const m = new Map<string, AbsentSource>()
    for (const item of items) {
      const a = absences.get(cellKey(item.id, student.id))
      if (a) m.set(item.id, a)
    }
    return m
  })
  const [badCell, setBadCell] = useState<{ itemId: string; reason: string } | null>(null)

  /** One cell's state, in the shape `lib/grade-cell.ts` reasons about. */
  const stateOf = (itemId: string): CellState => ({
    value: values.get(itemId) ?? null,
    absent: absent.get(itemId) ?? null,
  })

  const figures = useMemo(() => {
    const marked = new Map<string, number>()
    for (const [itemId, v] of values) if (v !== null) marked.set(itemId, v)
    // Absent is arithmetically a blank, so it needs no handling here; Recitation
    // comes from this student's attendance counts.
    const sums = sumsFromScores(items, marked, attendance)
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
    const term = termGrade(sums, policy, view)
    // PARTIAL: a So-far grade that is missing at least one part that counts. It
    // is a real number — the instructor's own So-far figure — but two quizzes
    // alone read 63.84, and a bold 63.84 in the Term grade column looks like a
    // grade somebody earned. Dimmed and marked, it reads as "so far".
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
      // Put the last good value back rather than keeping something that is not
      // a score — the cell is one input wide and cannot carry an error label.
      setBadCell({ itemId: item.id, reason: parsed.reason })
      el.value = cellDisplay(current)
      return
    }

    setBadCell(null)
    // What the commit MEANS (a mark, A, or a clear) is `resolveCommit`'s call —
    // the phone's entry screen asks the same function.
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
    //
    // ⚠ An INSET BOX-SHADOW, not a background. The tint used to be
    //   `bg-accent-solid/5` on every child, which REPLACED the frozen name and
    //   Term-grade cells' opaque background with a translucent one — so while a
    //   cell in the row was focused and the grid was scrolled sideways, the
    //   marks scrolling underneath showed straight through the name column. A
    //   shadow paints over the existing background instead of swapping it.
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
        // A: no mark and absent. A derived absence WITH a mark typed over it shows
        // the mark and a small tag instead, so the instructor can see why a points
        // assist is blocked on a cell that has a score.
        const isA = value === null && absentSource !== null
        const over = isOverMax(value, item.maxScore)
        const isBad = badCell?.itemId === item.id
        const boost = boosts.get(key)
        // The receipt remembers what the boost WROTE. A cell that no longer
        // holds it has been retyped since, and saying "boosted +3" over a mark
        // that no longer includes the boost would be a small lie in the one
        // place the instructor looks to find out.
        const boostNote = boost
          ? value === boost.scoreAfter
            ? `Points assist +${formatMarks(boost.marksGranted)} for ${boost.pointsSpent} points (was ${formatMarks(boost.scoreBefore)}). Reverse it from Requests.`
            : `A points assist of +${formatMarks(boost.marksGranted)} was applied, but this mark has been edited since. Reverse it from Requests.`
          : undefined
        return (
          <td
            key={item.id}
            className={cn(
              // FLAT, spreadsheet-style: the same opaque surface as the frozen
              // name beside it (so the row reads as one band, not a lighter
              // label next to a black hole), a hairline on the bottom and the
              // right, and nothing heavier. `relative` anchors the boost dot.
              'relative border-b border-r border-line border-r-line/40 p-0',
              zebra ? 'bg-card-2' : 'bg-card',
              // The column half of the crosshair — the same inset shadow as the
              // row half, so it tints without replacing the background.
              focusedItemId === item.id &&
                'shadow-[inset_0_0_0_999px_color-mix(in_oklab,var(--color-accent-solid)_7%,transparent)]',
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
                // `ring-inset`: an outer ring spills into the neighbouring cells
                // and is clipped by the frozen columns; inside the cell it is
                // crisp and the only emphasis the focused cell needs.
                'focus:bg-accent-solid/10 focus:ring-2 focus:ring-inset focus:ring-[var(--color-ring)]',
                isBad && 'bg-danger-solid/10 text-danger',
                !isBad && over && 'bg-warn-solid/10 text-warn',
                !isBad && isA && 'font-semibold text-warn',
                !isBad && failed.has(key) && 'bg-danger-solid/10',
              )}
            />
            {!isA && absentSource === 'auto' && (
              // A mark typed over a derived absence: the mark stays, the tag says
              // why points are still blocked. Same discipline as the dot below —
              // decoration over the cell, never in the way of a click.
              <span
                aria-hidden
                className="pointer-events-none absolute left-1 top-0.5 text-2xs font-semibold leading-none text-warn"
              >
                A
              </span>
            )}
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

      {visibleComps.map((c, i) => (
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
