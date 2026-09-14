import type { PeerEvalScope } from '@/lib/types'

/**
 * Which groups an evaluation is aimed at, decided from the composer's ticks.
 *
 * ⚠ THIS DECIDES WHO GETS AN EVALUATION, AND A MISTAKE IS SILENT.
 * Send a list when none was meant and a group created later is quietly left
 * out; send nothing when a narrowing was meant and the whole section is pushed
 * a notification for an evaluation aimed at one team. Neither errors. That is
 * why this is a pure function with a test beside it rather than a memo inside
 * the composer.
 *
 * The server's rule (0052) is "no rows means all groups". This mirrors it from
 * the client side:
 *   • Nothing unticked in a ticked section → send NO list (null). Identical to
 *     the pre-0052 behaviour, and still true of a group created after opening.
 *   • Anything unticked → send the exact remaining list.
 * An EMPTY list is never sent: the server would read it as all groups.
 */

export interface SectionGroupState {
  status: 'loading' | 'ready' | 'error'
  groups: { id: string }[]
}

export interface GroupTargets {
  /** True once something in a ticked section has been unticked. */
  narrowed: boolean
  /** What to send as `p_groups`: null for all groups, else a non-empty list. */
  groupIds: string[] | null
  /** Why the evaluation cannot be opened as ticked, or null. */
  error: string | null
}

export function resolveGroupTargets(input: {
  scope: PeerEvalScope
  /** The sections that are ticked AND eligible for the chosen subject. */
  sectionIds: string[]
  groupsBySection: Record<string, SectionGroupState | undefined>
  /** Groups the instructor unticked. May hold ids from sections no longer ticked. */
  unpicked: ReadonlySet<string>
}): GroupTargets {
  const { scope, sectionIds, groupsBySection, unpicked } = input

  // Groups are meaningless to a section-wide evaluation, whatever is ticked.
  if (scope !== 'group') return { narrowed: false, groupIds: null, error: null }

  const available = sectionIds.flatMap((id) => {
    const st = groupsBySection[id]
    return st?.status === 'ready' ? st.groups : []
  })

  // Only an untick INSIDE a ticked section counts. An id left over from a
  // section that was unticked since must not narrow anything.
  const narrowed = available.some((g) => unpicked.has(g.id))

  // Not narrowed: all groups. A slow or failed group fetch must never block
  // this, because it needs no list.
  if (!narrowed) return { narrowed: false, groupIds: null, error: null }

  // Narrowed, but a ticked section's groups are unknown. Sending the list now
  // would silently exclude that whole section, so refuse instead.
  const pending = sectionIds.some((id) => groupsBySection[id]?.status !== 'ready')
  const chosen = available.filter((g) => !unpicked.has(g.id)).map((g) => g.id)

  if (pending) {
    return {
      narrowed: true,
      groupIds: chosen,
      error: 'Groups are still loading for a section you picked. Retry it, or tick every group again.',
    }
  }
  if (chosen.length === 0) {
    return { narrowed: true, groupIds: null, error: 'Pick at least one group.' }
  }
  return { narrowed: true, groupIds: chosen, error: null }
}
