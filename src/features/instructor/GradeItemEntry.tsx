import { useMemo, useState, type KeyboardEvent } from 'react'
import { Rows } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Meter } from '@/components/ui/Meter'
import { cn } from '@/lib/cn'
import { COMPONENT_LABEL, GRADE_COMPONENTS } from '@/lib/grading'
import { formatScoreInput, isOverMax, parseScoreInput } from '@/lib/grade-entry'
import { cellKey, type CellEdit } from './GradeGrid'
import type { GradeItem, RosterPerson } from '@/lib/types'

/**
 * Entering marks on a phone: one column at a time, down the roster.
 *
 * The grid is the right shape on a desktop and the wrong one here — a name plus
 * twenty columns cannot be read two columns at a time. This is the same data
 * and the same commit path, turned ninety degrees: pick the quiz you have just
 * marked, then type one number per student.
 *
 * It is mounted INSTEAD of the grid, never alongside it (see GradeSheet): two
 * editors would mean two inputs per cell, and the keyboard navigation and the
 * failed-cell flagging both assume one.
 */

interface GradeItemEntryProps {
  students: RosterPerson[]
  items: GradeItem[]
  scores: Map<string, number>
  failed: Set<string>
  onCommit: (edit: CellEdit, previous: number | null) => void
}

export function GradeItemEntry({ students, items, scores, failed, onCommit }: GradeItemEntryProps) {
  const [itemId, setItemId] = useState<string>(() => items[0]?.id ?? '')
  const item = items.find((i) => i.id === itemId) ?? items[0]

  // Seeded per item: switching columns re-reads the parent's map, which is
  // always current because every commit writes through to it.
  const [values, setValues] = useState<Map<string, number | null>>(new Map())
  const [badCell, setBadCell] = useState<{ studentId: string; reason: string } | null>(null)

  const current = useMemo(() => {
    if (!item) return new Map<string, number | null>()
    const m = new Map<string, number | null>()
    for (const s of students) {
      const own = values.get(`${item.id}:${s.id}`)
      if (own !== undefined) m.set(s.id, own)
      else {
        const v = scores.get(cellKey(item.id, s.id))
        m.set(s.id, v === undefined ? null : v)
      }
    }
    return m
  }, [item, students, scores, values])

  const marked = useMemo(
    () => [...current.values()].filter((v) => v !== null).length,
    [current],
  )

  if (!item) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        No score columns yet. Add one to start entering marks.
      </p>
    )
  }

  function commit(student: RosterPerson, el: HTMLInputElement) {
    if (!item) return
    const parsed = parseScoreInput(el.value)
    const previous = current.get(student.id) ?? null

    if (!parsed.ok) {
      setBadCell({ studentId: student.id, reason: parsed.reason })
      el.value = formatScoreInput(previous)
      return
    }

    setBadCell(null)
    el.value = formatScoreInput(parsed.value)
    if (previous === parsed.value) return

    setValues((m) => new Map(m).set(`${item.id}:${student.id}`, parsed.value))
    onCommit({ itemId: item.id, studentId: student.id, value: parsed.value }, previous)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.currentTarget.blur()
    // Walk down the roster, the way the grid's Enter does.
    const next = document.getElementById(`entry-${index + 1}`)
    if (next instanceof HTMLInputElement) {
      next.focus()
      next.select()
    }
  }

  return (
    <div className="space-y-3">
      <Select
        label="Score column"
        value={item.id}
        onChange={(e) => {
          setItemId(e.target.value)
          setBadCell(null)
        }}
      >
        {GRADE_COMPONENTS.map((c) => {
          const group = items.filter((i) => i.component === c)
          if (group.length === 0) return null
          return (
            <optgroup key={c} label={COMPONENT_LABEL[c]}>
              {group.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · out of {i.maxScore}
                </option>
              ))}
            </optgroup>
          )
        })}
      </Select>

      <div className="flex items-center gap-3">
        <Meter value={marked} max={students.length} className="flex-1" />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {marked} of {students.length} marked
        </span>
      </div>

      <Rows>
        {students.map((student, index) => {
          const value = current.get(student.id) ?? null
          const over = isOverMax(value, item.maxScore)
          const isBad = badCell?.studentId === student.id
          return (
            <div key={student.id} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1 truncate text-sm">{student.fullName}</span>
              <input
                id={`entry-${index}`}
                type="text"
                inputMode="decimal"
                defaultValue={formatScoreInput(value)}
                aria-label={`${item.name} for ${student.fullName}`}
                aria-invalid={isBad || undefined}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => commit(student, e.currentTarget)}
                onKeyDown={(e) => onKeyDown(e, index)}
                className={cn(
                  // text-base, or iOS zooms the page on every single cell.
                  'h-11 w-20 shrink-0 rounded-xl border border-line bg-canvas text-center text-base tabular-nums',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]',
                  isBad && 'border-danger text-danger',
                  !isBad && over && 'border-warn text-warn',
                  !isBad && failed.has(cellKey(item.id, student.id)) && 'border-danger',
                )}
              />
              <span className="w-10 shrink-0 text-right text-2xs text-muted">
                /{item.maxScore}
              </span>
            </div>
          )
        })}
      </Rows>

      {badCell && <p className="text-xs text-danger">{badCell.reason}</p>}
    </div>
  )
}
