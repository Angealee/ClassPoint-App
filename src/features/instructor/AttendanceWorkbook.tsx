import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { TermKey } from '@/lib/types'
import { useInstructor } from './InstructorLayout'

const TERMS: { key: TermKey; label: string }[] = [
  { key: 'prelim', label: 'Prelim' },
  { key: 'midterm', label: 'Midterm' },
  { key: 'finals', label: 'Finals' },
]

/**
 * Per-term attendance export, one sheet per section (Phase G).
 *
 * Attendance only. The instructor's rule is that points are never converted
 * into a grade — they reach one solely through individually-approved
 * redemptions — so this workbook deliberately carries no points column and
 * computes no score. Raw counts plus the show-up rate the app already shows.
 */
export function AttendanceWorkbook() {
  const { sections, semester } = useInstructor()
  const { toast } = useToast()
  const [term, setTerm] = useState<TermKey>('prelim')
  const [busy, setBusy] = useState(false)

  async function download() {
    if (!semester) return
    setBusy(true)
    try {
      const { exportTermWorkbook } = await import('@/lib/export-attendance')
      await exportTermWorkbook(sections, term, semester.name)
      toast('Workbook downloaded.', 'success')
    } catch (e) {
      toast(errorText(e, "Couldn't build the workbook."), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Attendance workbook</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        One sheet per section: present, late, absent, excused, irregular and
        show-up rate for the term. Points are not included — they aren't part of
        a grade.
      </p>

      <div className="mb-3 flex gap-1.5">
        {TERMS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTerm(t.key)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              term === t.key ? 'bg-accent-solid text-white' : 'bg-card-2 text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full"
        disabled={busy || sections.length === 0 || !semester}
        onClick={() => void download()}
      >
        {busy
          ? 'Building…'
          : `Download ${TERMS.find((t) => t.key === term)?.label} · ${sections.length} section${
              sections.length === 1 ? '' : 's'
            }`}
      </Button>
    </Card>
  )
}
