import { useEffect, useState, type ReactNode } from 'react'
import { Sheet } from './Sheet'
import { Button } from './Button'
import { Spinner } from './Spinner'
import { WarningIcon } from './icons'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** What is about to happen, in plain words. */
  message: ReactNode
  detail?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  busy?: boolean
  challengeText?: string
  onChallengeChange?: (value: string) => void
  children?: ReactNode
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  challengeText,
  onChallengeChange,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const danger = variant === 'danger'
  const [typed, setTyped] = useState('')

  // A fresh open always starts with an empty challenge box.
  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const challengeMet =
    !challengeText || typed.trim().toLowerCase() === challengeText.trim().toLowerCase()

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose}>
      <div className="flex flex-col items-center gap-3 pb-1 text-center">
        {danger && (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-solid/12 text-danger">
            <WarningIcon className="h-6 w-6" />
          </span>
        )}
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted">{message}</p>
        {detail && (
          <p className="w-full rounded-xl border border-danger-solid/25 bg-danger-solid/8 px-3 py-2 text-xs font-medium text-danger">
            {detail}
          </p>
        )}
        {children && <div className="w-full pt-1 text-left">{children}</div>}
        {challengeText && (
          <div className="w-full pt-1 text-left">
            <p className="mb-1.5 text-xs font-medium text-muted">
              Type <span className="font-bold text-ink">{challengeText}</span> to confirm:
            </p>
            <input
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                onChallengeChange?.(e.target.value)
              }}
              placeholder={challengeText}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base outline-none placeholder:text-muted/50 focus:ring-2 focus:ring-ring/40"
            />
          </div>
        )}
        <div className="mt-2 flex w-full gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'primary' : 'gold'}
            className="flex-1"
            disabled={busy || !challengeMet}
            onClick={onConfirm}
          >
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
