import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { PersonRow } from '@/components/ui/PersonRow'
import { Rows } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import {
  StudentProfilePreview,
  type PreviewTarget,
} from '@/features/student/StudentProfilePreview'
import { useStudentData } from '@/features/student/StudentData'
import { getPostWs, listSpacePeople } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import type { PostW, SpacePerson } from '@/lib/types'

/**
 * Who gave a W on a post. Visible to everyone in Student Space (instructor's
 * call) — a reaction list, not a secret ballot.
 *
 * Owns its own profile preview: Sheet is portalled and focus-trapped, so opening
 * a profile from INSIDE this sheet would stack two competing traps. Instead a tap
 * closes the list and opens the profile in its place.
 */
export function PostWsSheet({
  postId,
  onClose,
}: {
  /** The post to list, or null when closed. */
  postId: string | null
  onClose: () => void
}) {
  const { sectionName, me } = useStudentData()
  // Results are stamped with the post they belong to, so opening another post shows
  // the skeleton without any setState inside the effect.
  const [loaded, setLoaded] = useState<{ postId: string; rows: PostW[] } | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [people, setPeople] = useState<Map<string, SpacePerson>>(new Map())
  const rows = loaded && loaded.postId === postId ? loaded.rows : null
  const failed = failedFor !== null && failedFor === postId
  const [target, setTarget] = useState<PreviewTarget | null>(null)
  const [targetSection, setTargetSection] = useState('')

  useEffect(() => {
    if (!postId) return
    let live = true
    void getPostWs(postId)
      .then((r) => live && setLoaded({ postId, rows: r }))
      .catch(() => live && setFailedFor(postId))
    // Points and rank for the profile preview — a failure only costs those figures.
    void listSpacePeople()
      .then((p) => live && setPeople(new Map(p.map((x) => [x.id, x]))))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [postId, attempt])

  function open(w: PostW) {
    const p = people.get(w.studentId)
    setTargetSection(w.sectionId ? sectionName(w.sectionId) : '')
    setTarget({
      student_id: w.studentId,
      display_name: w.displayName,
      section_id: w.sectionId ?? '',
      points: p?.semesterPoints ?? 0,
      avatar_url: w.avatarUrl,
      rank: p?.rank ?? null,
    })
    onClose()
  }

  return (
    <>
      <Sheet open={!!postId} onClose={onClose} title="Gave a W">
        {failed ? (
          <ErrorState
            onRetry={() => {
              setFailedFor(null)
              setAttempt((n) => n + 1)
            }}
          >
            Could not load this list.
          </ErrorState>
        ) : rows === null ? (
          <ListSkeleton rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState compact>No W’s yet.</EmptyState>
        ) : (
          <Rows>
            {rows.map((w) => (
              <PersonRow
                key={w.studentId}
                className="px-1 py-2.5"
                name={w.studentId === me?.id ? `${w.displayName} (you)` : w.displayName}
                avatarUrl={w.avatarUrl}
                meta={[w.sectionId ? sectionName(w.sectionId) : null, timeAgo(w.createdAt)]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => open(w)}
              />
            ))}
          </Rows>
        )}
      </Sheet>

      <StudentProfilePreview
        target={target}
        open={!!target}
        onClose={() => setTarget(null)}
        isMe={!!target && me?.id === target.student_id}
        sectionLabel={targetSection}
      />
    </>
  )
}
