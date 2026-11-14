import { useEffect, useMemo, useRef, useState } from 'react'
import { PointsPicker, useBoostRequest } from '@/components/points/BoostSpend'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Meter } from '@/components/ui/Meter'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ChevronDownIcon, TableIcon, TicketIcon } from '@/components/ui/icons'
import { useStudentData } from '@/features/student/StudentData'
import { rateTone } from '@/lib/attendance'
import { cn } from '@/lib/cn'
import { formatMarks, pointsGain } from '@/lib/grade-boost'
import {
  TERM_TITLE,
  boostColumns,
  boostReason,
  type AvailableBoost,
  type BoostColumn,
} from '@/lib/student-grades'
import { COMPONENT_LABEL } from '@/lib/grading'
import { TONE } from '@/lib/tone'

export function GradeColumns({
  available,
  tooMany,
  highlightId,
  onRequested,
}: {
  /** Points not already promised to a waiting request. */
  available: number
  tooMany: boolean
  highlightId: string | null
  onRequested: () => void
}) {
  const { grades, gradesLoading, gradesError, reloadGrades, semesterEnded } = useStudentData()
  const { ask, dialog } = useBoostRequest(onRequested)

  const subjects = useMemo(() => grades?.subjects ?? [], [grades])
  const { actionable, other } = useMemo(() => boostColumns(subjects), [subjects])

  const [otherOpen, setOtherOpen] = useState(false)
  const highlightInOther = highlightId !== null && other.some((c) => c.item.id === highlightId)
  const showOther = otherOpen || highlightInOther

  // Bring the linked column into view, once per link.
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightId || scrolledFor.current === highlightId) return
    const el = rowRefs.current.get(highlightId)
    if (!el) return
    scrolledFor.current = highlightId
    el.scrollIntoView({ block: 'center' })
  }, [highlightId, grades, showOther])

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }

  return (
    <div>
      <SectionLabel>Your grade columns</SectionLabel>

      {gradesLoading && !grades ? (
        <ListSkeleton rows={2} />
      ) : gradesError && !grades ? (
        <ErrorState onRetry={() => void reloadGrades()}>Couldn’t load your grade columns.</ErrorState>
      ) : !grades?.enabled ? (
        <EmptyState
          icon={<TableIcon />}
          description="Quizzes, tasks and exams open for points assist appear here once your instructor opens grades."
        >
          Grades aren’t open yet.
        </EmptyState>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={<TableIcon />}
          description="Columns appear here as soon as your instructor sets them up."
        >
          Nothing has been set up for your class yet.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {semesterEnded && (
            <p className="rounded-lg bg-card-2 px-3 py-2 text-xs text-muted">
              This semester has ended, so points assist is closed.
            </p>
          )}

          {actionable.length === 0 ? (
            <EmptyState
              icon={<TableIcon />}
              description="A quiz, task or exam appears here as soon as your mark is in, 1 point adds 1 mark, up to the maximum. A column you were absent for can’t be assisted."
            >
              None of your columns can use points right now.
            </EmptyState>
          ) : (
            <ActionableList
              columns={actionable}
              available={available}
              tooMany={tooMany}
              locked={semesterEnded}
              highlightId={highlightId}
              register={register}
              onPick={ask}
            />
          )}

          {other.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setOtherOpen((o) => !o)}
                aria-expanded={showOther}
                className="cp-tap-y flex w-full items-center gap-1.5 px-1 text-left text-xs font-semibold text-muted"
              >
                Not available yet ({other.length})
                <ChevronDownIcon
                  className={cn('h-3.5 w-3.5 transition-transform', showOther && 'rotate-180')}
                />
              </button>
              {showOther && (
                <Card pad="none" className="mt-1 divide-y divide-line">
                  {other.map((c) => (
                    <OtherRow
                      key={c.item.id}
                      column={c}
                      highlighted={c.item.id === highlightId}
                      register={register(c.item.id)}
                    />
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {dialog}
    </div>
  )
}

function ActionableList({
  columns,
  available,
  tooMany,
  locked,
  highlightId,
  register,
  onPick,
}: {
  columns: Array<BoostColumn<AvailableBoost>>
  available: number
  tooMany: boolean
  locked: boolean
  highlightId: string | null
  register: (id: string) => (el: HTMLElement | null) => void
  onPick: (c: BoostColumn<AvailableBoost>, points: number) => void
}) {
  const [openId, setOpenId] = useState<string | null>(() =>
    highlightId && columns.some((c) => c.item.id === highlightId) ? highlightId : null,
  )

  const scopes: Array<{
    key: string
    title: string
    parts: Array<{ key: string; label: string; items: Array<BoostColumn<AvailableBoost>> }>
  }> = []
  for (const c of columns) {
    const scopeKey = `${c.subject.subjectId}:${c.item.term}`
    let scope = scopes[scopes.length - 1]
    if (!scope || scope.key !== scopeKey) {
      scope = { key: scopeKey, title: `${c.subject.code} · ${TERM_TITLE[c.item.term]}`, parts: [] }
      scopes.push(scope)
    }
    const part = scope.parts[scope.parts.length - 1]
    if (part && part.key === c.item.component) part.items.push(c)
    else scope.parts.push({ key: c.item.component, label: COMPONENT_LABEL[c.item.component], items: [c] })
  }

  return (
    <div className="space-y-6">
      {scopes.map((s) => (
        <section key={s.key} className="space-y-3">
          <p className="px-1 text-2xs font-semibold uppercase tracking-widest text-muted">{s.title}</p>
          {s.parts.map((p) => (
            <div key={p.key}>
              <h3 className="mb-2 px-1 text-sm font-semibold">{p.label}</h3>
              <Card pad="none" className="divide-y divide-line">
                {p.items.map((c) => (
                  <BoostRow
                    key={c.item.id}
                    column={c}
                    available={available}
                    tooMany={tooMany}
                    locked={locked}
                    open={openId === c.item.id}
                    highlighted={c.item.id === highlightId}
                    register={register(c.item.id)}
                    onToggle={() => setOpenId((cur) => (cur === c.item.id ? null : c.item.id))}
                    onPick={(points) => onPick(c, points)}
                  />
                ))}
              </Card>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function BoostRow({
  column,
  available,
  tooMany,
  locked,
  open,
  highlighted,
  register,
  onToggle,
  onPick,
}: {
  column: BoostColumn<AvailableBoost>
  available: number
  tooMany: boolean
  locked: boolean
  open: boolean
  highlighted: boolean
  register: (el: HTMLElement | null) => void
  onToggle: () => void
  onPick: (points: number) => void
}) {
  const { item, state } = column
  const pct = item.maxScore > 0 ? (state.score / item.maxScore) * 100 : 0
  const tone = rateTone(pct)
  const [chosen, setChosen] = useState<number | null>(null)
  const shown = Math.max(0, Math.min(chosen ?? Math.min(state.maxPoints, available), state.maxPoints, available))
  const gain = open ? pointsGain(shown, state.score, item.maxScore) : 0

  return (
    <div
      ref={register}
      className={cn('p-3.5', highlighted && 'bg-accent-solid/8 ring-2 ring-inset ring-[var(--color-ring)]')}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="text-xs tabular-nums text-muted">
            <span className={cn('font-semibold', TONE[tone].text)}>{formatMarks(state.score)}</span>
            {gain > 0 && (
              <>
                <span className="px-1">→</span>
                <span className="font-semibold text-ink">{formatMarks(state.score + gain)}</span>
              </>
            )}{' '}
            / {formatMarks(item.maxScore)}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="cp-tap-y inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-2 hover:underline"
        >
          <TicketIcon className="h-4 w-4" aria-hidden />
          {open ? 'Close' : 'Use points'}
        </button>
      </div>

      <Meter
        value={pct}
        max={100}
        size="sm"
        tone={tone}
        label={`${item.name}: ${Math.round(pct)}%`}
        className="mt-1.5"
      />

      {open && (
        <PointsPicker
          column={column}
          available={available}
          tooMany={tooMany}
          locked={locked}
          onPick={onPick}
          onChosen={setChosen}
        />
      )}
    </div>
  )
}

function OtherRow({
  column,
  highlighted,
  register,
}: {
  column: BoostColumn
  highlighted: boolean
  register: (el: HTMLElement | null) => void
}) {
  const { subject, item, state } = column
  const tone =
    state.kind === 'boosted' ? 'reward' : state.kind === 'pending' ? 'warn' : 'neutral'

  return (
    <div
      ref={register}
      className={cn(
        'flex items-center gap-3 p-3.5',
        highlighted && 'bg-accent-solid/8 ring-2 ring-inset ring-[var(--color-ring)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.name}>
          {item.name}
        </p>
        <p className="truncate text-xs text-muted">
          {subject.code} · {TERM_TITLE[item.term]} · {COMPONENT_LABEL[item.component]}
        </p>
      </div>
      <Chip tone={tone} size="sm" className="max-w-[55%] truncate">
        {boostReason(state)}
      </Chip>
    </div>
  )
}

