import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Rows } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ErrorState, EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { AstronautArt } from '@/components/space/AstronautArt'
import { EventComposer } from './EventComposer'
import { Link } from 'react-router-dom'
import {
  getSpaceFlag,
  listSpaceSections,
  listSpaceTimeouts,
  setSectionSpace,
  setSpaceFlag,
  clearSpaceTimeout,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import type { SpaceAdminSection, SpaceTimeout } from '@/lib/types'
import { cn } from '@/lib/cn'

/**
 * `/teach/space` — the Student Space control room.
 *
 * Both gates live here together, which is the point: during a beta you flip the
 * roster and the kill switch in the same sitting, and splitting them across
 * ManageSections and Ops would mean hunting for the lever precisely when you
 * are in a hurry to pull it.
 *
 * Phase 6 grows the Random Event composer onto this screen; Phase 5 adds the
 * report queue to /teach/redemptions. The timeout list is here now because the
 * enforcement it drives ships in 0041.
 */

/** The pill-shaped on/off used by both gates. Not a native checkbox: it needs a busy state. */
function Toggle({
  on,
  busy,
  onChange,
  label,
}: {
  on: boolean
  busy?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
        on ? 'bg-success-solid' : 'bg-card-2 ring-1 ring-line',
      )}
    >
      <span
        className={cn(
          'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left]',
          on ? 'left-6' : 'left-1',
        )}
      />
    </button>
  )
}

export function InstructorSpace() {
  const { toast } = useToast()
  const [flag, setFlag] = useState<boolean | null>(null)
  const [sections, setSections] = useState<SpaceAdminSection[]>([])
  const [timeouts, setTimeouts] = useState<SpaceTimeout[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [liftTarget, setLiftTarget] = useState<SpaceTimeout | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [f, s, t] = await Promise.all([
        getSpaceFlag(),
        listSpaceSections(),
        listSpaceTimeouts(),
      ])
      setFlag(f)
      setSections(s)
      setTimeouts(t)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleSection(row: SpaceAdminSection, next: boolean) {
    setBusyKey(row.sectionId)
    try {
      await setSectionSpace(row.sectionId, next)
      setSections((rows) =>
        rows.map((r) => (r.sectionId === row.sectionId ? { ...r, spaceEnabled: next } : r)),
      )
      toast(
        next
          ? `${row.sectionName} is in the beta.`
          : `${row.sectionName} removed from the beta.`,
        'success',
      )
    } catch (e) {
      toast(errorText(e, 'Could not change that section.'), 'error')
    } finally {
      setBusyKey(null)
    }
  }

  async function applyFlag(next: boolean) {
    setBusyKey('flag')
    try {
      await setSpaceFlag(next)
      setFlag(next)
      toast(next ? 'Student Space is back on.' : 'Student Space paused for everyone.', 'success')
    } catch (e) {
      toast(errorText(e, 'Could not change that.'), 'error')
    } finally {
      setBusyKey(null)
      setPauseOpen(false)
    }
  }

  async function liftTimeout(row: SpaceTimeout) {
    setBusyKey(row.studentId)
    try {
      await clearSpaceTimeout(row.studentId)
      setTimeouts((rows) => rows.filter((r) => r.studentId !== row.studentId))
      toast(`${row.displayName} can post again.`, 'success')
    } catch (e) {
      toast(errorText(e, 'Could not lift that timeout.'), 'error')
    } finally {
      setBusyKey(null)
      setLiftTarget(null)
    }
  }

  const enabledCount = sections.filter((s) => s.spaceEnabled).length
  const reach = sections
    .filter((s) => s.spaceEnabled)
    .reduce((n, s) => n + s.studentCount, 0)

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="Student Space"
        subtitle="Beta roster, mutes, and the master switch."
        fallback="/teach"
      />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : failed ? (
        <ErrorState onRetry={() => void load()}>Could not load the Student Space settings.</ErrorState>
      ) : (
        <>
          {/* The instructor IS a participant in Global and every section room —
              the database always allowed it, there was simply no screen. */}
          <Link to="/teach/space/chats" className="block">
            <Card pad="roomy" interactive>
              <div className="flex items-center gap-3">
                <AstronautArt variant="lounge" size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Chats</p>
                  <p className="text-sm text-muted">
                    Global, every section room, and any DM you are part of.
                  </p>
                </div>
                <span className="shrink-0 text-lg text-muted">›</span>
              </div>
            </Card>
          </Link>

          <EventComposer />

          {/* ── The kill switch ─────────────────────────────────────────────
              Pausing goes through ConfirmDialog because it takes the feature
              away from everyone at once; turning it back ON does not, since
              restoring service is never the dangerous direction. */}
          <div>
            <SectionLabel>Master switch</SectionLabel>
            <Card pad="roomy">
              <div className="flex items-start gap-4">
                <AstronautArt variant="space" size="sm" className={flag ? '' : 'opacity-40'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {flag ? 'Running' : 'Paused for everyone'}
                    </p>
                    <Chip tone={flag ? 'success' : 'warn'} size="sm" dot>
                      {flag ? 'On' : 'Off'}
                    </Chip>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {flag
                      ? 'Beta sections can post and chat. Turn this off to close Student Space instantly, without removing anyone from the beta.'
                      : 'Every beta section sees the Paused screen. Nothing is deleted, and nobody has lost their place.'}
                  </p>
                </div>
                <Toggle
                  on={!!flag}
                  busy={busyKey === 'flag'}
                  label="Student Space master switch"
                  onChange={(next) => (next ? void applyFlag(true) : setPauseOpen(true))}
                />
              </div>
            </Card>
          </div>

          {/* ── The beta roster ─────────────────────────────────────────── */}
          <div>
            <SectionLabel
              action={
                <span className="text-xs text-muted">
                  {enabledCount === 0
                    ? 'nobody yet'
                    : `${enabledCount} section${enabledCount === 1 ? '' : 's'} · ${reach} student${reach === 1 ? '' : 's'}`}
                </span>
              }
            >
              Beta sections
            </SectionLabel>
            {sections.length === 0 ? (
              <EmptyState>No sections in the active semester yet.</EmptyState>
            ) : (
              <Rows>
                {sections.map((row) => (
                  <div
                    key={row.sectionId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.sectionName}</p>
                      <p className="text-xs text-muted">
                        {row.studentCount} student{row.studentCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Toggle
                      on={row.spaceEnabled}
                      busy={busyKey === row.sectionId}
                      label={`Student Space for ${row.sectionName}`}
                      onChange={(next) => void toggleSection(row, next)}
                    />
                  </div>
                ))}
              </Rows>
            )}
          </div>

          {/* ── Timeouts ────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Muted students</SectionLabel>
            {timeouts.length === 0 ? (
              <EmptyState>Nobody is muted.</EmptyState>
            ) : (
              <Rows>
                {timeouts.map((row) => (
                  <div
                    key={row.studentId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.displayName}</p>
                      <p className="truncate text-xs text-muted">
                        {row.sectionName ?? 'No section'} · until{' '}
                        {new Date(row.until).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                        {row.reason ? ` · ${row.reason}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyKey === row.studentId}
                      onClick={() => setLiftTarget(row)}
                      className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-danger disabled:opacity-50"
                    >
                      Lift
                    </button>
                  </div>
                ))}
              </Rows>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={pauseOpen}
        title="Pause Student Space?"
        message="Every beta section loses the Lounge and chats immediately."
        detail="Nothing is deleted and nobody leaves the beta — flip this back on and it all returns."
        confirmLabel="Pause it"
        busy={busyKey === 'flag'}
        onConfirm={() => void applyFlag(false)}
        onClose={() => setPauseOpen(false)}
      />

      <ConfirmDialog
        open={!!liftTarget}
        title="Lift this timeout?"
        message={
          <>
            <span className="font-semibold text-ink">{liftTarget?.displayName}</span> will be able
            to post again straight away.
          </>
        }
        confirmLabel="Lift it"
        variant="default"
        busy={busyKey === liftTarget?.studentId}
        onConfirm={() => liftTarget && void liftTimeout(liftTarget)}
        onClose={() => setLiftTarget(null)}
      />
    </div>
  )
}
