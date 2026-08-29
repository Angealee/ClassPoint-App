import { Textarea } from '@/components/ui/Textarea'
import { useMemo, useState, type FormEvent } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { sendBroadcast } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { useInstructor } from './InstructorLayout'

const TITLE_MAX = 80
const BODY_MAX = 300

/**
 * Announcement composer (Phase G).
 *
 * The only feature in the app that pushes to every student at once, and a push
 * cannot be recalled — so the confirm dialog states the real recipient COUNT
 * rather than a vague "all students", and the count comes from the roster the
 * screen already holds rather than from a guess.
 *
 * It goes through the same `notifications` outbox as everything else, so the
 * bell history, retry sweep and delivery need no special cases.
 */
export function Broadcast({ counts }: { counts: Record<string, number> }) {
  const { sections } = useInstructor()
  const { toast } = useToast()

  // '' = every section this semester.
  const [target, setTarget] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  // Summed over THIS SEMESTER's sections only, never over every key in
  // `counts` — the headcount map is global, while send_broadcast targets the
  // active semester. Summing the map would promise a number it won't reach.
  const allRecipients = useMemo(
    () => sections.reduce((sum, s) => sum + (counts[s.id] ?? 0), 0),
    [sections, counts],
  )
  const recipients = target ? (counts[target] ?? 0) : allRecipients

  const targetName = target ? (sections.find((s) => s.id === target)?.name ?? 'that section') : null
  const canSend = title.trim().length > 0 && title.length <= TITLE_MAX && body.length <= BODY_MAX

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSend) return
    setConfirm(true)
  }

  async function send() {
    setBusy(true)
    try {
      const n = await sendBroadcast({
        title: title.trim(),
        body: body.trim(),
        sectionId: target || null,
      })
      // Report what the SERVER actually reached, not what we predicted — if the
      // two ever disagree, the number that matters is the one that sent.
      toast(`Sent to ${n} student${n === 1 ? '' : 's'}.`, 'success')
      setTitle('')
      setBody('')
      setConfirm(false)
    } catch (e) {
      toast(errorText(e, "Couldn't send that announcement."), 'error')
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Send an announcement</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">
        Goes to students' notifications and their lock screens. It can't be
        unsent.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="bc-target">
            Send to
          </label>
          <select
            id="bc-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-base"
          >
            <option value="">All sections ({allRecipients} students)</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({counts[s.id] ?? 0} students)
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Class cancelled tomorrow"
          maxLength={TITLE_MAX}
          hint={`${title.length}/${TITLE_MAX} — this is the bold line on the lock screen.`}
          required
        />

        <div className="w-full">
          <Textarea
            id="bc-body"
            label="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={BODY_MAX}
            placeholder="No IT 32 tomorrow — we'll cover the missed topic on Friday."
          />
          <p className="mt-1 text-xs text-muted">
            {body.length}/{BODY_MAX}
          </p>
        </div>

        <Button
          type="submit"
          size="lg"
          className={cn('w-full', !canSend && 'opacity-60')}
          disabled={!canSend || recipients === 0}
        >
          {recipients === 0
            ? 'No students to send to'
            : `Review — ${recipients} recipient${recipients === 1 ? '' : 's'}`}
        </Button>
      </form>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void send()}
        busy={busy}
        title={`Send to ${recipients} student${recipients === 1 ? '' : 's'}?`}
        message={
          <>
            <span className="font-semibold text-ink">{title.trim()}</span>
            {body.trim() && <span className="mt-1 block text-muted">{body.trim()}</span>}
          </>
        }
        detail={
          target
            ? `Everyone in ${targetName} gets this on their phone. It can't be unsent.`
            : `Everyone in all ${sections.length} sections gets this on their phone. It can't be unsent.`
        }
        confirmLabel="Send now"
      />
    </Card>
  )
}
