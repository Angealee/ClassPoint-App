import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { CopyIcon } from '@/components/ui/icons'
import { resetStudentPin } from '@/lib/api'

/**
 * Issue a one-time PIN-reset code for a student. Self-contained (manages its
 * own token + copy) so any instructor screen can drop it in.
 */
export function ResetPinSheet({
  student,
  open,
  onClose,
}: {
  student: { id: string; fullName: string; username: string | null } | null
  open: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Each fresh open starts without a stale token.
  useEffect(() => {
    if (open) setToken(null)
  }, [open, student?.id])

  async function generate() {
    if (!student) return
    setBusy(true)
    try {
      const { token: t } = await resetStudentPin(student.id)
      setToken(t)
    } catch {
      toast('Could not create a reset code.', 'error')
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    if (!token) return
    navigator.clipboard?.writeText(token).then(
      () => toast('Reset code copied', 'success'),
      () => {},
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={token ? 'Reset code created' : 'Reset PIN?'}>
      {token ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Give this one-time code to{' '}
            <span className="font-semibold text-ink">{student?.fullName}</span>. They enter it on
            the <span className="font-medium text-ink">Forgot your PIN?</span> screen to set a new
            PIN. It expires in 24 hours and works once.
          </p>
          <div className="flex items-center justify-between rounded-xl border border-line bg-card-2 px-4 py-3">
            <span className="font-mono text-lg font-bold tracking-widest">{token}</span>
            <button
              type="button"
              onClick={copy}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-500 hover:bg-brand-500/10"
              aria-label="Copy reset code"
            >
              <CopyIcon className="h-5 w-5" />
            </button>
          </div>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Create a one-time reset code for{' '}
            <span className="font-semibold text-ink">{student?.fullName}</span>
            {student?.username ? <> (@{student.username})</> : null}. Their current PIN keeps
            working until they use the code, so it's safe to generate.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={busy}>
              {busy ? 'Creating…' : 'Create reset code'}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
