/**
 * The beta disclaimer, on every Student Space screen.
 *
 * Not dismissible, by decision. A student who dismissed it on day one and hits
 * a bug on day thirty has no context for what happened — and "your messages
 * might get wiped during testing" is the kind of expectation that has to hold
 * for the whole beta, not until someone taps an ×.
 *
 * One line, `text-2xs`, accent tint. It is a disclaimer, not a warning: gold or
 * red here would make every screen look like something had gone wrong.
 */
export function BetaBanner() {
  return (
    <p className="rounded-xl border border-accent-solid/25 bg-accent-solid/8 px-3 py-2 text-2xs font-medium text-accent">
      Student Space is in beta — things will change, and things will break.
    </p>
  )
}
