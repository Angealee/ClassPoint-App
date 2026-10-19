import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { getSectionGradeSums, saveGradePolicy } from '@/lib/api'
import { computeImpact, type GradeImpact } from '@/lib/grade-impact'
import { DEFAULT_WEIGHTS, displayGrade, policyError, sumsToOne } from '@/lib/grading'
import { errorText } from '@/lib/errors'
import type { GradePolicy, GradeSumsRow, Subject, TermKey } from '@/lib/types'

/**
 * The weights for one subject, across all three terms.
 *
 * ⚠ THIS IS SUBJECT-WIDE, NOT SECTION-WIDE, and that is why it opens from the
 * Grades landing rather than from a grade sheet. A sheet is scoped to one
 * section, and editing weights from inside it would strongly imply the change
 * applied to that section alone — it applies to every section taking the
 * subject. The confirm says so in as many words, with the real count.
 *
 * Weights are typed as PERCENTAGES and stored as proportions. The two-field
 * splits balance themselves, so they cannot be made invalid; the three-field
 * ones show a running total and refuse to save until it reads 100%, because
 * auto-balancing three fields means guessing which of the other two was meant.
 */

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']
const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

/** A policy being edited: every weight a percentage, as typed. */
interface Draft {
  pt: string
  quiz: string
  recit: string
  cs: string
  exam: string
  final: string
  base: string
  span: string
}

const pct = (v: number): string => String(Math.round(v * 10000) / 100)
const num = (v: string): number => {
  const n = Number(v.trim())
  return Number.isFinite(n) ? n : NaN
}

function toDraft(p: GradePolicy): Draft {
  return {
    pt: pct(p.ptWeight),
    quiz: pct(p.quizWeight),
    recit: pct(p.recitWeight),
    cs: pct(p.csWeight),
    exam: pct(p.examWeight),
    final: pct(p.finalWeight),
    base: pct(p.transmuteBase),
    span: pct(p.transmuteSpan),
  }
}

function fromDraft(base: GradePolicy, d: Draft): GradePolicy {
  return {
    ...base,
    ptWeight: num(d.pt) / 100,
    quizWeight: num(d.quiz) / 100,
    recitWeight: num(d.recit) / 100,
    csWeight: num(d.cs) / 100,
    examWeight: num(d.exam) / 100,
    finalWeight: num(d.final) / 100,
    transmuteBase: num(d.base) / 100,
    transmuteSpan: num(d.span) / 100,
  }
}

interface WeightsSheetProps {
  open: boolean
  onClose: () => void
  subject: Subject
  policies: GradePolicy[]
  /** Every section taking this subject — what the change actually reaches. */
  sectionIds: string[]
  onSaved: () => void
}

export function WeightsSheet({
  open,
  onClose,
  subject,
  policies,
  sectionIds,
  onSaved,
}: WeightsSheetProps) {
  const { toast } = useToast()
  const [term, setTerm] = useState<TermKey>('prelim')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [impact, setImpact] = useState<GradeImpact | null>(null)

  useEffect(() => {
    if (!open) return
    const next: Record<string, Draft> = {}
    for (const p of policies) next[p.term] = toDraft(p)
    setDrafts(next)
    setAdvanced(false)
    setImpact(null)
  }, [open, policies])

  const draft = drafts[term]
  const policy = policies.find((p) => p.term === term)

  function patch(next: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [term]: { ...d[term], ...next } }))
  }

  /** The two-field split balances itself — it can never be made invalid. */
  function setPair(which: 'cs' | 'exam', value: string) {
    const n = num(value)
    const other = Number.isFinite(n) ? String(Math.round((100 - n) * 100) / 100) : ''
    patch(which === 'cs' ? { cs: value, exam: other } : { exam: value, cs: other })
  }

  const csTotal = draft ? num(draft.pt) + num(draft.quiz) + num(draft.recit) : NaN
  const finalTotal = TERMS.reduce((sum, t) => sum + (drafts[t] ? num(drafts[t].final) : NaN), 0)

  const next = useMemo(() => {
    if (policies.length === 0) return []
    return policies.map((p) => (drafts[p.term] ? fromDraft(p, drafts[p.term]) : p))
  }, [policies, drafts])

  const transmuteChanged = next.some(
    (p, i) =>
      p.transmuteBase !== policies[i]?.transmuteBase || p.transmuteSpan !== policies[i]?.transmuteSpan,
  )

  const problem = useMemo(() => {
    if (next.length < 3) return 'This subject is missing a term.'
    for (const p of next) {
      const err = policyError(p)
      if (err) return `${TERM_LABEL[p.term]}: ${err}`
    }
    if (!sumsToOne(next.map((p) => p.finalWeight))) {
      return `Prelim, Midterm and Finals must add up to 100%. They currently add up to ${
        Math.round(finalTotal * 100) / 100
      }%.`
    }
    return null
  }, [next, finalTotal])

  const dirty = useMemo(
    () =>
      next.some((p, i) => {
        const was = policies[i]
        return (
          !was ||
          p.ptWeight !== was.ptWeight ||
          p.quizWeight !== was.quizWeight ||
          p.recitWeight !== was.recitWeight ||
          p.csWeight !== was.csWeight ||
          p.examWeight !== was.examWeight ||
          p.finalWeight !== was.finalWeight ||
          p.transmuteBase !== was.transmuteBase ||
          p.transmuteSpan !== was.transmuteSpan
        )
      }),
    [next, policies],
  )

  /**
   * Work out what this would do BEFORE writing it.
   *
   * Reads every section taking the subject, because that is the real blast
   * radius and the instructor is looking at one subject card with no section on
   * screen. The diff itself is `computeImpact`, which runs the same functions
   * that produce the grades — a preview computed another way would be a second
   * opinion about the thing it is previewing.
   */
  async function preview() {
    if (problem) {
      toast(problem, 'error')
      return
    }
    setBusy(true)
    try {
      const all: GradeSumsRow[] = []
      for (const sectionId of sectionIds) {
        all.push(...(await getSectionGradeSums(sectionId, subject.id)))
      }
      setImpact(computeImpact(all, policies, next))
    } catch (e) {
      toast(errorText(e, 'Could not work out what this would change.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      for (const p of next) await saveGradePolicy(p)
      setImpact(null)
      onSaved()
      onClose()
      toast('Weights saved.', 'success')
    } catch (e) {
      toast(errorText(e, 'Could not save the weights.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={`${subject.code} weights`}>
        <div className="space-y-5">
          <p className="text-xs text-muted">
            These apply to <b className="text-ink">every section</b> taking {subject.code} —{' '}
            {sectionIds.length} right now. Points never feed any of this.
          </p>

          <SegmentedControl
            label="Term"
            value={term}
            onChange={setTerm}
            options={TERMS.map((t) => ({ value: t, label: TERM_LABEL[t] }))}
          />

          {!draft || !policy ? (
            <Card pad="tight" className="text-sm text-warn">
              {TERM_LABEL[term]} has no weights row. Re-run migration 0057 — it seeds all three.
            </Card>
          ) : (
            <>
              <Card pad="tight" className="space-y-3">
                <SectionLabel
                  action={
                    <Chip tone={Math.abs(csTotal - 100) < 0.01 ? 'success' : 'danger'}>
                      {Number.isFinite(csTotal) ? `${Math.round(csTotal * 100) / 100}%` : '—'}
                    </Chip>
                  }
                >
                  Class standing is made of
                </SectionLabel>
                <PercentField
                  label="Performance Tasks"
                  value={draft.pt}
                  onChange={(v) => patch({ pt: v })}
                />
                <PercentField label="Quizzes" value={draft.quiz} onChange={(v) => patch({ quiz: v })} />
                <PercentField
                  label="Recitation"
                  value={draft.recit}
                  onChange={(v) => patch({ recit: v })}
                />
                {Math.abs(csTotal - 100) >= 0.01 && (
                  <p className="text-xs text-danger">These three must add up to 100%.</p>
                )}
              </Card>

              <Card pad="tight" className="space-y-3">
                <SectionLabel>The term grade is</SectionLabel>
                <PercentField
                  label="Class standing"
                  value={draft.cs}
                  onChange={(v) => setPair('cs', v)}
                />
                <PercentField label="Exam" value={draft.exam} onChange={(v) => setPair('exam', v)} />
                <p className="text-2xs text-muted">
                  These two balance each other, so they always add up to 100%.
                </p>
              </Card>
            </>
          )}

          <Card pad="tight" className="space-y-3">
            <SectionLabel
              action={
                <Chip tone={Math.abs(finalTotal - 100) < 0.01 ? 'success' : 'danger'}>
                  {Number.isFinite(finalTotal) ? `${Math.round(finalTotal * 100) / 100}%` : '—'}
                </Chip>
              }
            >
              The final grade is
            </SectionLabel>
            {TERMS.map((t) =>
              drafts[t] ? (
                <PercentField
                  key={t}
                  label={TERM_LABEL[t]}
                  value={drafts[t].final}
                  onChange={(v) => setDrafts((d) => ({ ...d, [t]: { ...d[t], final: v } }))}
                />
              ) : null,
            )}
            {Math.abs(finalTotal - 100) >= 0.01 && (
              <p className="text-xs text-danger">
                The three terms must add up to 100%, or no final grade can be worked out at all.
              </p>
            )}
          </Card>

          <div>
            <button
              type="button"
              onClick={() => setAdvanced((a) => !a)}
              className="text-xs text-muted underline-offset-2 hover:underline"
            >
              {advanced ? 'Hide' : 'Show'} transmutation
            </button>
            {advanced && draft && (
              <Card pad="tight" className="mt-2 space-y-3">
                <p className="text-xs text-muted">
                  Every component is transmuted as{' '}
                  <b className="text-ink">(raw ÷ total × span + base) × 100</b>. A base of 60% is
                  what makes {displayGrade(60)} the lowest possible grade. Changing these moves{' '}
                  <b className="text-ink">every grade this subject has ever produced</b>.
                </p>
                <PercentField label="Base" value={draft.base} onChange={(v) => patch({ base: v })} />
                <PercentField label="Span" value={draft.span} onChange={(v) => patch({ span: v })} />
                <p className="text-2xs text-muted">
                  DCT&rsquo;s standard is {pct(DEFAULT_WEIGHTS.transmuteBase)}% base and{' '}
                  {pct(DEFAULT_WEIGHTS.transmuteSpan)}% span.
                </p>
              </Card>
            )}
          </div>

          {problem && (
            <Card pad="tight" className="border-danger bg-danger-solid/10 text-sm text-danger">
              {problem}
            </Card>
          )}

          <Button
            className="w-full"
            loading={busy}
            disabled={!dirty || problem !== null}
            onClick={() => void preview()}
          >
            {dirty ? 'Review the change' : 'No changes'}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={impact !== null}
        title="Save these weights?"
        variant="danger"
        message={
          impact
            ? impact.changed === 0
              ? `No grade changes — all ${impact.total} students land on the same figure.`
              : `${impact.changed} of ${impact.total} grades change across ${sectionIds.length} section${
                  sectionIds.length === 1 ? '' : 's'
                }.`
            : ''
        }
        detail={impact ? <ImpactDetail impact={impact} /> : undefined}
        confirmLabel="Save weights"
        busy={busy}
        // A transmutation edit is the one change that moves every grade the
        // subject has ever produced, so it gets the typed-name challenge the
        // other destructive actions in this app use.
        challengeText={transmuteChanged ? subject.code : undefined}
        onConfirm={() => void save()}
        onClose={() => setImpact(null)}
      />
    </>
  )
}

function ImpactDetail({ impact }: { impact: GradeImpact }) {
  if (impact.changed === 0) {
    return <span>Nothing moves by as much as a hundredth of a point.</span>
  }
  return (
    <div className="space-y-2">
      <p>
        {impact.averageDelta !== null && (
          <>
            Average move {impact.averageDelta >= 0 ? '+' : ''}
            {Math.round(impact.averageDelta * 100) / 100}.{' '}
          </>
        )}
        {impact.appearing > 0 && (
          <b>
            {impact.appearing} grade{impact.appearing === 1 ? '' : 's'} appear
            {impact.appearing === 1 ? 's' : ''}.{' '}
          </b>
        )}
        {impact.disappearing > 0 && (
          <b>
            {impact.disappearing} grade{impact.disappearing === 1 ? '' : 's'} disappear
            {impact.disappearing === 1 ? 's' : ''}.{' '}
          </b>
        )}
      </p>
      <ul className="space-y-1">
        {impact.movers.slice(0, 5).map((m) => (
          <li key={m.studentId} className="flex items-center justify-between gap-3 tabular-nums">
            <span className="min-w-0 truncate">{m.fullName}</span>
            <span className="shrink-0">
              {displayGrade(m.before)} → {displayGrade(m.after)}
              {m.delta !== null && (
                <span className={m.delta >= 0 ? 'text-success' : 'text-danger'}>
                  {' '}
                  ({m.delta >= 0 ? '+' : ''}
                  {Math.round(m.delta * 100) / 100})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {impact.movers.length > 5 && (
        <p className="text-2xs">…and {impact.movers.length - 5} more, moving less.</p>
      )}
    </div>
  )
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <Input
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        wrapperClassName="w-20 shrink-0"
        className="text-center"
      />
      <span className="w-4 shrink-0 text-sm text-muted">%</span>
    </div>
  )
}
