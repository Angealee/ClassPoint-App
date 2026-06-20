import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon, DownloadIcon } from '@/components/ui/icons'
import { usePwaInstall } from '@/lib/pwa'
import { cn } from '@/lib/cn'

/**
 * Explicit "Install app" button with all states visible:
 *  - installable → fires the native prompt
 *  - installed   → disabled "Installed ✓"
 *  - ios         → opens Add-to-Home-Screen steps
 *  - unavailable → disabled, with a hint to use a supporting browser
 */
export function InstallButton({ className }: { className?: string }) {
  const { state, promptInstall } = usePwaInstall()
  const { toast } = useToast()
  const [iosOpen, setIosOpen] = useState(false)

  if (state === 'installed') {
    return (
      <Button variant="outline" className={cn('shrink-0', className)} disabled>
        <CheckIcon className="h-5 w-5 text-gold-500" /> Installed
      </Button>
    )
  }

  if (state === 'ios') {
    return (
      <>
        <Button variant="outline" className={cn('shrink-0', className)} onClick={() => setIosOpen(true)}>
          <DownloadIcon className="h-5 w-5" /> Install app
        </Button>
        <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title="Install on iPhone / iPad">
          <ol className="space-y-3 text-sm text-ink">
            <li className="flex gap-3">
              <Step n={1} /> Tap the <span className="font-semibold">Share</span> icon in Safari's
              toolbar.
            </li>
            <li className="flex gap-3">
              <Step n={2} /> Choose{' '}
              <span className="font-semibold">Add to Home Screen</span>.
            </li>
            <li className="flex gap-3">
              <Step n={3} /> Tap <span className="font-semibold">Add</span> — ClassPoint now opens
              like an app.
            </li>
          </ol>
        </Sheet>
      </>
    )
  }

  const installable = state === 'installable'

  async function onInstall() {
    const outcome = await promptInstall()
    if (outcome === 'accepted') toast('Installing ClassPoint…', 'success')
  }

  return (
    <Button
      variant="outline"
      className={cn('shrink-0', className)}
      onClick={() => void onInstall()}
      disabled={!installable}
      title={installable ? 'Install ClassPoint' : 'Open in Chrome or Edge to install'}
    >
      <DownloadIcon className="h-5 w-5" /> Install app
    </Button>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
      {n}
    </span>
  )
}
