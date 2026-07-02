import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  KeyIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { SectionGrid } from './SectionGrid'
import {
  createStudent,
  createStudentsBulk,
  deleteStudent,
  listStudents,
  resetStudentPin,
} from '@/lib/api'
import { exportRoster, parseRosterNames } from '@/lib/roster-io'
import { getLevelProgress } from '@/lib/leveling'
import type { SectionStudent } from '@/lib/types'

export function Students() {
  const { sections, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()
  const importRef = useRef<HTMLInputElement>(null)

  // Landing on the section grid; opening a card switches to that section's roster.
  const [openId, setOpenId] = useState<string | null>(null)

  const [students, setStudents] = useState<SectionStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ name: string; token: string }>()

  const [importOpen, setImportOpen] = useState(false)
  const [importNames, setImportNames] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ fullName: string; claimToken: string }[]>()

  const [deleteTarget, setDeleteTarget] = useState<SectionStudent>()
  const [deleting, setDeleting] = useState(false)

  const [resetTarget, setResetTarget] = useState<SectionStudent>()
  const [resetInfo, setResetInfo] = useState<{ token: string }>()
  const [resetting, setResetting] = useState(false)

  const sectionName = sections.find((s) => s.id === openId)?.name ?? ''

  // If the open section disappears (deleted elsewhere), fall back to the grid.
  useEffect(() => {
    if (openId && !sections.some((s) => s.id === openId)) setOpenId(null)
  }, [sections, openId])

  async function refresh() {
    if (!openId) return
    setLoading(true)
    setError(undefined)
    try {
      setStudents(await listStudents(openId))
    } catch {
      setError('Could not load students.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (openId) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  function openSection(id: string) {
    setSelectedSectionId(id) // keep Award/Leaderboard in sync
    setQuery('')
    setOpenId(id)
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
    if (!newName.trim() || !openId) return
    setCreating(true)
    try {
      const { claimToken } = await createStudent(openId, newName.trim())
      setCreated({ name: newName.trim(), token: claimToken })
      setNewName('')
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

  async function onDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteStudent(deleteTarget.id)
      toast('Student removed.', 'success')
      setDeleteTarget(undefined)
      await refresh()
    } catch {
      toast('Could not remove the student.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Landing view — section cards.
  if (!openId) {
    return <SectionGrid onOpen={openSection} />
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpenId(null)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Sections
      </button>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select
            aria-label="Section"
            value={openId}
            onChange={(e) => openSection(e.target.value)}
            className="max-w-40 font-display font-bold"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <span className="whitespace-nowrap text-muted">· {students.length}</span>
        </div>
        <div className="flex items-center gap-3">
          {students.length > 0 && (
            <button
              type="button"
              onClick={copyAll}
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              Copy unclaimed tokens
            </button>
          )}
          <Button onClick={() => setAddOpen(true)} size="sm">
            <PlusIcon className="h-5 w-5" /> Add
          </Button>
        </div>
      </div>

      {/* Toolbar: search + import/export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or @username"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={openImport} className="shrink-0">
          <UploadIcon className="h-5 w-5" /> Import
        </Button>
        <Button variant="outline" onClick={onExport} className="shrink-0">
          <DownloadIcon className="h-5 w-5" /> Export
        </Button>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <Card className="p-6 text-center text-sm text-brand-500">{error}</Card>
      ) : students.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">No students in {sectionName} yet.</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <PlusIcon className="h-5 w-5" /> Add one
            </Button>
            <Button variant="outline" onClick={openImport}>
              <UploadIcon className="h-5 w-5" /> Import a list
            </Button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No students match “{query}”.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {filtered.map((s) => {
            const level = getLevelProgress(s.lifetime_points).level
            return (
              <div key={s.id} className="flex items-center gap-3 p-3.5">
                <Avatar name={s.full_name} url={s.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.full_name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    {s.claimed_at ? (
                      <>
                        <CheckIcon className="h-3.5 w-3.5 text-gold-500" />
                        @{s.username} · Lv {level} · {s.lifetime_points} pts
                      </>
                    ) : (
                      <>
                        <span className="font-mono tracking-wider text-ink">{s.claim_token}</span>
                        <span>· not claimed</span>
                      </>
                    )}
                  </p>
                </div>
                {s.claimed_at ? (
                  <button
                    type="button"
                    onClick={() => openReset(s)}
                    aria-label={`Reset ${s.full_name}'s PIN`}
                    title="Reset PIN"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-card-2 hover:text-ink"
                  >
                    <KeyIcon className="h-4.5 w-4.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => copy(s.claim_token, 'Token copied')}
                    aria-label={`Copy ${s.full_name}'s token`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-card-2 hover:text-ink"
                  >
                    <CopyIcon className="h-4.5 w-4.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteTarget(s)}
                  aria-label={`Remove ${s.full_name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-brand-500/10 hover:text-brand-500"
                >
                  <TrashIcon className="h-4.5 w-4.5" />
                </button>
              </div>
            )
          })}
        </Card>
      )}

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
              <button
                type="button"
                onClick={() => copy(created.token, 'Token copied')}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-500 hover:bg-brand-500/10"
                aria-label="Copy token"
              >
                <CopyIcon className="h-5 w-5" />
              </button>
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
              label="Full name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Last name, First name M.I."
              hint="e.g. Dela Cruz, Juan A."
              autoFocus
              required
            />
            <Button type="submit" size="lg" className="w-full" disabled={creating}>
              {creating ? 'Adding…' : 'Add & generate token'}
            </Button>
          </form>
        )}
      </Sheet>

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

      {/* Reset PIN — issue a one-time reset code to hand to the student */}
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
              <button
                type="button"
                onClick={() => copy(resetInfo.token, 'Reset code copied')}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-500 hover:bg-brand-500/10"
                aria-label="Copy reset code"
              >
                <CopyIcon className="h-5 w-5" />
              </button>
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

      {/* Delete confirm */}
      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(undefined)} title="Remove student?">
        <p className="text-sm text-muted">
          This permanently removes{' '}
          <span className="font-semibold text-ink">{deleteTarget?.full_name}</span> and all their
          points. This can't be undone.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(undefined)}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-brand-600 hover:bg-brand-700"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
