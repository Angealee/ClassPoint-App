import { useRouteError } from 'react-router-dom'

/**
 * Friendly route-level error screen (replaces React Router's default crash
 * page). Deliberately imports nothing heavy: its most common real-world
 * trigger is a stale lazy chunk 404ing right after a deploy — a state where
 * fancy shared components may themselves fail to load, and where Reload is
 * the actual fix.
 */
export function RouteError() {
  const error = useRouteError()
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'statusText' in error
        ? String((error as { statusText: unknown }).statusText)
        : String(error)

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 font-display text-2xl font-bold text-brand-500">
        !
      </div>
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Something broke on our side</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Your data is fine. This usually happens right after an update — reloading almost always
          fixes it.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 rounded-xl bg-brand-500 px-5 text-sm font-medium text-white transition-transform active:scale-[0.98]"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.href = '/'
          }}
          className="h-11 rounded-xl border border-line px-5 text-sm font-medium text-ink transition-transform active:scale-[0.98]"
        >
          Go home
        </button>
      </div>
      {message && (
        <details className="max-w-sm text-xs text-muted">
          <summary className="cursor-pointer">Technical detail</summary>
          <p className="mt-1 break-words">{message}</p>
        </details>
      )}
    </div>
  )
}
