import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { PeerPlate } from '@/components/peer/PeerPlate'
import { getAbsenceRisk, getBackupHealth, getSectionHeadcounts, getSectionOverview, listAuthEvents } from '@/lib/api'
import {
  OPS_TABS,
  attentionItems,
  hotIps,
  isOpsTab,
  staleBackups,
  type AttentionKey,
  type OpsTab,
} from '@/lib/ops-signals'
import { useInstructor } from './InstructorLayout'
import { AttentionTab } from './ops/AttentionTab'
import { HealthTab } from './ops/HealthTab'
import { SetupTab } from './ops/SetupTab'
import { ToolsTab } from './ops/ToolsTab'
import { useSource } from './ops/useSource'

// Module-level so useSource sees a stable function and never re-runs on its own.
const readOverview = getSectionOverview
const readRisk = getAbsenceRisk
const readBackup = getBackupHealth
const readAuth = () => listAuthEvents(300)

const CHIP_LABEL: Record<AttentionKey, (n: number) => string> = {
  finalize: (n) => `${n} class${n === 1 ? '' : 'es'} to finalise`,
  requests: (n) => `${n} request${n === 1 ? '' : 's'} waiting`,
  risk: (n) => `${n} student${n === 1 ? '' : 's'} can still excuse`,
  backup: (n) => `${n} backup${n === 1 ? '' : 's'} behind`,
  signins: (n) => `${n} busy address${n === 1 ? '' : 'es'}`,
}

/**
 * Ops & trust: four short tabs instead of ten stacked cards, under one plate that says how many
 * things need you. Each source is read once, here, and handed down: the plate and the rows
 * beneath it are computed from the same numbers, so they cannot disagree. A source that fails
 * drops out of the plate (a signal we cannot read is not a signal) and says so on its own card.
 */
export function Ops() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { pending } = useInstructor()
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    getSectionHeadcounts()
      .then(setCounts)
      .catch(() => {})
  }, [])

  const [overview, reloadOverview] = useSource(readOverview, 'Could not read the class overview.')
  const [risk, reloadRisk] = useSource(readRisk, 'Could not read the risk overview.')
  const [backup, reloadBackup] = useSource(readBackup, "Couldn't read backup health.")
  const [auth, reloadAuth] = useSource(readAuth, "Couldn't read auth events.")

  const tabParam = params.get('tab')
  const tab: OpsTab = isOpsTab(tabParam) ? tabParam : 'attention'
  function changeTab(next: OpsTab) {
    const p = new URLSearchParams(params)
    if (next === 'attention') p.delete('tab')
    else p.set('tab', next)
    setParams(p, { replace: true })
  }

  const requests = pending.redemptions + pending.excuses + pending.reports
  const finalize = overview.status === 'ready' ? overview.data.reduce((n, s) => n + s.unfinalized, 0) : null
  const riskCount = risk.status === 'ready' ? risk.data.filter((r) => r.actionable > 0).length : null
  const backupBehind = backup.status === 'ready' ? staleBackups(backup.data, backup.at).length : null
  const hot = auth.status === 'ready' ? hotIps(auth.data, auth.at).length : null

  const items = attentionItems({ requests, finalize, risk: riskCount, backup: backupBehind, signins: hot })
  const settled = [overview, risk, backup, auth].every((s) => s.status !== 'loading')
  const refreshing = [overview, risk, backup, auth].some((s) => s.status === 'ready' && s.refreshing)

  function go(key: AttentionKey) {
    if (key === 'finalize') navigate('/teach/attendance')
    else if (key === 'requests') navigate('/teach/redemptions')
    else if (key === 'risk') changeTab('attention')
    else changeTab('health')
  }

  function reloadAll() {
    reloadOverview()
    reloadRisk()
    reloadBackup()
    reloadAuth()
  }

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Ops & trust"
        subtitle="What the system has been doing while you were not looking."
        fallback="/teach"
        actions={
          <button
            type="button"
            onClick={reloadAll}
            disabled={refreshing}
            className="cp-tap-y px-2 text-sm font-semibold text-accent disabled:opacity-60"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <PeerPlate
        eyebrow="Right now"
        figure={!settled && items.length === 0 ? '…' : items.length > 0 ? String(items.length) : 'All clear'}
        unit={
          !settled && items.length === 0
            ? 'checking'
            : items.length > 0
              ? items.length === 1
                ? 'thing needs you'
                : 'things need you'
              : undefined
        }
        meta={
          settled && items.length === 0 ? (
            <span>Classes, requests, backups and sign-ins all look healthy.</span>
          ) : undefined
        }
      >
        {items.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="What needs you">
            {items.map((i) => (
              <li key={i.key}>
                <button
                  type="button"
                  onClick={() => go(i.key)}
                  className="cp-tap-y inline-flex h-9 items-center rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {CHIP_LABEL[i.key](i.count)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PeerPlate>

      <SegmentedControl
        label="Ops section"
        value={tab}
        onChange={changeTab}
        options={OPS_TABS}
        className="max-w-xl"
      />

      {tab === 'attention' && (
        <AttentionTab counts={{ requests: pending, finalize, backup: backupBehind, signins: hot }} onTab={changeTab} />
      )}
      {tab === 'tools' && <ToolsTab counts={counts} />}
      {tab === 'setup' && <SetupTab />}
      {tab === 'health' && (
        <HealthTab backup={backup} reloadBackup={reloadBackup} auth={auth} reloadAuth={reloadAuth} />
      )}
    </div>
  )
}
