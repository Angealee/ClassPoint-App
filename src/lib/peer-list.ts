import type { PeerEvaluationSummary } from '@/lib/types'

/*
 * What a student's peer-evaluation list says about each row and about the list as a whole.
 * Pure, so the plate on top and the rows beneath can never disagree about what "to do" means.
 */
export type PeerRowState = 'results' | 'submitted' | 'unplaced' | 'missed' | 'todo'

type RowFacts = Pick<PeerEvaluationSummary, 'status' | 'submittedAt' | 'peerCount' | 'resultsReleasedAt'>

/**
 * The order of the checks is the meaning. Released feedback beats everything (a student who never
 * submitted still has feedback to read); a submission beats a closed one; "not placed in a group"
 * beats "missed", because nobody can miss something they were never asked to do.
 */
export function rowState(i: RowFacts): PeerRowState {
  if (i.resultsReleasedAt !== null) return 'results'
  if (i.submittedAt !== null) return 'submitted'
  if (i.peerCount === 0) return 'unplaced'
  if (i.status === 'closed') return 'missed'
  return 'todo'
}

/** A row opens unless there is nothing behind it: not placed, or closed and never submitted. */
export const isOpenable = (s: PeerRowState): boolean => s !== 'unplaced' && s !== 'missed'

export interface PeerListSummary {
  todo: number
  submitted: number
  results: number
  missed: number
  /** The soonest deadline among what is still to do, or null when none of it has one. */
  nextClosesAt: string | null
}

export function listSummary(items: readonly PeerEvaluationSummary[]): PeerListSummary {
  const out: PeerListSummary = { todo: 0, submitted: 0, results: 0, missed: 0, nextClosesAt: null }
  for (const i of items) {
    const s = rowState(i)
    if (s === 'todo') {
      out.todo += 1
      if (i.closesAt && (out.nextClosesAt === null || i.closesAt < out.nextClosesAt)) {
        out.nextClosesAt = i.closesAt
      }
    } else if (s === 'submitted') out.submitted += 1
    else if (s === 'results') out.results += 1
    else if (s === 'missed') out.missed += 1
  }
  return out
}

const DAY_MS = 86_400_000
const localDay = (ms: number) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * A real date, never "N days left": a deadline at 9am tomorrow is hours away tonight and a day
 * away this morning, and the student needs the day, not a count that changes under them.
 */
export function deadlineLabel(iso: string, now: number = Date.now()): string {
  const at = new Date(iso).getTime()
  if (at <= now) return 'closed'
  const diff = Math.round((localDay(at) - localDay(now)) / DAY_MS)
  if (diff <= 0) return 'closes today'
  if (diff === 1) return 'closes tomorrow'
  return `closes ${new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
