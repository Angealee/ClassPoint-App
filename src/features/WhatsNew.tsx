import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { ChangelogList } from '@/components/changelog/ChangelogList'
import { LATEST_VERSION, setSeenVersion, unseenEntries, type ChangelogEntry } from '@/lib/changelog'

/**
 * Shows a "What's new" sheet on app open whenever the user has unseen changelog
 * entries. Dismissing marks the latest version as seen, so it won't reappear
 * until the next release. Driven entirely by src/lib/changelog.ts.
 */
export function WhatsNew() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const unseen = unseenEntries()
    if (unseen.length > 0) {
      setEntries(unseen)
      setOpen(true)
    }
  }, [])

  function dismiss() {
    setSeenVersion(LATEST_VERSION)
    setOpen(false)
  }

  return (
    <Sheet open={open} onClose={dismiss} title="What's new">
      <ChangelogList entries={entries} />
      <Button size="lg" className="mt-5 w-full" onClick={dismiss}>
        Got it
      </Button>
    </Sheet>
  )
}
