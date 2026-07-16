import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon, PlusIcon, TrashIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { createSection, deleteSection, getSectionCounts, renameSection } from '@/lib/api'

/** Instructor tool to add / rename / delete sections (delete blocked if not empty). */
export function ManageSections({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sections, refreshSections } = useInstructor()
  const { toast } = useToast()

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string>()
  const [draft, setDraft] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string }>()

  async function loadCounts() {
    try {
      setCounts(await getSectionCounts())
    } catch {
      setCounts({})
    }
  }

  useEffect(() => {
    if (open) void loadCounts()
  }, [open])

  function startEdit(id: string, name: string) {
    setEditingId(id)
    setDraft(name)
  }

  async function saveEdit(id: string) {
    const name = draft.trim()
    if (!name) return
    setBusy(true)
    try {
      await renameSection(id, name)
      await refreshSections()
      setEditingId(undefined)
    } catch {
      toast('Could not rename — is that name already taken?', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      await createSection(name)
      await refreshSections()
      await loadCounts()
      setNewName('')
      toast(`Section ${name} added.`, 'success')
    } catch {
      toast('Could not add — is that name already taken?', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string, name: string) {
    setBusy(true)
    try {
      await deleteSection(id)
      await refreshSections()
      await loadCounts()
      toast(`Section ${name} removed.`, 'success')
      setDeleteTarget(undefined)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not remove the section.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <Sheet open={open} onClose={onClose} title="Manage sections">
      <div className="space-y-2">
        {sections.length === 0 && (
          <p className="py-2 text-sm text-muted">No sections yet — add your first below.</p>
        )}
        {sections.map((s) => {
          const count = counts[s.id] ?? 0
          const editing = editingId === s.id
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-xl border border-line bg-card-2 px-3 py-2"
            >
              {editing ? (
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-9"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && void saveEdit(s.id)}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">
                    {count} student{count === 1 ? '' : 's'}
                  </p>
                </div>
              )}

              {editing ? (
                <button
                  type="button"
                  onClick={() => void saveEdit(s.id)}
                  disabled={busy}
                  aria-label="Save name"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gold-600 hover:bg-card dark:text-gold-400"
                >
                  <CheckIcon className="h-5 w-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(s.id, s.name)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-brand-500 hover:underline"
                >
                  Rename
                </button>
              )}

              <button
                type="button"
                onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                disabled={busy || count > 0}
                title={count > 0 ? 'Remove its students first' : 'Delete section'}
                aria-label={`Delete ${s.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-brand-500/10 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                <TrashIcon className="h-4.5 w-4.5" />
              </button>
            </div>
          )
        })}
      </div>

      <form onSubmit={onAdd} className="mt-4 flex items-end gap-2">
        <Input
          label="New section"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. 2F"
        />
        <Button type="submit" className="shrink-0" disabled={busy || !newName.trim()}>
          <PlusIcon className="h-5 w-5" /> Add
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">
        A section can only be deleted once it has no students.
      </p>
    </Sheet>

    {/* Rendered as a sibling of the parent Sheet so the overlay stacks above it. */}
    <ConfirmDialog
      open={!!deleteTarget}
      title="Delete this section?"
      message={
        <>
          Section <span className="font-semibold text-ink">{deleteTarget?.name}</span> will be
          permanently deleted. This can’t be undone.
        </>
      }
      confirmLabel="Delete section"
      busy={busy}
      onConfirm={() => deleteTarget && void onDelete(deleteTarget.id, deleteTarget.name)}
      onClose={() => setDeleteTarget(undefined)}
    />
    </>
  )
}
