import type { ChangelogEntry } from '@/lib/changelog'

/**
 * Renders a list of changelog entries — shared by the auto "What's new" sheet
 * (unseen entries) and the "What's new" button in Profile (the full history).
 * Text is sized up for readability so updates actually get noticed.
 */
export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  return (
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
                  <p className="flex items-center gap-2 text-base font-bold">
                    <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{section.heading}</span>
                    {section.major && (
                      <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-brand-500">
                        Major
                      </span>
                    )}
                  </p>
                  <ul className="mt-2 space-y-2 pl-5">
                    {section.items.map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-ink/80">
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
