import { formatScoreInput } from './grade-entry'

/**
 * What typing into ONE grade cell means, once the Absent mark exists (0063).
 *
 * A cell is in exactly one of three states, and which one decides what the
 * grade, the "so far" figure and a student's points-assist all do:
 *
 *   a MARK      a number, possibly 0 — a real score
 *   ABSENT      shown as A. Arithmetically a BLANK (out of "so far", a zero in the
 *               official grade), but it blocks a points assist. Two sources:
 *                 'manual'  the instructor typed A
 *                 'auto'    derived from attendance — the column is tied to a
 *                           class and the student is recorded absent or excused
 *   BLANK       not marked yet
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 * The desktop grid and the phone's one-column entry both commit cells, and the
 * rules are fiddly enough that two private copies would drift: in particular,
 * "an A you did not type must not be saved just because you tabbed over it", and
 * "you cannot clear a derived A by erasing it". Both screens ask this one
 * function; the server's triggers are the backstop, not the rule.
 *
 * Pure and tested because every failure here is silent — a wrong write looks like
 * an ordinary cell.
 */

export type AbsentSource = 'manual' | 'auto'

export interface CellState {
  /** The stored mark, or null when there is none. */
  value: number | null
  /** Why the cell reads Absent, or null when it does not. */
  absent: AbsentSource | null
}

/** What gets queued for saving. `absent: true` means "mark Absent"; a clear is value null + absent false. */
export interface CellWrite {
  value: number | null
  absent: boolean
}

export type CellOutcome =
  /** Nothing to save. `display` is what the input should show afterwards. */
  | { kind: 'none'; display: string }
  | { kind: 'change'; next: CellState; write: CellWrite; display: string }

/** What a cell shows: its mark, or A when it is absent with no mark, or nothing. */
export function cellDisplay(state: CellState): string {
  if (state.value !== null) return formatScoreInput(state.value)
  return state.absent !== null ? 'A' : ''
}

/**
 * Decide what a committed cell means.
 *
 * `parsed` is `parseScoreInput`'s success value: a number, null for blank, or
 * `absent: true` for the letter A.
 */
export function resolveCommit(
  parsed: { value: number | null; absent?: boolean },
  current: CellState,
): CellOutcome {
  // ── Typed A ───────────────────────────────────────────────────────────────
  if (parsed.absent) {
    // Already reads A (typed, or derived from attendance): tabbing over it must
    // not write a manual mark nobody asked for.
    if (current.value === null && current.absent !== null) {
      return { kind: 'none', display: 'A' }
    }
    const next: CellState = { value: null, absent: 'manual' }
    return { kind: 'change', next, write: { value: null, absent: true }, display: 'A' }
  }

  // ── Typed a number ────────────────────────────────────────────────────────
  if (parsed.value !== null) {
    if (current.value === parsed.value) {
      return { kind: 'none', display: formatScoreInput(parsed.value) }
    }
    // A typed mark replaces a TYPED A (the server drops the row), but a derived A
    // is about the class, not the cell — it stays, and still blocks an assist.
    const next: CellState = {
      value: parsed.value,
      absent: current.absent === 'auto' ? 'auto' : null,
    }
    return {
      kind: 'change',
      next,
      write: { value: parsed.value, absent: false },
      display: formatScoreInput(parsed.value),
    }
  }

  // ── Cleared ───────────────────────────────────────────────────────────────
  if (current.value === null && current.absent === null) {
    return { kind: 'none', display: '' }
  }
  if (current.value === null && current.absent === 'auto') {
    // Nothing of the instructor's to clear: the A comes from attendance. Put it
    // back rather than letting the cell look blank while still blocking an assist.
    return { kind: 'none', display: 'A' }
  }
  const next: CellState = { value: null, absent: current.absent === 'auto' ? 'auto' : null }
  return {
    kind: 'change',
    next,
    write: { value: null, absent: false },
    display: cellDisplay(next),
  }
}

/** Put a state back the way an undo should: a typed A is restored as a typed A. */
export function writeFor(state: CellState): CellWrite {
  return { value: state.value, absent: state.value === null && state.absent === 'manual' }
}
