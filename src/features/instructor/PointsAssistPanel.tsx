import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/Toast'
import { listGradeAssistDefaults, saveGradeAssistDefaults } from '@/lib/api'
import { boostTermsError, formatMarks } from '@/lib/grade-boost'
import { parseScoreInput } from '@/lib/grade-entry'
import { COMPONENT_LABEL } from '@/lib/grading'
import { errorText } from '@/lib/errors'
import type { GradeAssistDefault, Subject } from '@/lib/types'

type Part = GradeAssistDefault['component']

/** Recitation is not here: it is attendance, so there is no mark to add to (0063). */
const PARTS: Part[] = ['performance_task', 'quiz', 'exam']

interface Draft {
  on: boolean
  cost: string
  bonus: string
}

const EMPTY: Draft = { on: false, cost: '', bonus: '' }

/**
 * Points assist, once per PART (0063): "a quiz costs 5 points for 3 marks".
 *
 * Every column of an enabled part is open to a student the moment THEIR mark is
 * in — nothing to switch on per column. A column can still carry its own terms or
 * be switched off from the Columns tab, and an absent student is always refused.
 *
 * ── SCOPE IS SUBJECT-WIDE, AND SAYS SO ─────────────────────────────────────
 * These terms reach every section taking the subject (like weights, unlike
 * columns). The sheet header names that, and so does the first line here — the
 * ambiguity is the reason weights were once kept off the grade sheet.
 *
 * ── NO CONFIRM, ON PURPOSE ─────────────────────────────────────────────────
 * Unlike weights, saving these moves no grade: it changes what a student MAY ask
 * for, and requests already waiting are untouched (each carries the terms the
 * student agreed to). Every request is still approved by hand.
 */
export function PointsAssistPanel({
  subject,
  sectionCount,
}: {
  subject: Subject
  /** How many sections take this subject — the real reach of a change. */
  sectionCount: number
}) {
  const { toast } = useToast()
  const [drafts, setDrafts] = useState<Record<Part, Draft> | null>(null)
  const [saved, setSaved] = useState<Record<Part, Draft> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    listGradeAssistDefaults(subject.id)
      .then((rows) => {
        if (cancelled) return
        const next = {} as Record<Part, Draft>
        for (const p of PARTS) {
          const d = rows.find((r) => r.component === p)
          next[p] = d
            ? { on: true, cost: String(d.pointsCost), bonus: formatMarks(d.pointsBonus) }
            : EMPTY
        }
        setDrafts(next)
        setSaved(next)
        setLoadError(null)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(errorText(e, 'Could not load the points-assist terms.'))
      })
    return () => {
      cancelled = true
    }
  }, [subject.id, attempt])

  if (loadError) {
    return (
      <ErrorState
        onRetry={() => {
          setLoadError(null)
          setAttempt((n) => n + 1)
        }}
        detail="Points assist needs migration 0063 applied."
      >
        {loadError}
      </ErrorState>
    )
  }
  if (!drafts || !saved) return <ListSkeleton rows={3} />

  /** One part's terms, parsed — or the sentence saying why they can't be saved. */
  function check(d: Draft): { error: string | null; terms: { cost: number; bonus: number } | null } {
    if (!d.on) return { error: null, terms: null }
    const costN = d.cost.trim() === '' ? null : /^\d+$/.test(d.cost.trim()) ? Number(d.cost.trim()) : NaN
    const bonusParsed = parseScoreInput(d.bonus)
    const bonusN = bonusParsed.ok ? bonusParsed.value : NaN
    if (costN === null || bonusN === null) return { error: 'Fill in the points and the marks.', terms: null }
    // No column maximum applies here (columns differ), so only the shape is checked;
    // the cap at each column's own maximum happens when a student asks.
    const error = boostTermsError(costN, bonusN, Number.POSITIVE_INFINITY)
    return error ? { error, terms: null } : { error: null, terms: { cost: costN, bonus: bonusN } }
  }

  const checks = Object.fromEntries(PARTS.map((p) => [p, check(drafts[p])])) as Record<
    Part,
    ReturnType<typeof check>
  >
  const anyError = PARTS.some((p) => checks[p].error !== null)
  const dirty = PARTS.some(
    (p) =>
      drafts[p].on !== saved[p].on ||
      (drafts[p].on && (drafts[p].cost !== saved[p].cost || drafts[p].bonus !== saved[p].bonus)),
  )

  function patch(part: Part, over: Partial<Draft>) {
    setDrafts((d) => (d ? { ...d, [part]: { ...d[part], ...over } } : d))
  }

  async function save() {
    setBusy(true)
    try {
      await saveGradeAssistDefaults(
        subject.id,
        PARTS.map((p) => ({ component: p, terms: checks[p].terms ? { pointsCost: checks[p].terms!.cost, pointsBonus: checks[p].terms!.bonus } : null })),
      )
      setSaved(drafts)
      toast('Points assist saved.', 'success')
    } catch (e) {
      toast(errorText(e, 'Could not save the points-assist terms.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Turn a part on and every column in it is open to a student as soon as their mark is in —
        nothing to switch on column by column. Students who were absent can’t use points, and you
        approve every request.
      </p>
      <p className="text-xs text-muted">
        These terms apply to {sectionCount === 1 ? 'the' : 'all'}{' '}
        <b className="text-ink">{sectionCount}</b> section{sectionCount === 1 ? '' : 's'} taking{' '}
        {subject.code}, in every term. Recitation isn’t listed: it is attendance, so there is no
        mark to add to.
      </p>

      {PARTS.map((part) => {
        const d = drafts[part]
        const c = checks[part]
        return (
          <Card key={part} pad="tight" className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 font-medium">{COMPONENT_LABEL[part]}</p>
              <Toggle
                on={d.on}
                label={`Offer points assist on ${COMPONENT_LABEL[part]}`}
                onChange={(next) => patch(part, { on: next })}
              />
            </div>
            {d.on && (
              <div className="flex items-end gap-2">
                <Input
                  value={d.cost}
                  inputMode="numeric"
                  onChange={(e) => patch(part, { cost: e.target.value })}
                  wrapperClassName="min-w-0 flex-1"
                  aria-label={`Points a student spends on ${COMPONENT_LABEL[part]}`}
                  placeholder="Points"
                  hint="Points spent"
                />
                <Input
                  value={d.bonus}
                  inputMode="decimal"
                  onChange={(e) => patch(part, { bonus: e.target.value })}
                  wrapperClassName="min-w-0 flex-1"
                  aria-label={`Marks added to ${COMPONENT_LABEL[part]}`}
                  placeholder="Marks"
                  hint="Marks added"
                />
              </div>
            )}
            {c.error ? (
              <p className="text-2xs text-danger">{c.error}</p>
            ) : c.terms ? (
              <p className="text-2xs text-muted">
                A student whose mark is in can spend{' '}
                <span className="font-semibold text-ink">{c.terms.cost} points</span> to add{' '}
                <span className="font-semibold text-ink">{formatMarks(c.terms.bonus)} marks</span>{' '}
                to any {COMPONENT_LABEL[part].toLowerCase()} column — never past that column’s
                maximum. Once per column.
              </p>
            ) : (
              <p className="text-2xs text-muted">
                Off: no {COMPONENT_LABEL[part].toLowerCase()} column is offered unless it carries
                its own terms.
              </p>
            )}
          </Card>
        )
      })}

      <Button
        loading={busy}
        disabled={!dirty || anyError}
        onClick={() => void save()}
        className="w-full"
      >
        Save
      </Button>
    </div>
  )
}
