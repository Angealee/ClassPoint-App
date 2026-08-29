import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { CalendarIcon, QrIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { AttendanceSession } from './AttendanceSession'
import { AttendanceReview } from './AttendanceReview'
import {
  getActiveSession,
  getSession,
  listSessions,
  startClassSession,
  updateSessionSubject,
} from '@/lib/api'
import { groupByWeek, termLabel } from '@/lib/term'
import {
  deletePreset,
  loadPresets,
  savePreset,
  type SessionPreset,
} from '@/lib/session-presets'
import type { ClassSession, SessionSummary } from '@/lib/types'

type View = 'home' | 'live' | 'review'

const sessionDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Remembers the last subject started per section, so the picker pre-fills. */
const LAST_SUBJECT_KEY = 'cp_last_subject_'

/** How many weeks of sessions the Attendance tab shows before "See all". */
const RECENT_WEEKS = 2

export function Attendance() {
  const { sections, selectedSectionId, setSelectedSectionId, subjectsForSection } = useInstructor()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name ?? ''

  const [view, setView] = useState<View>('home')
  const [session, setSession] = useState<ClassSession | null>(null)
  const [checking, setChecking] = useState(true)

  // Start config (instructor control before each class).
  const [subjectId, setSubjectId] = useState('')
  const [topic, setTopic] = useState('')
  const [lateAfter, setLateAfter] = useState(10)
  const [absentAfter, setAbsentAfter] = useState(30)
  const [latePenalty, setLatePenalty] = useState(1)
  const [absentPenalty, setAbsentPenalty] = useState(5)
  const [applyPenalties, setApplyPenalties] = useState(true)
  const [starting, setStarting] = useState(false)
  const [presets, setPresets] = useState<SessionPreset[]>(() => loadPresets())
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)

  const [history, setHistory] = useState<SessionSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [tagging, setTagging] = useState<string>()

  /** Fill the form from a saved preset. Subject and topic are left alone. */
  function applyPreset(preset: SessionPreset) {
    setLateAfter(preset.lateAfterMin)
    setAbsentAfter(preset.absentAfterMin)
    setLatePenalty(preset.latePenalty)
    setAbsentPenalty(preset.absentPenalty)
    setApplyPenalties(preset.applyPenalties)
  }

  function onSavePreset() {
    const name = presetName.trim()
    if (!name) return
    setPresets(
      savePreset({
        name,
        lateAfterMin: lateAfter,
        absentAfterMin: absentAfter,
        latePenalty,
        absentPenalty,
        applyPenalties,
      }),
    )
    setPresetName('')
    setSavingPreset(false)
    toast(`Saved “${name}”.`, 'success')
  }

  const loadHistory = useCallback(async () => {
    if (!selectedSectionId) return
    setHistoryLoading(true)
    try {
      setHistory(await listSessions(selectedSectionId))
    } catch {
      /* non-fatal */
    } finally {
      setHistoryLoading(false)
    }
  }, [selectedSectionId])

  // On section change: resume any active session, else land on the config home.
  //
  // A pending ?review=<id> deep-link (from the session detail page) owns the
  // view instead — skip the reset so it isn't stomped back to home/live. Read
  // from searchParams at run time rather than depending on it: consuming the
  // param below clears it, and a dep would re-run this and reset the view.
  useEffect(() => {
    if (!selectedSectionId) return
    let cancelled = false
    const pendingReview = !!searchParams.get('review')
    if (!pendingReview) {
      setView('home')
      setSession(null)
    }
    setChecking(true)
    getActiveSession(selectedSectionId)
      .then((s) => {
        if (cancelled || pendingReview) return
        if (s) {
          setSession(s)
          setView('live')
        }
      })
      .catch(() => {
        // Silently swallowing this told the instructor "no live session" during
        // a transient blip — inviting them to start a SECOND one mid-class.
        if (!cancelled) toast('Could not check for a live class — pull to retry.', 'error')
      })
      .finally(() => !cancelled && setChecking(false))
    void loadHistory()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId, loadHistory])

  // Consume ?review=<id> once, then strip it from the URL so a refresh or a
  // later section switch behaves normally.
  const reviewConsumedRef = useRef(false)
  const reviewParam = searchParams.get('review')
  useEffect(() => {
    if (!reviewParam || reviewConsumedRef.current) return
    reviewConsumedRef.current = true
    getSession(reviewParam)
      .then((full) => {
        if (full) {
          setSession(full)
          setView('review')
        }
      })
      .catch(() => toast('Could not open that session.', 'error'))
      .finally(() => setSearchParams({}, { replace: true }))
  }, [reviewParam, setSearchParams, toast])

  const thresholdsValid = absentAfter >= lateAfter && lateAfter >= 0 && absentAfter >= 0

  // Subjects this section takes. Usually one or two, so chips beat a dropdown.
  const sectionSubjects = subjectsForSection(selectedSectionId)
  // A section with nothing assigned can still hold class (the RPC allows an
  // untagged session then) — being blocked by a setup gap would be worse.
  const subjectMissing = sectionSubjects.length > 0 && !subjectId

  // Default to the subject you ran last for this section: the same class meets
  // on the same day most weeks, so the common case stays a single tap.
  useEffect(() => {
    if (!selectedSectionId) {
      setSubjectId('')
      return
    }
    const remembered = localStorage.getItem(`${LAST_SUBJECT_KEY}${selectedSectionId}`)
    const available = subjectsForSection(selectedSectionId)
    setSubjectId(available.find((s) => s.id === remembered)?.id ?? available[0]?.id ?? '')
  }, [selectedSectionId, subjectsForSection])

  async function onStart() {
    if (!selectedSectionId || !thresholdsValid || subjectMissing) return
    setStarting(true)
    try {
      const s = await startClassSession({
        sectionId: selectedSectionId,
        subjectId: subjectId || null,
        topic,
        lateAfterMin: lateAfter,
        absentAfterMin: absentAfter,
        latePenalty,
        absentPenalty,
        applyPenalties,
      })
      if (subjectId) localStorage.setItem(`${LAST_SUBJECT_KEY}${selectedSectionId}`, subjectId)
      setSession(s)
      setView('live')
    } catch (e) {
      console.error('[attendance] start failed:', e)
      const msg = (e as { message?: string } | null)?.message
      toast(msg && msg.length <= 160 ? msg : 'Could not start the class. Try again.', 'error')
    } finally {
      setStarting(false)
    }
  }

  /** Assign a subject to a session that predates subjects (0028). */
  async function onTagSession(sessionId: string, subjectId: string) {
    setTagging(sessionId)
    try {
      await updateSessionSubject(sessionId, subjectId)
      await loadHistory()
    } catch {
      toast('Could not tag that session.', 'error')
    } finally {
      setTagging(undefined)
    }
  }

  function afterReview() {
    setSession(null)
    setView('home')
    void loadHistory()
  }

  const sectionSelect = (
    <Select
      aria-label="Section"
      value={selectedSectionId}
      onChange={(e) => setSelectedSectionId(e.target.value)}
      className="max-w-40 font-display font-bold ring-1 ring-brand-500/40"
    >
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  )

  // Newest week first, matching the list's newest-first order. Capped at two
  // weeks so "Recent sessions" stays recent — by finals the full list is 36+
  // rows, pushing the start-a-class controls off screen. The "See all & stats"
  // link carries the complete history.
  const weeks = useMemo(
    () => groupByWeek(history, (s) => s.startedAt).slice(0, RECENT_WEEKS),
    [history],
  )

  if (view === 'live' && session) {
    return <AttendanceSession session={session} sectionName={sectionName} onEnd={() => setView('review')} />
  }
  if (view === 'review' && session) {
    return <AttendanceReview session={session} sectionName={sectionName} onDone={afterReview} />
  }

  return (
    <div className="space-y-5">
      {/* Sticky, highlighted section bar — pins under the app header so the
          selected section is always in view and never scrolled past. */}
      <div className="sticky top-[52px] z-10 -mx-4 -mt-5 border-b border-brand-500/20 bg-canvas/85 px-4 py-3 backdrop-blur-md md:top-0 md:-mx-8 md:mt-0 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold">Attendance</h1>
          {sectionSelect}
        </div>
      </div>

      {/* Start a class */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
            <QrIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-bold">Start a class</p>
            <p className="text-xs text-muted">Students scan the QR to check in.</p>
          </div>
        </div>

        {sectionSubjects.length > 0 && (
          <div>
            <span className="mb-1.5 block text-sm font-medium">Subject</span>
            <div className="flex flex-wrap gap-2">
              {sectionSubjects.map((subject) => {
                const on = subject.id === subjectId
                return (
                  <button
                    key={subject.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSubjectId(subject.id)}
                    className={
                      on
                        ? 'rounded-xl border border-brand-500 bg-brand-500/10 px-3 py-2 text-left text-sm font-semibold text-brand-500'
                        : 'rounded-xl border border-line px-3 py-2 text-left text-sm font-medium text-muted transition-colors hover:text-ink'
                    }
                  >
                    <span className="block font-display font-bold">{subject.code}</span>
                    <span className="block text-xs opacity-80">{subject.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Saved settings. The thresholds and penalties are what you set once
            and reuse; subject and topic change every class, so a preset
            deliberately does not touch them. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Saved settings</span>
            <button
              type="button"
              onClick={() => setSavingPreset((v) => !v)}
              className="text-xs font-semibold text-brand-500"
            >
              {savingPreset ? 'Cancel' : 'Save current'}
            </button>
          </div>

          {savingPreset && (
            <div className="flex gap-2">
              <Input
                label=""
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g. Strict lecture"
                className="flex-1"
              />
              <Button
                className="shrink-0 self-end"
                disabled={!presetName.trim()}
                onClick={onSavePreset}
              >
                Save
              </Button>
            </div>
          )}

          {presets.length === 0 ? (
            <p className="text-xs text-muted">
              None yet — set your thresholds below, then tap Save current.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <span
                  key={preset.id}
                  className="inline-flex items-center overflow-hidden rounded-lg border border-line"
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="px-2.5 py-1 text-xs font-medium transition-colors hover:bg-card-2"
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresets(deletePreset(preset.id))}
                    aria-label={`Delete preset ${preset.name}`}
                    className="border-l border-line px-2 py-1 text-xs text-muted hover:text-brand-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Input
          label="Topic (optional)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Lecture 5: Big-O"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Late after (min)"
            type="number"
            inputMode="numeric"
            min={0}
            value={lateAfter}
            onChange={(e) => setLateAfter(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
          <Input
            label="Absent after (min)"
            type="number"
            inputMode="numeric"
            min={0}
            value={absentAfter}
            onChange={(e) => setAbsentAfter(Math.max(0, parseInt(e.target.value, 10) || 0))}
            error={!thresholdsValid ? 'Must be ≥ late' : undefined}
          />
          <Input
            label="Late penalty (pts)"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={latePenalty}
            onChange={(e) =>
              setLatePenalty(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))
            }
          />
          <Input
            label="Absent penalty (pts)"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={absentPenalty}
            onChange={(e) =>
              setAbsentPenalty(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))
            }
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Deduct penalties automatically</span>
            <span className="block text-xs text-muted">
              Off = record attendance only, no points deducted.
            </span>
          </span>
          <input
            type="checkbox"
            checked={applyPenalties}
            onChange={(e) => setApplyPenalties(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand-500"
          />
        </label>

        <Button
          size="lg"
          className="w-full"
          onClick={onStart}
          disabled={starting || checking || !selectedSectionId || !thresholdsValid || subjectMissing}
        >
          {checking
            ? 'Checking…'
            : subjectMissing
              ? 'Pick a subject first'
              : starting
                ? 'Starting…'
                : 'Start class & show QR'}
        </Button>
      </Card>

      {/* History — grouped by term week, newest first */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-muted">Recent sessions</h2>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/teach/history?tab=attendance')}
              className="text-xs font-semibold text-brand-500 transition-opacity hover:opacity-80"
            >
              See all & stats →
            </button>
          )}
        </div>
        {historyLoading ? (
          <ListSkeleton rows={3} />
        ) : history.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            No sessions yet. Start a class to take attendance.
          </Card>
        ) : (
          <div className="space-y-4">
            {weeks.map((w) => (
              <div key={w.week}>
                <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {w.term ? `${termLabel(w.term)} · ` : ''}
                  {w.label}
                </p>
                <Card className="divide-y divide-line">
                  {w.items.map((s) => (
                    <div key={s.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/teach/attendance/session/${s.id}`)}
                        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-card-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {s.topic || sessionDate(s.startedAt)}
                          </p>
                          <p className="text-xs text-muted">
                            {s.subjectCode ? `${s.subjectCode} · ` : ''}
                            {sessionDate(s.startedAt)}
                            {s.status === 'active'
                              ? ' · live now'
                              : !s.penaltiesCommitted
                                ? ' · not finalised'
                                : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs font-semibold tabular-nums">
                          <span className="text-success">{s.present}</span>
                          <span className="text-reward">{s.late}</span>
                          <span className="text-danger">{s.absent}</span>
                          {s.excused + s.irregular > 0 && (
                            <span className="text-muted">+{s.excused + s.irregular}</span>
                          )}
                        </div>
                      </button>
                      {/* Sessions from before subjects existed (0028). Tagging is
                          offered right here because this is the screen you're on
                          day to day; the chips vanish once nothing is untagged. */}
                      {!s.subjectId && sectionSubjects.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                          <span className="text-xs text-muted">Tag as</span>
                          {sectionSubjects.map((subject) => (
                            <button
                              key={subject.id}
                              type="button"
                              disabled={tagging === s.id}
                              onClick={() => onTagSession(s.id, subject.id)}
                              className="rounded-lg border border-line px-2 py-1 text-xs font-semibold text-muted transition-colors hover:border-brand-500 hover:text-brand-500 disabled:opacity-50"
                            >
                              {subject.code}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
