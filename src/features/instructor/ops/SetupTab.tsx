import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/Toast'
import { CalendarIcon, ClipboardIcon, SaturnIcon, TableIcon } from '@/components/ui/icons'
import { getStudentGradesEnabled, setStudentGradesEnabled } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { useInstructor } from '../InstructorLayout'
import { IconTile, LedgerRow } from './parts'
import { useSource } from './useSource'

const readGrades = getStudentGradesEnabled

export function SetupTab() {
  const navigate = useNavigate()
  const { semester } = useInstructor()

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <section>
        <SectionLabel>Switches</SectionLabel>
        <Card pad="none" className="mt-2 divide-y divide-line">
          <GradesSwitchRow />
          <LedgerRow
            icon={
              <IconTile>
                <SaturnIcon className="h-5 w-5" />
              </IconTile>
            }
            title="Student Space"
            text="Who is in the beta, muted students, and the switch that turns it all off."
            onClick={() => navigate('/teach/space')}
          />
        </Card>
      </section>

      <section>
        <SectionLabel>Setup</SectionLabel>
        <Card pad="none" className="mt-2 divide-y divide-line">
          <LedgerRow
            icon={
              <IconTile>
                <CalendarIcon className="h-5 w-5" />
              </IconTile>
            }
            title="Semester and subjects"
            text={
              semester
                ? `${semester.name}${semester.isActive ? ' · active' : ''}. Term dates, subjects and rollover.`
                : 'Term dates, subjects and rolling over to a new semester.'
            }
            onClick={() => navigate('/teach/semesters')}
          />
          <LedgerRow
            icon={
              <IconTile>
                <ClipboardIcon className="h-5 w-5" />
              </IconTile>
            }
            title="Peer evaluation"
            text="Teams, evaluations, results and release."
            onClick={() => navigate('/teach/peer')}
          />
          <LedgerRow
            icon={
              <IconTile>
                <TableIcon className="h-5 w-5" />
              </IconTile>
            }
            title="Grade sheets"
            text="Columns, weights and the import from your spreadsheet."
            onClick={() => navigate('/teach/grades')}
          />
        </Card>
      </section>
    </div>
  )
}

function GradesSwitchRow() {
  const { toast } = useToast()
  const [read, reload] = useSource(readGrades, 'Could not read the setting. This needs migration 0062 applied.')
  const [override, setOverride] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const on = override ?? (read.status === 'ready' ? read.data : null)

  const apply = useCallback(
    async (next: boolean) => {
      setBusy(true)
      try {
        const result = await setStudentGradesEnabled(next)
        setOverride(result.enabled)
        setConfirming(false)
        toast(
          next
            ? result.notified > 0
              ? `Students can now see their grades, ${result.notified} notified.`
              : 'Students can now see their grades.'
            : 'Grades are hidden again, students still see their scores.',
          'success',
        )
      } catch (e) {
        toast(errorText(e, 'Could not change that.'), 'error')
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )

  const failed = read.status === 'error'

  return (
    <>
      <LedgerRow
        icon={
          <IconTile tone={on ? 'success' : 'neutral'}>
            <TableIcon className="h-5 w-5" />
          </IconTile>
        }
        title="Student grades"
        text={
          failed ? (
            <>
              {read.message}{' '}
              <button type="button" onClick={reload} className="font-semibold text-accent">
                Try again
              </button>
            </>
          ) : on ? (
            'Students see their scores and their grade: the term figure and the part scores.'
          ) : (
            'Grades hidden. Students still see their scores and can use points assist, just not the grade.'
          )
        }
        right={
          on !== null ? (
            <Toggle
              on={on}
              busy={busy}
              label="Students can see their grades"
              onChange={(next) => (next ? setConfirming(true) : void apply(false))}
            />
          ) : undefined
        }
      />

      <ConfirmDialog
        open={confirming}
        variant="default"
        title="Open grades to students?"
        message="Every student will see a so-far grade for each subject and a score for each part, on top of the scores they can already see. Using points works the same either way."
        detail="Check the marks first. Every student in a class that has marks is sent a notification, and a student who has seen a grade has seen it."
        confirmLabel="Open grades"
        busy={busy}
        onConfirm={() => apply(true)}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
