// PROBE-TEMP — delete after measuring. /__probe/open | paused | locked | muted
import { useParams } from 'react-router-dom'
import { StudentDataContext } from '@/features/student/StudentData'
import type { StudentDataValue } from '@/features/student/StudentData'
import { StudentSpace } from '@/features/space/StudentSpace'
import type { SpaceAccess } from '@/lib/space-gate'

const ACCESS: Record<string, SpaceAccess> = {
  open: { state: 'open', canPost: true, timeoutUntil: null, timeoutReason: null },
  paused: { state: 'paused', canPost: false, timeoutUntil: null, timeoutReason: null },
  locked: { state: 'locked', canPost: false, timeoutUntil: null, timeoutReason: null },
  muted: {
    state: 'open',
    canPost: false,
    timeoutUntil: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    timeoutReason: 'spamming the lounge',
  },
}

export function ProbeSpace() {
  const { state = 'open' } = useParams()
  const value = {
    me: { display_name: 'CEO', semester_points: 1284, avatar_url: null },
    spaceAccess: ACCESS[state] ?? ACCESS.open,
  } as unknown as StudentDataValue

  return (
    <StudentDataContext.Provider value={value}>
      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        <StudentSpace />
      </div>
    </StudentDataContext.Provider>
  )
}
