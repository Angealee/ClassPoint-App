import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { useToast } from '@/components/ui/Toast'
import { InstallButton } from '@/components/pwa/InstallButton'
import { CheckIcon, GearIcon, PlusIcon, UsersIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { ManageSections } from './ManageSections'
import {
  createSection,
  getSectionOverview,
  getSectionStats,
  type SectionStat,
} from '@/lib/api'
import { timeAgo } from '@/lib/time'
import type { SectionOverview } from '@/lib/types'

/** Landing grid: pick a section card to open its roster. */
export function SectionGrid({ onOpen }: { onOpen: (sectionId: string) => void }) {
  const { sections, refreshSections, semester } = useInstructor()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [stats, setStats] = useState<Record<string, SectionStat>>({})
  const [statsLoading, setStatsLoading] = useState(true)
  // Per-section status signals (0034). Keyed by section id; empty when the
  // migration hasn't been applied — see loadStats.
  const [overview, setOverview] = useState<Record<string, SectionOverview>>({})
  const [manageOpen, setManageOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadStats() {
    setStatsLoading(true)
    try {
      // Scoped to the sections on screen — see getSectionStats (0031).
      setStats(await getSectionStats(sections.map((s) => s.id)))
    } catch {
      setStats({})
    } finally {
      setStatsLoading(false)
    }

    // Status signals are a SEPARATE, non-fatal fetch on purpose: get_section_overview
    // ships in 0034, and until that migration is applied the RPC simply does not
    // exist. Folding it into the try above would take the whole grid down with it.
    try {
      const rows = await getSectionOverview()
      setOverview(Object.fromEntries(rows.map((r) => [r.sectionId, r])))
    } catch {
      setOverview({})
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
    if (!semester) {
      toast('No active semester — set one up first.', 'error')
      return
    }
    setBusy(true)
    try {
      await createSection(name, semester.id)
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
    // Pull-to-refresh: the instructor's equivalent of the student screens —
    // after ending a class or claiming tokens, this is where you check it landed.
    <PullToRefresh
      onRefresh={async () => {
        await refreshSections()
        await loadStats()
      }}
    >
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Tap a section to manage its students.</p>
        {semester && (
          <button
            type="button"
            onClick={() => navigate('/teach/semesters')}
            className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            {semester.name} · terms &amp; subjects
          </button>
        )}
      </div>

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
                    {/* Status signals (0034). Each renders only when it has
                        something to say, and the whole block is absent until
                        that migration lands — so the card never shows a gap. */}
                    <SectionSignals info={overview[s.id]} />
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
    </PullToRefresh>
  )
}

/**
 * Per-section status: live now, unfinished penalties, and how long since the
 * last class.
 *
 * `unfinalized` counts ENDED sessions configured to apply penalties that were
 * never committed — real unfinished work, because the absences are recorded but
 * nobody has been docked, so the ledger and the register disagree until you
 * commit them.
 */
function SectionSignals({ info }: { info?: SectionOverview }) {
  if (!info) return null
  const bits: React.ReactNode[] = []

  if (info.activeSession) {
    bits.push(
      <span
        key="live"
        className="inline-flex items-center gap-1 rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-bold text-brand-500"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
        Live
      </span>,
    )
  }
  if (info.unfinalized > 0) {
    bits.push(
      <span
        key="unfin"
        title={`${info.unfinalized} ended session(s) with penalties never committed`}
        className="inline-flex items-center rounded-md bg-gold-400/15 px-1.5 py-0.5 text-[11px] font-bold text-gold-600 dark:text-gold-400"
      >
        {info.unfinalized} to finalise
      </span>,
    )
  }

  if (bits.length === 0 && !info.lastSessionAt) return null

  return (
    <div className="mt-2 space-y-1">
      {bits.length > 0 && <div className="flex flex-wrap gap-1">{bits}</div>}
      {info.lastSessionAt && !info.activeSession && (
        <p className="truncate text-[11px] text-muted/80">
          Last class {timeAgo(info.lastSessionAt)}
        </p>
      )}
    </div>
  )
}