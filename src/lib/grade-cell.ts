import { formatScoreInput } from './grade-entry'

export type AbsentSource = 'manual' | 'auto'

export interface CellState {
  /** The stored mark, or null when there is none. */
  value: number | null
  /** Why the cell reads Absent, or null when it does not. */
  absent: AbsentSource | null
}

export interface CellWrite {
  value: number | null
  absent: boolean
}

export type CellOutcome =
  | { kind: 'none'; display: string }
  | { kind: 'change'; next: CellState; write: CellWrite; display: string }

export function cellDisplay(state: CellState): string {
  if (state.value !== null) return formatScoreInput(state.value)
  return state.absent !== null ? 'A' : ''
}

export function resolveCommit(
  parsed: { value: number | null; absent?: boolean },
  current: CellState,
): CellOutcome {
  if (parsed.absent) {
    if (current.value === null && current.absent !== null) {
      return { kind: 'none', display: 'A' }
    }
    const next: CellState = { value: null, absent: 'manual' }
    return { kind: 'change', next, write: { value: null, absent: true }, display: 'A' }
  }

  if (parsed.value !== null) {
    if (current.value === parsed.value) {
      return { kind: 'none', display: formatScoreInput(parsed.value) }
    }
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

  if (current.value === null && current.absent === null) {
    return { kind: 'none', display: '' }
  }
  if (current.value === null && current.absent === 'auto') {
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

export function writeFor(state: CellState): CellWrite {
  return { value: state.value, absent: state.value === null && state.absent === 'manual' }
}
