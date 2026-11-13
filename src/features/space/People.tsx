import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { SpaceGlow } from '@/components/space/SpaceGlow'
import { SpaceStrip } from '@/components/space/SpaceStrip'
import { WButton } from '@/components/space/WButton'
import { Avatar } from '@/components/ui/Avatar'
import { Card, Rows } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { PersonRow } from '@/components/ui/PersonRow'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { SearchIcon, UsersIcon } from '@/components/ui/icons'
import { AstronautArt } from '@/components/space/AstronautArt'
import {
  StudentProfilePreview,
  type PreviewTarget,
} from '@/features/student/StudentProfilePreview'
import { useStudentData } from '@/features/student/StudentData'
import {
  getPeopleWs,
  givePersonW,
  listMyPersonWs,
  listSpacePeople,
  startDm,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { getLevelProgress } from '@/lib/leveling'
import { filterPeople, type PeopleScope } from '@/lib/people'
import { sectionColor } from '@/lib/sectionColor'
import { canPostNow } from '@/lib/space-gate'
import { cn } from '@/lib/cn'
import type { PersonWs, SpacePerson } from '@/lib/types'

type SortKey = 'az' | 'points' | 'ws'

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  )
}

/** First letter for the A–Z group headers; anything non-alphabetic groups under #. */
function initialOf(name: string): string {
  const c = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .charAt(0)
    .toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

/**
 * People — your classmates and the rest of the batch. Reads the SAME roster RPC
 * the chat rooms use (`get_space_people`), so there is one definition of who is
 * in Student Space. Person Ws (0070) ride on top and fail soft: without them the
 * list still works, it just has no W buttons.
 */
export function People() {
  const { me, sections, sectionName, spaceAccess } = useStudentData()
  const navigate = useNavigate()
  const { toast } = useToast()
  const open = spaceAccess.state === 'open'
  const canPost = canPostNow(spaceAccess)

  const [people, setPeople] = useState<SpacePerson[] | null>(null)
  const [ws, setWs] = useState<Map<string, PersonWs> | null>(null)
  const [failed, setFailed] = useState(false)
  const [scope, setScope] = useState<PeopleScope>('class')
  const [sectionId, setSectionId] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('az')
  const [target, setTarget] = useState<PreviewTarget | null>(null)
  const [targetSection, setTargetSection] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [givers, setGivers] = useState<Awaited<ReturnType<typeof listMyPersonWs>> | null>(null)
  const [giversOpen, setGiversOpen] = useState(false)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open) return
    let live = true
    listSpacePeople()
      .then((p) => live && setPeople(p))
      .catch(() => live && setFailed(true))
    getPeopleWs()
      .then((m) => live && setWs(m))
      .catch(() => {
        /* no 0070 yet, or a blip: the list works without W buttons */
      })
    return () => {
      live = false
    }
  }, [open, attempt])

  useEffect(() => {
    if (!giversOpen) return
    let live = true
    listMyPersonWs()
      .then((g) => live && setGivers(g))
      .catch(() => live && setGivers([]))
    return () => {
      live = false
    }
  }, [giversOpen])

  const retry = () => {
    setFailed(false)
    setPeople(null)
    setAttempt((n) => n + 1)
  }

  const filtered = useMemo(
    () =>
      filterPeople(people ?? [], {
        scope,
        mySectionId: me?.section_id ?? null,
        sectionId: sectionId || null,
        query,
      }),
    [people, scope, me?.section_id, sectionId, query],
  )

  const shown = useMemo(() => {
    if (sort === 'az') return filtered // the server already sorts by name
    const list = [...filtered]
    if (sort === 'points') list.sort((a, b) => b.semesterPoints - a.semesterPoints)
    else list.sort((a, b) => (ws?.get(b.id)?.total ?? 0) - (ws?.get(a.id)?.total ?? 0))
    return list
  }, [filtered, sort, ws])

  // Only offer sections that actually have someone in them.
  const sectionOptions = useMemo(() => {
    const present = new Set((people ?? []).map((p) => p.sectionId))
    return sections.filter((s) => present.has(s.id))
  }, [people, sections])

  const classCount = (people ?? []).filter(
    (p) => !!me?.section_id && p.sectionId === me.section_id,
  ).length
  const myWs = (me && ws?.get(me.id)?.total) ?? 0

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

  async function toggleW(p: SpacePerson) {
    setBusyId(p.id)
    try {
      const res = await givePersonW(p.id)
      setWs((cur) => {
        const next = new Map(cur ?? [])
        next.set(p.id, { total: res.total, iGaveToday: res.givenToday })
        return next
      })
    } catch (e) {
      toast(errorText(e, 'Could not do that.'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function message(p: SpacePerson) {
    setBusyId(p.id)
    try {
      const id = await startDm(p.id)
      navigate(`/app/space/chat/${id}`)
    } catch (e) {
      toast(errorText(e, 'Could not open that conversation.'), 'error')
      setBusyId(null)
    }
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

  // A–Z gets letter headers; the other sorts are one continuous ranking.
  const groups: Array<{ letter: string | null; rows: SpacePerson[] }> =
    sort === 'az'
      ? shown.reduce<Array<{ letter: string | null; rows: SpacePerson[] }>>((acc, p) => {
          const letter = initialOf(p.displayName)
          const last = acc.at(-1)
          if (last && last.letter === letter) last.rows.push(p)
          else acc.push({ letter, rows: [p] })
          return acc
        }, [])
      : [{ letter: null, rows: shown }]

  return (
    <div className="relative space-y-4">
      <SpaceGlow />

      <SpaceStrip>
        <PageHeader
          title="People"
          subtitle={
            people
              ? `${classCount} in your class · ${people.length} in the batch`
              : 'Your classmates and the batch'
          }
          fallback="/app/space"
        />
      </SpaceStrip>

      {ws && me && (
        <button
          type="button"
          onClick={() => setGiversOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-reward-solid/30 bg-reward-solid/8 px-4 py-3 text-left transition-colors hover:bg-reward-solid/12"
        >
          <span className="font-display text-2xl font-bold tabular-nums text-reward">{myWs}</span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">W{myWs === 1 ? '' : '’s'} from classmates</span>
            <span className="block text-xs text-muted">Only you can see who gave them.</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-accent">See who ›</span>
        </button>
      )}

      {/* My class / Batch */}
      <div role="tablist" aria-label="Who to show" className="flex gap-6 border-b border-line">
        {(
          [
            { value: 'class', label: 'My class' },
            { value: 'batch', label: 'Batch' },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={scope === t.value}
            onClick={() => {
              setScope(t.value)
              setSectionId('')
            }}
            className={cn(
              'cp-tap-y -mb-px border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-semibold transition-colors',
              scope === t.value
                ? 'border-accent-solid text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            aria-label="Search by name"
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
            className="pl-10"
          />
        </div>
        {scope === 'batch' && sectionOptions.length > 1 && (
          <Select
            aria-label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            wrapperClassName="w-full sm:w-48"
          >
            <option value="">All sections</option>
            {sectionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="px-1 text-xs text-muted">
          {people ? `${shown.length} ${noun}${shown.length === 1 ? '' : 's'}` : ''}
        </p>
        <SegmentedControl
          label="Sort"
          tone="quiet"
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'az', label: 'A–Z' },
            { value: 'points', label: 'Points' },
            ...(ws ? [{ value: 'ws' as const, label: 'W’s' }] : []),
          ]}
          className={ws ? 'w-52' : 'w-36'}
        />
      </div>

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
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <section key={g.letter ?? gi}>
              {g.letter && (
                <h2 className="mb-1 px-1 font-display text-xs font-bold text-muted">{g.letter}</h2>
              )}
              <Rows>
                {g.rows.map((p) => {
                  const mine = p.id === me?.id
                  const w = ws?.get(p.id)
                  const level = getLevelProgress(p.semesterPoints).level
                  const showDot = scope === 'batch' && !!p.sectionId
                  return (
                    <PersonRow
                      key={p.id}
                      className="px-3.5 py-3"
                      name={mine ? `${p.displayName} (you)` : p.displayName}
                      avatarUrl={p.avatarUrl}
                      meta={
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 font-semibold text-reward">Lv {level}</span>
                          {p.sectionId && (
                            <>
                              <span aria-hidden="true">·</span>
                              {showDot && (
                                <span
                                  aria-hidden="true"
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dot)] dark:bg-[var(--dot-dark)]"
                                  style={
                                    {
                                      '--dot': sectionColor(p.sectionId, false),
                                      '--dot-dark': sectionColor(p.sectionId, true),
                                    } as CSSProperties
                                  }
                                />
                              )}
                              <span className="truncate">{sectionName(p.sectionId)}</span>
                            </>
                          )}
                          {p.rank && p.rank <= 10 && (
                            <Chip tone="reward" size="sm" className="ml-1 shrink-0">
                              #{p.rank}
                            </Chip>
                          )}
                        </span>
                      }
                      onClick={() => openProfile(p)}
                      trailing={
                        mine ? undefined : (
                          <span className="flex shrink-0 items-center gap-3">
                            {ws && (
                              <WButton
                                count={w?.total ?? 0}
                                given={!!w?.iGaveToday}
                                disabled={!canPost}
                                busy={busyId === p.id}
                                onToggle={() => void toggleW(p)}
                              />
                            )}
                            <IconButton
                              size="sm"
                              label={`Message ${p.displayName}`}
                              disabled={busyId === p.id}
                              onClick={() => void message(p)}
                              icon={<MessageIcon className="h-4.5 w-4.5" />}
                            />
                          </span>
                        )
                      }
                    />
                  )
                })}
              </Rows>
            </section>
          ))}
        </div>
      )}

      <Sheet open={giversOpen} onClose={() => setGiversOpen(false)} title="Your W’s">
        {givers === null ? (
          <ListSkeleton rows={3} />
        ) : givers.length === 0 ? (
          <EmptyState compact>No W’s yet. They’ll show up here.</EmptyState>
        ) : (
          <div className="-mx-1 divide-y divide-line">
            {givers.map((g, i) => (
              <div key={`${g.studentId}-${g.givenOn}-${i}`} className="flex items-center gap-3 px-1 py-2.5">
                <Avatar name={g.displayName} url={g.avatarUrl} className="h-9 w-9" textClassName="text-2xs" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.displayName}</span>
                <span className="shrink-0 text-2xs text-muted">
                  {new Date(`${g.givenOn}T00:00:00`).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Sheet>

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
