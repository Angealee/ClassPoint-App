import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon, DownloadIcon } from '@/components/ui/icons'
import { usePwaInstall } from '@/lib/pwa'
import { cn } from '@/lib/cn'

type Guide = 'ios' | 'inapp' | 'unavailable'

/**
 * "Install app" button that adapts to every situation so nobody hits a dead end:
 *  - installable → fires the native prompt
 *  - installed   → "Installed ✓"
 *  - ios         → Add-to-Home-Screen steps
 *  - inapp       → "open in your real browser first" steps (Messenger/FB/IG…)
 *  - unavailable → generic install-via-browser guidance
 */
export function InstallButton({ className }: { className?: string }) {
  const { state, isIos, promptInstall } = usePwaInstall()
  const { toast } = useToast()
  const [guide, setGuide] = useState<Guide | null>(null)

  if (state === 'installed') {
    return (
      <Button variant="outline" className={cn('shrink-0', className)} disabled>
        <CheckIcon className="h-5 w-5 text-gold-500" /> Installed
      </Button>
    )
  }

  async function onClick() {
    if (state === 'installable') {
      const outcome = await promptInstall()
      if (outcome === 'accepted') toast('Installing ClassPoint…', 'success')
      else if (outcome === 'unavailable') setGuide('unavailable')
      return
    }
    setGuide(state === 'ios' ? 'ios' : state === 'inapp' ? 'inapp' : 'unavailable')
  }

  return (
    <>
      <Button variant="outline" className={cn('shrink-0', className)} onClick={() => void onClick()}>
        <DownloadIcon className="h-5 w-5" /> Install app
      </Button>
      <InstallGuideSheet guide={guide} isIos={isIos} onClose={() => setGuide(null)} />
    </>
  )
}

function InstallGuideSheet({
  guide,
  isIos,
  onClose,
}: {
  guide: Guide | null
  isIos: boolean
  onClose: () => void
}) {
  const title =
    guide === 'ios'
      ? 'Install on iPhone / iPad'
      : guide === 'inapp'
        ? 'Open in your browser first'
        : 'Install ClassPoint'

  return (
    <Sheet open={guide !== null} onClose={onClose} title={title}>
      {guide === 'inapp' && (
        <p className="mb-3 text-sm text-muted">
          You're viewing ClassPoint inside another app (like Messenger or Facebook), which can't
          install it. Open it in your browser first:
        </p>
      )}
      <ol className="space-y-3 text-sm text-ink">
        {guideSteps(guide, isIos).map((step, i) => (
          <li key={i} className="flex gap-3">
            <Step n={i + 1} />
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </Sheet>
  )
}

function guideSteps(guide: Guide | null, isIos: boolean): ReactNode[] {
  if (guide === 'ios') {
    return [
      <>
        Tap the <strong>Share</strong> icon in Safari's toolbar.
      </>,
      <>
        Choose <strong>Add to Home Screen</strong>.
      </>,
      <>
        Tap <strong>Add</strong> — ClassPoint now opens like an app.
      </>,
    ]
  }
  if (guide === 'inapp') {
    return isIos
      ? [
          <>
            Tap the <strong>•••</strong> or <strong>Share</strong> menu, then{' '}
            <strong>Open in Safari</strong>.
          </>,
          <>
            In Safari, tap <strong>Share</strong> → <strong>Add to Home Screen</strong> →{' '}
            <strong>Add</strong>.
          </>,
        ]
      : [
          <>
            Tap the <strong>⋮</strong> menu (top-right), then{' '}
            <strong>Open in Chrome</strong> (or your browser).
          </>,
          <>
            In Chrome, tap <strong>⋮</strong> → <strong>Install app</strong> /{' '}
            <strong>Add to Home screen</strong>.
          </>,
        ]
  }
  // unavailable
  return isIos
    ? [
        <>
          Open ClassPoint in <strong>Safari</strong> (not another browser).
        </>,
        <>
          Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> → <strong>Add</strong>.
        </>,
      ]
    : [
        <>
          Open ClassPoint in <strong>Chrome</strong> or <strong>Edge</strong>.
        </>,
        <>
          Tap the <strong>⋮</strong> menu → <strong>Install app</strong> /{' '}
          <strong>Add to Home screen</strong>.
        </>,
        <>Already installed? Open ClassPoint from your home screen instead.</>,
      ]
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
      {n}
    </span>
  )
}
