import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { BellIcon, CalendarIcon, DownloadIcon, TrophyIcon } from '@/components/ui/icons'
import { forceLeaderboardRefresh } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { AttendanceWorkbook } from '../AttendanceWorkbook'
import { Broadcast } from '../Broadcast'
import { IconTile } from './parts'

function jump(id: string) {
  const el = document.getElementById(id)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el?.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true })
}

function QuickAction({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 min-w-0 items-center gap-3 rounded-2xl border border-line bg-card p-3 text-left transition-colors hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <IconTile>{icon}</IconTile>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-2xs text-muted">{hint}</span>
      </span>
    </button>
  )
}

export function ToolsTab({ counts }: { counts: Record<string, number> }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function rebuild() {
    setBusy(true)
    try {
      await forceLeaderboardRefresh()
      toast('Leaderboard rebuilt.', 'success')
    } catch (e) {
      toast(errorText(e, "Couldn't rebuild the leaderboard."), 'error')
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction icon={<BellIcon className="h-5 w-5" />} label="Broadcast" hint="Push to a section" onClick={() => jump('ops-broadcast')} />
        <QuickAction icon={<DownloadIcon className="h-5 w-5" />} label="Export attendance" hint="Excel workbook" onClick={() => jump('ops-workbook')} />
        <QuickAction icon={<TrophyIcon className="h-5 w-5" />} label="Rebuild leaderboard" hint="Publish new ranks now" onClick={() => setConfirm(true)} />
        <QuickAction icon={<CalendarIcon className="h-5 w-5" />} label="Semesters" hint="Dates, subjects, new term" onClick={() => navigate('/teach/semesters')} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div id="ops-broadcast" className="scroll-mt-4">
          <Broadcast counts={counts} />
        </div>
        <div id="ops-workbook" className="scroll-mt-4">
          <AttendanceWorkbook />
        </div>
      </div>

      <Card className="flex items-center gap-3">
        <IconTile tone="neutral">
          <TrophyIcon className="h-5 w-5" />
        </IconTile>
        <p className="min-w-0 flex-1 text-xs text-muted">
          The leaderboard is frozen and rebuilt at 12:30 and 19:30. Rebuild it from the shortcut above to publish points
          awarded since.
        </p>
      </Card>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void rebuild()}
        busy={busy}
        variant="default"
        title="Rebuild the leaderboard?"
        message="Every student's rank is recalculated and republished immediately."
        detail="Anyone who climbed since the last freeze will see their new rank, and anyone who slipped will see that too."
        confirmLabel="Rebuild"
      />
    </div>
  )
}
