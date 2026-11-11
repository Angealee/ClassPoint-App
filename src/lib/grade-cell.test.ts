import { describe, expect, it } from 'vitest'
import { cellDisplay, resolveCommit, writeFor, type CellState } from './grade-cell'

/**
 * The Absent mark (0063), cell by cell.
 *
 * Every case below is a way a cell can be saved wrongly without anything looking
 * broken, which is why this is pure and pinned.
 */

const blank: CellState = { value: null, absent: null }
const marked = (v: number): CellState => ({ value: v, absent: null })
const typedA: CellState = { value: null, absent: 'manual' }
const derivedA: CellState = { value: null, absent: 'auto' }

describe('cellDisplay', () => {
  it('shows a mark, A, or nothing', () => {
    expect(cellDisplay(marked(12.5))).toBe('12.5')
    expect(cellDisplay(marked(0))).toBe('0') // a real zero is not blank
    expect(cellDisplay(typedA)).toBe('A')
    expect(cellDisplay(derivedA)).toBe('A')
    expect(cellDisplay(blank)).toBe('')
  })

  it('shows the mark, not A, when a derived absence has a mark typed over it', () => {
    expect(cellDisplay({ value: 7, absent: 'auto' })).toBe('7')
  })
})

describe('resolveCommit — typing A', () => {
  it('marks a blank cell absent', () => {
    const out = resolveCommit({ value: null, absent: true }, blank)
    expect(out).toMatchObject({
      kind: 'change',
      write: { value: null, absent: true },
      next: { value: null, absent: 'manual' },
      display: 'A',
    })
  })

  it('replaces a mark: the mark is removed, because a cell is one or the other', () => {
    const out = resolveCommit({ value: null, absent: true }, marked(12))
    expect(out).toMatchObject({ kind: 'change', next: { value: null, absent: 'manual' } })
  })

  it('does NOT write when the cell already reads A — tabbing over it saves nothing', () => {
    expect(resolveCommit({ value: null, absent: true }, typedA).kind).toBe('none')
    // The derived case is the one that matters: it must not become a manual row.
    const out = resolveCommit({ value: null, absent: true }, derivedA)
    expect(out).toEqual({ kind: 'none', display: 'A' })
  })
})

describe('resolveCommit — typing a mark', () => {
  it('saves a mark on a blank cell', () => {
    const out = resolveCommit({ value: 15, absent: false }, blank)
    expect(out).toMatchObject({
      kind: 'change',
      write: { value: 15, absent: false },
      next: { value: 15, absent: null },
    })
  })

  it('treats 0 as a real mark, not a clear', () => {
    const out = resolveCommit({ value: 0, absent: false }, blank)
    expect(out).toMatchObject({ kind: 'change', write: { value: 0, absent: false } })
  })

  it('replaces a typed A with the mark', () => {
    const out = resolveCommit({ value: 9, absent: false }, typedA)
    expect(out).toMatchObject({ kind: 'change', next: { value: 9, absent: null } })
  })

  it('keeps a DERIVED absence when a mark is typed over it', () => {
    // The column is tied to a class they missed. The mark is the instructor's
    // call (a make-up, say) but the absence is a fact about the class — it still
    // blocks a points assist, so it must survive.
    const out = resolveCommit({ value: 9, absent: false }, derivedA)
    expect(out).toMatchObject({ kind: 'change', next: { value: 9, absent: 'auto' } })
  })

  it('does not write when the mark is unchanged', () => {
    expect(resolveCommit({ value: 15, absent: false }, marked(15)).kind).toBe('none')
  })
})

describe('resolveCommit — clearing', () => {
  it('clears a mark', () => {
    const out = resolveCommit({ value: null }, marked(12))
    expect(out).toMatchObject({
      kind: 'change',
      write: { value: null, absent: false },
      next: { value: null, absent: null },
      display: '',
    })
  })

  it('clears a typed A', () => {
    const out = resolveCommit({ value: null }, typedA)
    expect(out).toMatchObject({ kind: 'change', next: { value: null, absent: null }, display: '' })
  })

  it('cannot clear a DERIVED A — it puts the A back', () => {
    // Erasing it would make the cell look blank while attendance still says
    // absent, and the student would be refused an assist for no visible reason.
    expect(resolveCommit({ value: null }, derivedA)).toEqual({ kind: 'none', display: 'A' })
  })

  it('clearing a mark under a derived A leaves the A showing', () => {
    const out = resolveCommit({ value: null }, { value: 7, absent: 'auto' })
    expect(out).toMatchObject({
      kind: 'change',
      write: { value: null, absent: false },
      next: { value: null, absent: 'auto' },
      display: 'A',
    })
  })

  it('does nothing to a cell that is already blank', () => {
    expect(resolveCommit({ value: null }, blank)).toEqual({ kind: 'none', display: '' })
  })
})

describe('writeFor (undo)', () => {
  it('restores a typed A as a typed A, a mark as a mark, and the rest as a clear', () => {
    expect(writeFor(typedA)).toEqual({ value: null, absent: true })
    expect(writeFor(marked(4))).toEqual({ value: 4, absent: false })
    expect(writeFor(blank)).toEqual({ value: null, absent: false })
    // A derived A has no row of its own to restore.
    expect(writeFor(derivedA)).toEqual({ value: null, absent: false })
  })
})
