import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Rows } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  KeyIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  TrophyIcon,
  UploadIcon,
} from '@/components/ui/icons'
import { BadgeArt } from '@/components/achievements/BadgeArt'
import { useInstructor } from './InstructorLayout'
import { AwardBar } from './AwardBar'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { SectionGrid } from './SectionGrid'
import { ArchivedStudentsSheet } from './ArchivedStudentsSheet'
import {
  archiveStudent,
  createStudent,
  createStudentsBulk,
  getStudent,
  grantAchievement,
  listAchievements,
  listArchivedStudents,
  listSessionAttendance,
  listSessions,
  listStudents,
  resetStudentPin,
  updateStudentName,
} from '@/lib/api'
import { exportAllData } from '@/lib/export-all'
import { exportRoster, parseRosterNames } from '@/lib/roster-io'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'
import type { Achievement, SectionStudent } from '@/lib/types'
import { officialName } from '@/lib/student-name'

export function Students() {
  const { sections, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const importRef = useRef<HTMLInputElement>(null)

  // The open section lives in the URL (?section=), NOT component state: a student
  // record opened from this roster must come back to THIS roster on Back, and a
  // plain useState here sent every Back to the section grid.
  const openId = searchParams.get('section')
  const setOpenId = useCallback(
    (id: string | null, replace = true) =>
      setSearchParams(id ? { section: id } : {}, { replace }),
    [setSearchParams],
  )

  const [students, setStudents] = useState<SectionStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [newLastName, setNewLastName] = useState('')
  const [newFirstName, setNewFirstName] = useState('')
  const [newMiddleName, setNewMiddleName] = useState('')
  const [newSuffix, setNewSuffix] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ name: string; token: string }>()

  const [editTarget, setEditTarget] = useState<SectionStudent>()
  const [editLastName, setEditLastName] = useState('')
  const [editFirstName, setEditFirstName] = useState('')
  const [editMiddleName, setEditMiddleName] = useState('')
  const [editSuffix, setEditSuffix] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editConfirmOpen, setEditConfirmOpen] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importNames, setImportNames] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ fullName: string; claimToken: string }[]>()

  const [deleteTarget, setDeleteTarget] = useState<SectionStudent>()
  const [deleting, setDeleting] = useState(false)
  const [archivedCount, setArchivedCount] = useState(0)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastAwarded, setLastAwarded] = useState<string[]>([])
  const [lastSessionAttendees, setLastSessionAttendees] = useState<Set<string>>(new Set())

  const studentParam = searchParams.get('student')
  useEffect(() => {
    if (!studentParam) return
    getStudent(studentParam)
      .then((s) => {
        if (!s) return
        setSelectedSectionId(s.sectionId)
        setOpenId(s.sectionId)
        setSelected(new Set([s.id]))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentParam])

  const reselectable = lastAwarded.filter((id) => students.some((s) => s.id === id))

  function toggleSelected(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [resetTarget, setResetTarget] = useState<SectionStudent>()
  const [resetInfo, setResetInfo] = useState<{ token: string }>()
  const [resetting, setResetting] = useState(false)

  const [recognitions, setRecognitions] = useState<Achievement[]>([])
  const [grantTarget, setGrantTarget] = useState<SectionStudent>()
  // Phone only: the row's four secondary actions live behind one ⋯ button.
  const [menuTarget, setMenuTarget] = useState<SectionStudent | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [granting, setGranting] = useState<string | null>(null)

  useEffect(() => {
    listAchievements()
      .then((all) => setRecognitions(all.filter((a) => a.grantedBy === 'instructor')))
      .catch(() => {
      })
  }, [])

  const sectionName = sections.find((s) => s.id === openId)?.name ?? ''

  useEffect(() => {
    if (openId && !sections.some((s) => s.id === openId)) setOpenId(null)
  }, [sections, openId])

  async function refresh() {
    if (!openId) return
    setLoading(true)
    setError(undefined)
    try {
      setStudents(await listStudents(openId))
      void listArchivedStudents(openId)
        .then((list) => setArchivedCount(list.length))
        .catch(() => {})
    } catch {
      setError('Could not load students.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (openId) void refresh()
  }, [openId])

  useEffect(() => {
    if (!openId) {
      setLastSessionAttendees(new Set())
      return
    }
    let cancelled = false
    listSessions(openId)
      .then(async (sessions) => {
        const latest = sessions.find((s) => s.status === 'ended') ?? sessions[0]
        if (!latest || cancelled) return
        const roster = await listSessionAttendance(latest.id, openId)
        if (cancelled) return
        setLastSessionAttendees(
          new Set(
            roster
              .filter((r) => r.status === 'present' || r.status === 'late')
              .map((r) => r.studentId),
          ),
        )
      })
      .catch(() => {
        if (!cancelled) setLastSessionAttendees(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [openId])

  function openSection(id: string) {
    setSelectedSectionId(id) // keep Attendance/Leaderboard in sync
    setQuery('')
    setSelected(new Set())
    setLastAwarded([])
    // From the grid: push, so Back returns to the grid. From the picker: replace.
    setOpenId(id, !openId ? false : true)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.display_name.toLowerCase().includes(q) ||
        (s.username ?? '').toLowerCase().includes(q),
    )
  }, [students, query])

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id))
  const unclaimedIds = filtered.filter((s) => !s.claimed_at).map((s) => s.id)
  const lastSessionIds = filtered.filter((s) => lastSessionAttendees.has(s.id)).map((s) => s.id)

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(label, 'success')
    } catch {
      toast('Copy failed — long-press to copy.', 'error')
    }
  }

  function copyAll() {
    const unclaimed = students.filter((s) => !s.claimed_at)
    if (unclaimed.length === 0) {
      toast('Everyone has already claimed their account.', 'info')
      return
    }
    const text = unclaimed.map((s) => `${s.full_name} — ${s.claim_token}`).join('\n')
    void copy(text, `Copied ${unclaimed.length} token(s)`)
  }

  async function onExport() {
    if (students.length === 0) {
      toast('Nothing to export yet.', 'info')
      return
    }
    try {
      await exportRoster(sectionName, students)
    } catch {
      toast('Could not export the roster.', 'error')
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!newLastName.trim() || !newFirstName.trim() || !openId) return
    setCreating(true)
    const parts = {
      lastName: newLastName.trim(),
      firstName: newFirstName.trim(),
      middleName: newMiddleName.trim() || null,
      suffix: newSuffix.trim() || null,
    }
    try {
      const { claimToken } = await createStudent(openId, parts)
      setCreated({ name: officialName(parts), token: claimToken })
      setNewLastName('')
      setNewFirstName('')
      setNewMiddleName('')
      setNewSuffix('')
      await refresh()
    } catch {
      toast('Could not add the student.', 'error')
    } finally {
      setCreating(false)
    }
  }

  function openImport() {
    setImportNames([])
    setImportResults(undefined)
    setImportOpen(true)
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const names = await parseRosterNames(file)
      if (names.length === 0) {
        toast('No names found in that file.', 'error')
        return
      }
      setImportNames(names)
    } catch {
      toast('Could not read that file. Use .xlsx, .xls or .csv.', 'error')
    }
  }

  async function onConfirmImport() {
    if (importNames.length === 0 || !openId) return
    setImporting(true)
    try {
      const results = await createStudentsBulk(openId, importNames)
      setImportResults(results)
      await refresh()
    } catch {
      toast('Could not import the students.', 'error')
    } finally {
      setImporting(false)
    }
  }

  function copyImportTokens() {
    if (!importResults) return
    const text = importResults.map((r) => `${r.fullName} — ${r.claimToken}`).join('\n')
    void copy(text, `Copied ${importResults.length} token(s)`)
  }

  function openReset(s: SectionStudent) {
    setResetInfo(undefined)
    setResetTarget(s)
  }

  async function onGenerateReset() {
    if (!resetTarget) return
    setResetting(true)
    try {
      const { token } = await resetStudentPin(resetTarget.id)
      setResetInfo({ token })
    } catch {
      toast('Could not create a reset code.', 'error')
    } finally {
      setResetting(false)
    }
  }

  async function onGrant(code: string) {
    if (!grantTarget) return
    setGranting(code)
    try {
      await grantAchievement(grantTarget.id, code)
      toast(`Granted to ${grantTarget.full_name}.`, 'success')
      setGrantTarget(undefined)
    } catch {
      toast('Could not grant that achievement.', 'error')
    } finally {
      setGranting(null)
    }
  }

  async function onArchive() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await archiveStudent(deleteTarget.id)
      toast(`${deleteTarget.full_name} archived — restorable any time.`, 'success')
      setDeleteTarget(undefined)
      await refresh()
    } catch {
      toast('Could not archive the student.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  function openEditName(s: SectionStudent) {
    setEditLastName(s.last_name ?? '')
    setEditFirstName(s.first_name ?? '')
    setEditMiddleName(s.middle_name ?? '')
    setEditSuffix(s.suffix ?? '')
    setEditTarget(s)
  }

  async function onSaveEditName() {
    if (!editTarget || !editLastName.trim() || !editFirstName.trim()) return
    setEditSaving(true)
    try {
      await updateStudentName(editTarget.id, {
        lastName: editLastName.trim(),
        firstName: editFirstName.trim(),
        middleName: editMiddleName.trim() || null,
        suffix: editSuffix.trim() || null,
      })
      toast(`Name updated.`, 'success')
      setEditTarget(undefined)
      setEditConfirmOpen(false)
      await refresh()
    } catch {
      toast('Could not update the name.', 'error')
    } finally {
      setEditSaving(false)
    }
  }

  async function onBackupAll() {
    setBackingUp(true)
    try {
      await exportAllData()
      toast('Full backup downloaded.', 'success')
    } catch {
      toast('Could not build the backup. Try again.', 'error')
    } finally {
      setBackingUp(false)
    }
  }

  // Landing view — section cards.
  if (!openId) {
    return <SectionGrid onOpen={openSection} />
  }

  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => {
          setSelected(new Set())
          setLastAwarded([])
          setOpenId(null)
        }}
        className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Sections
      </button>

      {/* Header: pick a section, add a student. Everything else is one row below. */}
      <div className="flex items-center gap-3">
        <Select
          aria-label="Section"
          value={openId}
          onChange={(e) => openSection(e.target.value)}
          className="font-display font-bold"
          wrapperClassName="min-w-0 flex-1 sm:max-w-xs"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Button onClick={() => setAddOpen(true)} className="shrink-0">
          <PlusIcon className="h-5 w-5" /> Add
        </Button>
      </div>

      <p className="-mt-2 flex items-center gap-2 px-1 text-sm text-muted">
        <span>
          {students.length} student{students.length === 1 ? '' : 's'}
        </span>
        {archivedCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setArchivedOpen(true)}
              className="cp-tap-y font-semibold text-accent hover:underline"
            >
              {archivedCount} archived
            </button>
          </>
        )}
      </p>

      {/* Search + tools: one row. Import / Export / Backup live behind Tools. */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute z-10 left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or @username"
            aria-label="Search students"
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setToolsOpen(true)}
          aria-label="Roster tools"
          className="shrink-0"
        >
          <MoreIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Tools</span>
        </Button>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <ErrorState>{error}</ErrorState>
      ) : students.length === 0 ? (
        <EmptyState
          action={
            <div className="flex justify-center gap-3">
              <Button variant="outline" icon={<PlusIcon className="h-5 w-5" />} onClick={() => setAddOpen(true)}>
                Add one
              </Button>
              <Button variant="outline" icon={<UploadIcon className="h-5 w-5" />} onClick={openImport}>
                Import a list
              </Button>
            </div>
          }
        >
          No students in {sectionName} yet.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>No students match “{query}”.</EmptyState>
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-2 px-1 [&>button]:whitespace-nowrap">
          <span className="shrink-0 text-xs font-medium text-muted">Select</span>
          <button
            type="button"
            onClick={() =>
              setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((s) => s.id)))
            }
            className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-accent-solid hover:text-accent"
          >
            {allFilteredSelected ? 'Clear all' : `All (${filtered.length})`}
          </button>
          {unclaimedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set(unclaimedIds))}
              className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-accent-solid hover:text-accent"
            >
              Unclaimed ({unclaimedIds.length})
            </button>
          )}
          {lastSessionIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set(lastSessionIds))}
              title="Everyone marked Present or Late in this section's most recent class"
              className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-accent-solid hover:text-accent"
            >
              Last class ({lastSessionIds.length})
            </button>
          )}
        </div>
        <Rows>
          {filtered.map((s) => {
            const level = getLevelProgress(s.semester_points).level
            return (
              <div
                key={s.id}
                className={cn(
                  'flex items-center gap-2 p-3.5 transition-colors sm:gap-3',
                  selected.has(s.id) && 'bg-accent-solid/8',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleSelected(s.id)}
                  aria-pressed={selected.has(s.id)}
                  aria-label={`Select ${s.full_name} to award points`}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="relative shrink-0">
                    <Avatar
                      name={s.full_name}
                      url={s.avatar_url}
                      className={cn(selected.has(s.id) && 'opacity-40')}
                    />
                    {selected.has(s.id) && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-accent-solid text-white">
                        <CheckIcon className="h-5 w-5" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.full_name}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted [&>svg]:shrink-0">
                      {s.claimed_at ? (
                        <>
                          <CheckIcon className="h-3.5 w-3.5 text-gold-500" />@{s.username} · Lv{' '}
                          {level} · {s.semester_points} pts
                        </>
                      ) : (
                        <>
                          <span className="font-mono tracking-wider text-ink">{s.claim_token}</span>
                          <span>· not claimed</span>
                        </>
                      )}
                    </span>
                  </span>
                </button>
                <div className="hidden items-center gap-2 sm:flex">
                <IconButton
                  label={`Grant ${s.full_name} an achievement`}
                  onClick={() => setGrantTarget(s)}
                  title="Grant achievement"
                  icon={<TrophyIcon className="h-4.5 w-4.5" />}
                />
                {s.claimed_at ? (
                                    <IconButton
                    label={`Reset ${s.full_name}'s PIN`}
                    onClick={() => openReset(s)}
                    title="Reset PIN"
                    icon={<KeyIcon className="h-4.5 w-4.5" />}
                  />
                ) : (
                                    <IconButton
                    label={`Copy ${s.full_name}'s token`}
                    onClick={() => copy(s.claim_token, 'Token copied')}
                    icon={<CopyIcon className="h-4.5 w-4.5" />}
                  />
                )}
                                <IconButton
                  label={`Edit ${s.full_name}'s name`}
                  onClick={() => openEditName(s)}
                  title="Edit name"
                  icon={<PencilIcon className="h-4.5 w-4.5" />}
                />
                <IconButton
                  label={`Archive ${s.full_name}`}
                  variant="danger"
                  onClick={() => setDeleteTarget(s)}
                  title="Archive (restorable)"
                  icon={<TrashIcon className="h-4.5 w-4.5" />}
                />
                <button
                  type="button"
                  onClick={() => navigate(`/teach/student/${s.id}`)}
                  aria-label={`View ${s.full_name}'s record`}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-solid/10"
                >
                  View ›
                </button>
                </div>
                <IconButton
                  className="sm:hidden"
                  label={`More actions for ${s.full_name}`}
                  onClick={() => setMenuTarget(s)}
                  icon={<MoreIcon className="h-5 w-5" />}
                />
                <button
                  type="button"
                  onClick={() => navigate(`/teach/student/${s.id}`)}
                  aria-label={`View ${s.full_name}'s record`}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-solid/10 sm:hidden"
                >
                  View ›
                </button>
              </div>
            )
          })}
        </Rows>
        </>
      )}

      {selected.size === 0 && reselectable.length > 0 && (
        <button
          type="button"
          onClick={() => setSelected(new Set(reselectable))}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2.5 text-sm font-medium text-muted transition-colors hover:border-accent-solid hover:text-accent"
        >
          Select the same {reselectable.length} again
        </button>
      )}

      {selected.size > 0 && <div aria-hidden className="h-44" />}

      <AwardBar
        selectedIds={[...selected]}
        onClear={() => setSelected(new Set())}
        onAwarded={(ids) => {
          setLastAwarded(ids)
          setSelected(new Set())
          void refresh()
        }}
      />

      {/* Roster tools */}
      <Sheet open={toolsOpen} onClose={() => setToolsOpen(false)} title="Roster tools">
        <div className="-mx-1 divide-y divide-line">
          {(
            [
              { label: 'Import a list', hint: 'Add many students from a spreadsheet', Icon: UploadIcon, run: openImport },
              { label: 'Export this section', hint: 'Names, points and tokens as a file', Icon: DownloadIcon, run: onExport },
              {
                label: backingUp ? 'Backing up…' : 'Backup everything',
                hint: 'All sections, points, attendance and requests in one workbook',
                Icon: DownloadIcon,
                run: () => void onBackupAll(),
                disabled: backingUp,
              },
              ...(students.length > 0
                ? [{ label: 'Copy unclaimed tokens', hint: 'Claim codes for students who have not signed up', Icon: CopyIcon, run: copyAll }]
                : []),
            ] as Array<{
              label: string
              hint: string
              Icon: typeof UploadIcon
              run: () => void
              disabled?: boolean
            }>
          ).map(({ label, hint, Icon, run, disabled }) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => {
                setToolsOpen(false)
                run()
              }}
              className="flex w-full items-center gap-3 px-1 py-3 text-left disabled:opacity-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card-2 text-muted">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* Phone: per-student actions */}
      <Sheet
        open={!!menuTarget}
        onClose={() => setMenuTarget(null)}
        title={menuTarget?.full_name ?? 'Student'}
      >
        {menuTarget && (
          <div className="-mx-1 divide-y divide-line">
            {(
              [
                {
                  label: 'Grant achievement',
                  Icon: TrophyIcon,
                  run: () => setGrantTarget(menuTarget),
                },
                menuTarget.claimed_at
                  ? { label: 'Reset PIN', Icon: KeyIcon, run: () => openReset(menuTarget) }
                  : {
                      label: 'Copy token',
                      Icon: CopyIcon,
                      run: () => copy(menuTarget.claim_token, 'Token copied'),
                    },
                { label: 'Edit name', Icon: PencilIcon, run: () => openEditName(menuTarget) },
                {
                  label: 'Archive (restorable)',
                  Icon: TrashIcon,
                  run: () => setDeleteTarget(menuTarget),
                  danger: true,
                },
              ] as Array<{
                label: string
                Icon: typeof TrophyIcon
                run: () => void
                danger?: boolean
              }>
            ).map(({ label, Icon, run, danger }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setMenuTarget(null)
                  run()
                }}
                className={cn(
                  'flex h-14 w-full items-center gap-3 px-1 text-left text-sm font-medium',
                  danger ? 'text-danger' : 'text-ink',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        )}
      </Sheet>

      {/* Add student / show token */}
      <Sheet
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          setCreated(undefined)
        }}
        title={created ? 'Student added' : `Add student to ${sectionName}`}
      >
        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Share this one-time token with{' '}
              <span className="font-semibold text-ink">{created.name}</span>. They'll use it to
              claim their account.
            </p>
            <div className="flex items-center justify-between rounded-xl border border-line bg-card-2 px-4 py-3">
              <span className="font-mono text-lg font-bold tracking-widest">{created.token}</span>
                            <IconButton
                label="Copy token"
                variant="accent"
                onClick={() => copy(created.token, 'Token copied')}
                icon={<CopyIcon className="h-5 w-5" />}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setCreated(undefined)}>
                Add another
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setAddOpen(false)
                  setCreated(undefined)
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onCreate} className="space-y-4">
            <Input
              label="Last name"
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
              placeholder="e.g. Dela Cruz"
              autoFocus
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First name"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                placeholder="e.g. Juan"
                required
              />
              <Input
                label="Middle name"
                value={newMiddleName}
                onChange={(e) => setNewMiddleName(e.target.value)}
                placeholder="optional"
              />
            </div>
            <Input
              label="Suffix"
              value={newSuffix}
              onChange={(e) => setNewSuffix(e.target.value)}
              placeholder="Jr., III, etc. (optional)"
            />
            {newLastName.trim() && newFirstName.trim() && (
              <p className="rounded-lg bg-card-2 px-3 py-2 text-sm text-muted">
                Official name:{' '}
                <span className="font-semibold text-ink">
                  {officialName({
                    lastName: newLastName.trim(),
                    firstName: newFirstName.trim(),
                    middleName: newMiddleName.trim() || null,
                    suffix: newSuffix.trim() || null,
                  })}
                </span>
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={creating}>
              {creating ? 'Adding…' : 'Add & generate token'}
            </Button>
          </form>
        )}
      </Sheet>

      {/* Edit name */}
      <Sheet
        open={!!editTarget}
        onClose={() => setEditTarget(undefined)}
        title={`Edit name — ${editTarget?.full_name ?? ''}`}
      >
        <div className="space-y-4">
          <Input
            label="Last name"
            value={editLastName}
            onChange={(e) => setEditLastName(e.target.value)}
            autoFocus
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              required
            />
            <Input
              label="Middle name"
              value={editMiddleName}
              onChange={(e) => setEditMiddleName(e.target.value)}
              placeholder="optional"
            />
          </div>
          <Input
            label="Suffix"
            value={editSuffix}
            onChange={(e) => setEditSuffix(e.target.value)}
            placeholder="Jr., III, etc. (optional)"
          />
          {editLastName.trim() && editFirstName.trim() && (
            <p className="rounded-lg bg-card-2 px-3 py-2 text-sm text-muted">
              Official name:{' '}
              <span className="font-semibold text-ink">
                {officialName({
                  lastName: editLastName.trim(),
                  firstName: editFirstName.trim(),
                  middleName: editMiddleName.trim() || null,
                  suffix: editSuffix.trim() || null,
                })}
              </span>
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={!editLastName.trim() || !editFirstName.trim() || editSaving}
            onClick={() => setEditConfirmOpen(true)}
          >
            Save name
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={editConfirmOpen}
        title="Save this name?"
        message={
          <>
            This updates <span className="font-semibold text-ink">{editTarget?.full_name}</span>'s
            name everywhere in the app — leaderboard, attendance, records and all history.
          </>
        }
        confirmLabel="Save"
        busy={editSaving}
        onConfirm={() => void onSaveEditName()}
        onClose={() => setEditConfirmOpen(false)}
      />

      {/* Import from Excel/CSV */}
      <Sheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={importResults ? 'Import complete' : `Import students to ${sectionName}`}
      >
        <input
          ref={importRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onImportFile}
        />

        {importResults ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Added <span className="font-semibold text-ink">{importResults.length}</span> student
              {importResults.length === 1 ? '' : 's'}. Copy their one-time tokens to hand out.
            </p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line bg-card-2 p-3">
              {importResults.map((r) => (
                <div key={r.claimToken} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{r.fullName}</span>
                  <span className="font-mono font-semibold tracking-wider">{r.claimToken}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={copyImportTokens}>
                <CopyIcon className="h-5 w-5" /> Copy all
              </Button>
              <Button className="flex-1" onClick={() => setImportOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Upload an <span className="font-medium text-ink">.xlsx</span>,{' '}
              <span className="font-medium text-ink">.xls</span> or{' '}
              <span className="font-medium text-ink">.csv</span> with one student name per row. If a
              column is headed “Name”, it's used; otherwise the first column is.
            </p>

            <Button variant="outline" className="w-full" onClick={() => importRef.current?.click()}>
              <UploadIcon className="h-5 w-5" /> Choose file
            </Button>

            {importNames.length > 0 && (
              <>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line bg-card-2 p-3 text-sm">
                  {importNames.map((n, i) => (
                    <p key={`${n}-${i}`} className="truncate">
                      {n}
                    </p>
                  ))}
                </div>
                <Button size="lg" className="w-full" onClick={onConfirmImport} disabled={importing}>
                  {importing
                    ? 'Importing…'
                    : `Import ${importNames.length} student${importNames.length === 1 ? '' : 's'}`}
                </Button>
              </>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!resetTarget}
        onClose={() => {
          setResetTarget(undefined)
          setResetInfo(undefined)
        }}
        title={resetInfo ? 'Reset code created' : 'Reset PIN?'}
      >
        {resetInfo ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Give this one-time code to{' '}
              <span className="font-semibold text-ink">{resetTarget?.full_name}</span>. They enter it
              on the <span className="font-medium text-ink">Forgot your PIN?</span> screen to set a
              new PIN. It expires in 24 hours and works once.
            </p>
            <div className="flex items-center justify-between rounded-xl border border-line bg-card-2 px-4 py-3">
              <span className="font-mono text-lg font-bold tracking-widest">{resetInfo.token}</span>
                            <IconButton
                label="Copy reset code"
                variant="accent"
                onClick={() => copy(resetInfo.token, 'Reset code copied')}
                icon={<CopyIcon className="h-5 w-5" />}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setResetTarget(undefined)
                setResetInfo(undefined)
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Create a one-time reset code for{' '}
              <span className="font-semibold text-ink">{resetTarget?.full_name}</span>
              {resetTarget?.username ? (
                <>
                  {' '}
                  (@{resetTarget.username})
                </>
              ) : null}
              . Their current PIN keeps working until they use the code, so it's safe to generate.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setResetTarget(undefined)}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={onGenerateReset} disabled={resetting}>
                {resetting ? 'Creating…' : 'Create reset code'}
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Grant a recognition achievement */}
      <Sheet
        open={!!grantTarget}
        onClose={() => setGrantTarget(undefined)}
        title={`Grant an achievement to ${grantTarget?.full_name ?? ''}`}
      >
        <div className="space-y-2">
          {recognitions.length === 0 ? (
            <EmptyState compact>No recognitions available.</EmptyState>
          ) : (
            recognitions.map((a) => (
              <button
                key={a.code}
                type="button"
                onClick={() => onGrant(a.code)}
                disabled={!!granting}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-card-2 disabled:opacity-60"
              >
                <BadgeArt code={a.code} category={a.category} state="unlocked" isTitleGrantor={!!a.titleText} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.name}</p>
                  <p className="truncate text-xs text-muted">{a.description}</p>
                </div>
                {granting === a.code && <span className="text-xs text-muted">Granting…</span>}
              </button>
            ))
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Archive this student?"
        message={
          <>
            <span className="font-semibold text-ink">{deleteTarget?.full_name}</span> disappears
            from the roster, leaderboard and attendance-taking — but every record is kept, and you
            can restore them any time from the Archived list.
          </>
        }
        confirmLabel="Archive"
        busy={deleting}
        onConfirm={onArchive}
        onClose={() => setDeleteTarget(undefined)}
      />

      {openId && (
        <ArchivedStudentsSheet
          sectionId={openId}
          open={archivedOpen}
          onClose={() => setArchivedOpen(false)}
          onChanged={() => void refresh()}
        />
      )}
    </div>
    </PullToRefresh>
  )
}
