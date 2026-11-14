import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { CheckIcon, ClipboardIcon, ClockIcon, LockIcon, ShieldIcon, TicketIcon } from '@/components/ui/icons'
import type { OpsTab } from '@/lib/ops-signals'
import { RiskOverview } from '../RiskOverview'
import { IconTile, LedgerRow } from './parts'

export interface AttentionCounts {
  requests: { redemptions: number; excuses: number; reports: number }
  /** Each is null when its source could not be read. */
  finalize: number | null
  backup: number | null
  signins: number | null
}

function State({ count, unit }: { count: number | null; unit: string }) {
  if (count === null) {
    return (
      <Chip tone="neutral" size="sm">
        Unavailable
      </Chip>
    )
  }
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
        <CheckIcon className="h-3.5 w-3.5" aria-hidden />
        Clear
      </span>
    )
  }
  return (
    <Chip tone="warn" size="sm">
      {count} {unit}
    </Chip>
  )
}

/**
 * The things that are waiting on you, as a stable checklist. A row stays even at zero ("Clear"):
 * a list that grows and shrinks teaches you to scan for what changed, and a fixed one lets you
 * glance at it and know.
 */
export function AttentionTab({ counts, onTab }: { counts: AttentionCounts; onTab: (t: OpsTab) => void }) {
  const navigate = useNavigate()
  const { redemptions, excuses, reports } = counts.requests
  const requests = redemptions + excuses + reports

  const tile = (icon: ReactNode, tone: 'warn' | 'success' | 'neutral') => <IconTile tone={tone}>{icon}</IconTile>
  const tone = (n: number | null) => (n === null ? 'neutral' : n > 0 ? 'warn' : 'success')

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section>
        <SectionLabel>Waiting on you</SectionLabel>
        <Card pad="none" className="mt-2 divide-y divide-line">
          <LedgerRow
            icon={tile(<ClockIcon className="h-5 w-5" />, tone(counts.finalize))}
            title="Classes to finalise"
            text={
              counts.finalize
                ? 'Ended classes whose absence penalties were never applied.'
                : 'Every ended class has been finalised.'
            }
            right={<State count={counts.finalize} unit={counts.finalize === 1 ? 'class' : 'classes'} />}
            onClick={() => navigate('/teach/attendance')}
          />
          <LedgerRow
            icon={tile(<TicketIcon className="h-5 w-5" />, tone(requests))}
            title="Requests"
            text={
              requests === 0
                ? 'No points requests, excuses or reports waiting.'
                : [
                    redemptions > 0 && `${redemptions} points`,
                    excuses > 0 && `${excuses} excuse${excuses === 1 ? '' : 's'}`,
                    reports > 0 && `${reports} report${reports === 1 ? '' : 's'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
            }
            right={<State count={requests} unit="waiting" />}
            onClick={() => navigate('/teach/redemptions')}
          />
          <LedgerRow
            icon={tile(<LockIcon className="h-5 w-5" />, tone(counts.backup))}
            title="Backups"
            text={counts.backup ? 'Some tables have not been copied since yesterday.' : 'Every table was copied last night.'}
            right={<State count={counts.backup} unit="behind" />}
            onClick={() => onTab('health')}
          />
          <LedgerRow
            icon={tile(<ShieldIcon className="h-5 w-5" />, tone(counts.signins))}
            title="Sign-in activity"
            text={
              counts.signins
                ? 'An address has failed five or more times in the last 15 minutes.'
                : 'No unusual claim or PIN-reset activity.'
            }
            right={<State count={counts.signins} unit={counts.signins === 1 ? 'address' : 'addresses'} />}
            onClick={() => onTab('health')}
          />
          <LedgerRow
            icon={tile(<ClipboardIcon className="h-5 w-5" />, 'neutral')}
            title="Peer evaluations"
            text="Open one, close it, or release results."
            onClick={() => navigate('/teach/peer')}
          />
        </Card>
      </section>

      <RiskOverview />
    </div>
  )
}
