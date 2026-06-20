import { useEffect, useState, type FormEvent } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { InstallButton } from '@/components/pwa/InstallButton'
import { CheckIcon, GearIcon, PlusIcon, UsersIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { ManageSections } from './ManageSections'
import { createSection, getSectionStats, type SectionStat } from '@/lib/api'

/** Landing grid: pick a section card to open its roster. */
export function SectionGrid({ onOpen }: { onOpen: (sectionId: string) => void }) {
  const { sections, refreshSections } = useInstructor()
  const { toast } = useToast()

  const [stats, setStats] = useState<Record<string, SectionStat>>({})
  const [statsLoading, setStatsLoading] = useState(true)
  const [manageOpen, setManageOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadStats() {
    setStatsLoading(true)
    try {
      setStats(await getSectionStats())
    } catch {
      setStats({})
    } finally {
      setStatsLoading(false)
    }
  }

  // Refresh counts whenever the set of sections changes (add / rename / delete).
  useEffect(() => {
    void loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.length])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      await createSection(name)
      await refreshSections()
      await loadStats()
      setNewName('')
      setAdding(false)
      toast(`Section ${name} added.`, 'success')
    } catch {
      toast('Could not add — is that name already taken?', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">Sections</h1>
        <div className="flex items-center gap-2">
          <InstallButton />
          <Button variant="outline" onClick={() => setManageOpen(true)}>
            <GearIcon className="h-5 w-5" /> Manage
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted">Tap a section to manage its students.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sections.map((s) => {
          const stat = stats[s.id] ?? { total: 0, claimed: 0 }
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              className="group text-left"
            >
              <Card className="h-full p-4 transition-colors hover:border-brand-500/60 hover:bg-card-2">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 font-display text-lg font-bold text-brand-500">
                  {s.name.replace(/[^0-9]/g, '') || s.name[0]?.toUpperCase()}
                </div>
                <p className="truncate font-display text-lg font-bold">{s.name}</p>
                {statsLoading ? (
                  <div className="mt-1.5 space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ) : (
                  <>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                      <UsersIcon className="h-3.5 w-3.5" />
                      {stat.total} student{stat.total === 1 ? '' : 's'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                      <CheckIcon className="h-3.5 w-3.5 text-gold-500" />
                      {stat.claimed} claimed
                    </p>
                  </>
                )}
              </Card>
            </button>
          )
        })}

        {/* Add-section card */}
        {adding ? (
          <Card className="p-4">
            <form onSubmit={onAdd} className="space-y-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. 2F"
                autoFocus
                onBlur={() => !newName.trim() && setAdding(false)}
              />
              <Button type="submit" size="sm" className="w-full" disabled={busy || !newName.trim()}>
                {busy ? 'Adding…' : 'Create'}
              </Button>
            </form>
          </Card>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-[7.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-muted transition-colors hover:border-brand-500/60 hover:text-brand-500"
          >
            <PlusIcon className="h-6 w-6" />
            <span className="text-sm font-semibold">New section</span>
          </button>
        )}
      </div>

      <ManageSections open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  )
}
