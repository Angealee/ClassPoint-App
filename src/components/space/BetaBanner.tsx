/** A quiet one-line beta note. Kept small on purpose: a red box at the top of
 *  every Space screen read as an error, not a disclaimer. */
export function BetaBanner() {
  return (
    <p className="flex items-center gap-2 px-1 text-2xs text-muted">
      <span className="rounded-full bg-accent-solid/10 px-1.5 py-0.5 font-bold tracking-wide text-accent">
        BETA
      </span>
      Things may change or break while we build this out.
    </p>
  )
}
