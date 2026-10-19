import { useEffect, type ReactNode } from 'react'
import { ListSkeleton } from '@/components/ui/Skeleton'

/**
 * Shared chrome for the two grade print routes.
 *
 * ── WHY THIS FORCES THE LIGHT THEME INSTEAD OF HARDCODING COLOURS ───────────
 * `StudentReport` (0023-era) carries its own namespaced light-only stylesheet
 * so dark mode cannot leak onto paper. That works, but it means any component
 * it prints must exist twice — once in tokens, once in literals — and this
 * route prints `StudentGradeBreakdown`, which the record page also renders.
 *
 * The theme is a single `dark` class on `documentElement`, so removing it for
 * the life of this route gives every token its light value and the SAME
 * component prints correctly. One definition of the arithmetic, one of the
 * layout, and nothing to keep in step.
 */
export function useForcedLightTheme(): void {
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains('dark')
    if (wasDark) root.classList.remove('dark')
    return () => {
      // Restore on the way out, or going Back from a printout would silently
      // put the whole app in light mode.
      if (wasDark) root.classList.add('dark')
    }
  }, [])
}

interface PrintChromeProps {
  title: string
  subtitle?: string
  onBack: () => void
  loading?: boolean
  /**
   * Printed ON the paper, never only on screen. A failed load that renders as
   * an empty table reads as "nobody has a grade", which is the worst thing a
   * grade sheet can say by accident.
   */
  loadError?: string | null
  children: ReactNode
}

export function PrintChrome({
  title,
  subtitle,
  onBack,
  loading,
  loadError,
  children,
}: PrintChromeProps) {
  const stamp = new Date().toLocaleString()

  return (
    <div className="gp-root">
      <div className="gp-toolbar">
        <button type="button" onClick={onBack} className="gp-btn gp-btn-ghost">
          Back
        </button>
        <button type="button" onClick={() => window.print()} className="gp-btn gp-btn-primary">
          Print
        </button>
      </div>

      <div className="gp-page">
        <header className="gp-header">
          <h1>{title}</h1>
          {subtitle && <p className="gp-muted">{subtitle}</p>}
          {/* With no audit log on grades, this stamp is the only "as of" the
              printed sheet will ever carry. */}
          <p className="gp-muted gp-stamp">Generated {stamp}</p>
        </header>

        {loadError ? (
          <p className="gp-error">{loadError}</p>
        ) : loading ? (
          <ListSkeleton rows={6} />
        ) : (
          children
        )}
      </div>

      <style>{`
        .gp-root { background: #fff; min-height: 100vh; }
        .gp-toolbar {
          display: flex; gap: 10px; justify-content: flex-end;
          padding: 12px 16px; border-bottom: 1px solid #e5e5e5;
        }
        .gp-btn {
          /* 44px, not 40: these are real buttons pressed with a thumb, and 44
             is the floor Apple and Google both publish. */
          height: 44px; padding: 0 20px; border-radius: 10px;
          font-size: 14px; font-weight: 500; cursor: pointer; border: none;
        }
        .gp-btn-primary { background: #e11d2a; color: #fff; }
        .gp-btn-ghost { background: transparent; color: #333; border: 1px solid #ccc; }
        .gp-page { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; color: #111; }
        .gp-header { margin-bottom: 18px; }
        .gp-header h1 { font-size: 22px; font-weight: 800; margin: 0; }
        .gp-muted { color: #555; margin: 2px 0 0; font-size: 13px; }
        .gp-stamp { font-size: 12px; }
        .gp-error { color: #9f1239; font-weight: 600; }
        /* A phone cannot scroll a plain table, so it squeezes instead: measured at
           375px the sheet overflowed by 9px and every row stood 103px tall. The
           wrapper scrolls on screen and is released for print, where there is no
           viewport and a scroller would clip the sheet to one screenful. */
        .gp-scroll { overflow-x: auto; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
        .gp-table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: 12px; }
        .gp-table th, .gp-table td {
          border: 1px solid #ddd; padding: 6px 8px; text-align: center;
        }
        .gp-table th { background: #f5f5f5; font-weight: 700; }
        .gp-left { text-align: left; }
        .gp-strong { font-weight: 800; }
        .gp-note { color: #8a5a00; font-size: 11px; }
        .gp-weight { display: block; font-weight: 400; color: #666; font-size: 10px; }
        .gp-signatures {
          display: flex; gap: 48px; margin-top: 56px; font-size: 12px; color: #333;
        }
        .gp-signatures > div { flex: 1; }
        .gp-rule { border-top: 1px solid #333; margin-bottom: 6px; }

        @media print {
          .gp-toolbar { display: none !important; }
          /* Released for paper: there is no viewport to scroll, so a scroller
             here would print one screenful and silently drop the rest. */
          .gp-scroll { overflow: visible !important; }
          .gp-table { min-width: 0 !important; }
          .gp-page { max-width: none; padding: 0; }
          /* Repeat the header on every page — a second sheet of unlabelled
             numbers is unreadable. */
          thead { display: table-header-group; }
          tr, .gp-signatures { break-inside: avoid; }
        }
        @page { size: A4 portrait; margin: 14mm; }
      `}</style>
    </div>
  )
}
