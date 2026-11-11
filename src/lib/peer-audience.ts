import type { PeerEvalScope } from '@/lib/types'

export interface SectionGroupState {
  status: 'loading' | 'ready' | 'error'
  groups: { id: string }[]
}

export interface GroupTargets {
  /** True once something in a ticked section has been unticked. */
  narrowed: boolean
  groupIds: string[] | null
  /** Why the evaluation cannot be opened as ticked, or null. */
  error: string | null
}

export function resolveGroupTargets(input: {
  scope: PeerEvalScope
  sectionIds: string[]
  groupsBySection: Record<string, SectionGroupState | undefined>
  unpicked: ReadonlySet<string>
}): GroupTargets {
  const { scope, sectionIds, groupsBySection, unpicked } = input

  if (scope !== 'group') return { narrowed: false, groupIds: null, error: null }

  const available = sectionIds.flatMap((id) => {
    const st = groupsBySection[id]
    return st?.status === 'ready' ? st.groups : []
  })

  const narrowed = available.some((g) => unpicked.has(g.id))

  if (!narrowed) return { narrowed: false, groupIds: null, error: null }

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
