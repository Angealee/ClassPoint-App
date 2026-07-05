import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
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
      <div className="space-y-6">
        {entries.map((entry) => (
          <section key={entry.version}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-xl font-bold">{entry.title}</h3>
              <span className="shrink-0 text-xs text-muted">v{entry.version}</span>
            </div>
            <p className="text-sm text-muted">{formatDate(entry.date)}</p>

            {entry.sections ? (
              // Main update → sub-module updates.
              <div className="mt-4 space-y-4">
                {entry.sections.map((section, si) => (
                  <div key={si}>
                    <p className="flex items-start gap-2.5 text-base font-bold">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                      <span>{section.heading}</span>
                    </p>
                    <ul className="mt-2 space-y-2 pl-5">
                      {section.items.map((item, i) => (
                        <li
                          key={i}
                          className="flex gap-2.5 text-[0.95rem] leading-relaxed text-ink/80"
                        >
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {entry.items?.map((item, i) => (
                  <li key={i} className="flex gap-2.5 text-base leading-relaxed">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <Button size="lg" className="mt-5 w-full" onClick={dismiss}>
        Got it
      </Button>
    </Sheet>
  )
}

/** "Jun 23, 2026" from an ISO date. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
