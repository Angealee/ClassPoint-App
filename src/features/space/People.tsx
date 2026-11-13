import { useEffect, useMemo, useState } from 'react'
import { Card, Rows } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { PersonRow } from '@/components/ui/PersonRow'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { UsersIcon } from '@/components/ui/icons'
import { AstronautArt } from '@/components/space/AstronautArt'
import {
  StudentProfilePreview,
  type PreviewTarget,
} from '@/features/student/StudentProfilePreview'
import { useStudentData } from '@/features/student/StudentData'
import { listSpacePeople } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import { filterPeople, type PeopleScope } from '@/lib/people'
import type { SpacePerson } from '@/lib/types'

/**
 * People — your classmates and the rest of the batch, with a tap through to each
 * public profile. Reads the SAME roster RPC the chat rooms use (`get_space_people`),
 * so there is one definition of who is in Student Space and what is shown about them.
 */
export function People() {
  const { me, sections, sectionName, spaceAccess } = useStudentData()
  const open = spaceAccess.state === 'open'

  const [people, setPeople] = useState<SpacePerson[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [scope, setScope] = useState<PeopleScope>('class')
  const [sectionId, setSectionId] = useState('')
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<PreviewTarget | null>(null)
  const [targetSection, setTargetSection] = useState('')

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open) return
    let live = true
    listSpacePeople()
      .then((p) => live && setPeople(p))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [open, attempt])

  const retry = () => {
    setFailed(false)
    setPeople(null)
    setAttempt((n) => n + 1)
  }

  const shown = useMemo(
    () =>
      filterPeople(people ?? [], {
        scope,
        mySectionId: me?.section_id ?? null,
        sectionId: sectionId || null,
        query,
      }),
    [people, scope, me?.section_id, sectionId, query],
  )

  // Only offer sections that actually have someone in them.
  const sectionOptions = useMemo(() => {
    const present = new Set((people ?? []).map((p) => p.sectionId))
    return sections.filter((s) => present.has(s.id))
  }, [people, sections])

  function openProfile(p: SpacePerson) {
    setTargetSection(p.sectionId ? sectionName(p.sectionId) : '')
    setTarget({
      student_id: p.id,
      display_name: p.displayName,
      section_id: p.sectionId ?? '',
      points: p.semesterPoints,
      avatar_url: p.avatarUrl,
      rank: p.rank,
    })
  }

  if (!open) {
    return (
      <div className="space-y-4">
        <PageHeader title="People" fallback="/app/space" />
        <Card pad="roomy">
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <AstronautArt variant="space" size="lg" />
            <p className="mx-auto max-w-sm text-sm text-muted">
              {spaceAccess.state === 'paused'
                ? 'Student Space is paused for now. The people list is back when it reopens.'
                : 'The people list opens together with Student Space. You’ll see it here the moment it does.'}
            </p>
          </div>
        </Card>
      </div>
    )
  }

  const noun = scope === 'class' ? 'classmate' : 'student'

  return (
    <div className="space-y-4">
      <PageHeader
        title="People"
        subtitle="Find your classmates and the rest of the batch."
        fallback="/app/space"
      />

      <SegmentedControl
        label="Who to show"
        value={scope}
        onChange={(v) => {
          setScope(v)
          setSectionId('')
        }}
        options={[
          { value: 'class', label: 'My class' },
          { value: 'batch', label: 'Batch' },
        ]}
      />

      <Input
        aria-label="Search by name"
        placeholder="Search by name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />

      {scope === 'batch' && sectionOptions.length > 1 && (
        <Select
          aria-label="Section"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
        >
          <option value="">All sections</option>
          {sectionOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      )}

      {failed ? (
        <ErrorState onRetry={retry}>Could not load the people list.</ErrorState>
      ) : people === null ? (
        <ListSkeleton rows={6} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<UsersIcon />}>
          {query.trim()
            ? `No ${noun} matches “${query.trim()}”.`
            : scope === 'class'
              ? 'No classmates to show yet.'
              : 'Nobody to show yet.'}
        </EmptyState>
      ) : (
        <>
          <p className="px-1 text-xs text-muted">
            {shown.length} {noun}
            {shown.length === 1 ? '' : 's'}
          </p>
          <Rows>
            {shown.map((p) => (
              <PersonRow
                key={p.id}
                className="px-3.5 py-2.5"
                name={p.id === me?.id ? `${p.displayName} (you)` : p.displayName}
                avatarUrl={p.avatarUrl}
                meta={[
                  `Lv ${getLevelProgress(p.semesterPoints).level}`,
                  p.sectionId ? sectionName(p.sectionId) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  p.rank && p.rank <= 10 ? (
                    <Chip tone="reward" size="sm">
                      #{p.rank}
                    </Chip>
                  ) : undefined
                }
                onClick={() => openProfile(p)}
              />
            ))}
          </Rows>
        </>
      )}

      <StudentProfilePreview
        target={target}
        open={!!target}
        onClose={() => setTarget(null)}
        isMe={!!target && me?.id === target.student_id}
        sectionLabel={targetSection}
      />
    </div>
  )
}
