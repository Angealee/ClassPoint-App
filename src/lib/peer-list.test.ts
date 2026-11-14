import { describe, expect, it } from 'vitest'
import type { PeerEvaluationSummary } from '@/lib/types'
import { deadlineLabel, isOpenable, listSummary, rowState } from './peer-list'

function item(over: Partial<PeerEvaluationSummary> = {}): PeerEvaluationSummary {
  return {
    id: 'e1',
    title: 'Group project',
    instructions: null,
    subjectCode: 'IT 32',
    subjectName: 'Platform Technologies',
    scope: 'group',
    status: 'open',
    closesAt: null,
    resultsReleasedAt: null,
    peerCount: 3,
    submittedAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    ...over,
  } as PeerEvaluationSummary
}

describe('rowState', () => {
  it('is to-do while open, placed and unsubmitted', () => {
    expect(rowState(item())).toBe('todo')
  })

  it('released feedback beats everything, even for a student who never submitted', () => {
    expect(rowState(item({ resultsReleasedAt: '2026-11-10T00:00:00Z', status: 'closed' }))).toBe('results')
    expect(
      rowState(item({ resultsReleasedAt: '2026-11-10T00:00:00Z', submittedAt: '2026-11-05T00:00:00Z' })),
    ).toBe('results')
  })

  it('a submission beats a closed evaluation', () => {
    expect(rowState(item({ status: 'closed', submittedAt: '2026-11-05T00:00:00Z' }))).toBe('submitted')
  })

  it('not being placed in a group is never "missed"', () => {
    expect(rowState(item({ peerCount: 0, status: 'closed' }))).toBe('unplaced')
  })

  it('closed without a submission is missed', () => {
    expect(rowState(item({ status: 'closed' }))).toBe('missed')
  })
})

describe('isOpenable', () => {
  it('only unplaced and missed rows have nothing behind them', () => {
    expect(isOpenable('todo')).toBe(true)
    expect(isOpenable('submitted')).toBe(true)
    expect(isOpenable('results')).toBe(true)
    expect(isOpenable('unplaced')).toBe(false)
    expect(isOpenable('missed')).toBe(false)
  })
})

describe('listSummary', () => {
  it('counts each state once', () => {
    const s = listSummary([
      item({ id: 'a' }),
      item({ id: 'b' }),
      item({ id: 'c', submittedAt: '2026-11-05T00:00:00Z' }),
      item({ id: 'd', resultsReleasedAt: '2026-11-10T00:00:00Z', status: 'closed' }),
      item({ id: 'e', status: 'closed' }),
      item({ id: 'f', peerCount: 0 }),
    ])
    expect(s).toMatchObject({ todo: 2, submitted: 1, results: 1, missed: 1 })
  })

  it('names the soonest deadline among what is still to do, and ignores the rest', () => {
    const s = listSummary([
      item({ id: 'a', closesAt: '2026-11-20T10:00:00Z' }),
      item({ id: 'b', closesAt: '2026-11-18T10:00:00Z' }),
      // Already submitted: its deadline is not the student's problem.
      item({ id: 'c', closesAt: '2026-11-15T10:00:00Z', submittedAt: '2026-11-05T00:00:00Z' }),
      item({ id: 'd' }),
    ])
    expect(s.nextClosesAt).toBe('2026-11-18T10:00:00Z')
  })

  it('has no deadline when nothing to do carries one', () => {
    expect(listSummary([item()]).nextClosesAt).toBeNull()
    expect(listSummary([]).nextClosesAt).toBeNull()
  })
})

describe('deadlineLabel', () => {
  const now = new Date(2026, 10, 14, 15, 0).getTime() // Nov 14, 3pm local

  it('says closed once the deadline has passed', () => {
    expect(deadlineLabel(new Date(2026, 10, 14, 14, 0).toISOString(), now)).toBe('closed')
  })

  it('names the day by the calendar, not by hours left', () => {
    expect(deadlineLabel(new Date(2026, 10, 14, 23, 30).toISOString(), now)).toBe('closes today')
    // 9am tomorrow is 18 hours away and still "tomorrow".
    expect(deadlineLabel(new Date(2026, 10, 15, 9, 0).toISOString(), now)).toBe('closes tomorrow')
    expect(deadlineLabel(new Date(2026, 10, 19, 9, 0).toISOString(), now)).toBe('closes Nov 19')
  })
})
