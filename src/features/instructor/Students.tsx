import { useEffect, useState, type FormEvent } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon, CopyIcon, PlusIcon, TrashIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { createStudent, deleteStudent, listStudents } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import type { SectionStudent } from '@/lib/types'

export function Students() {
  const { sections, selectedSectionId, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()

  const [students, setStudents] = useState<SectionStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ name: string; token: string }>()

  const [deleteTarget, setDeleteTarget] = useState<SectionStudent>()
  const [deleting, setDeleting] = useState(false)

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name ?? ''

  async function refresh() {
    if (!selectedSectionId) return
    setLoading(true)
    setError(undefined)
    try {
      setStudents(await listStudents(selectedSectionId))
    } catch {
      setError('Could not load students.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId])

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

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { claimToken } = await createStudent(selectedSectionId, newName.trim())
      setCreated({ name: newName.trim(), token: claimToken })
      setNewName('')
      await refresh()
    } catch {
      toast('Could not add the student.', 'error')
    } finally {
      setCreating(false)
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

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <Select
          label="Section"
          value={selectedSectionId}
          onChange={(e) => setSelectedSectionId(e.target.value)}
          className="max-w-[10rem]"
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

      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">
          {sectionName} <span className="text-muted">· {students.length}</span>
        </h1>
        {students.length > 0 && (
          <button
            type="button"
            onClick={copyAll}
            className="text-sm font-medium text-brand-500 hover:underline"
          >
            Copy unclaimed tokens
          </button>
        )}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading students…</p>
      ) : error ? (
        <Card className="p-6 text-center text-sm text-brand-500">{error}</Card>
      ) : students.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">No students in {sectionName} yet.</p>
          <Button variant="outline" className="mt-4" onClick={() => setAddOpen(true)}>
            <PlusIcon className="h-5 w-5" /> Add your first student
          </Button>
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {students.map((s) => {
            const level = getLevelProgress(s.lifetime_points).level
            return (
              <div key={s.id} className="flex items-center gap-3 p-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card-2 font-display text-sm font-bold">
                  {initials(s.full_name)}
                </span>
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
                {!s.claimed_at && (
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
              Share this one-time token with <span className="font-semibold text-ink">{created.name}</span>.
              They'll use it to claim their account.
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

      {/* Delete confirm */}
      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(undefined)} title="Remove student?">
        <p className="text-sm text-muted">
          This permanently removes <span className="font-semibold text-ink">{deleteTarget?.full_name}</span>{' '}
          and all their points. This can't be undone.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(undefined)}>
            Cancel
          </Button>
          <Button className="flex-1 bg-brand-600 hover:bg-brand-700" onClick={onDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function initials(name: string): string {
  // "Dela Cruz, Juan A." -> take first letters either side of the comma.
  const parts = name.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return (parts[1][0] + parts[0][0]).toUpperCase()
  return name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}
