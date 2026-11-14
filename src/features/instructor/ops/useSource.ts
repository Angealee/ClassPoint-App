import { useCallback, useEffect, useState } from 'react'
import { errorText } from '@/lib/errors'

export type Source<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T; at: number; refreshing: boolean }

/**
 * One read for the Ops screen, kept apart from every other so a failure in one (a migration not
 * applied, a slow query) costs that card and nothing else. `fn` must be a stable reference: the
 * effect re-runs when it changes. The first load sets state only AFTER the request resolves, so
 * it is not a synchronous setState-in-effect; `reload` is an event handler and may set it freely.
 */
export function useSource<T>(fn: () => Promise<T>, failure: string) {
  const [state, setState] = useState<Source<T>>({ status: 'loading' })

  const run = useCallback(async () => {
    try {
      setState({ status: 'ready', data: await fn(), at: Date.now(), refreshing: false })
    } catch (e) {
      setState({ status: 'error', message: errorText(e, failure) })
    }
  }, [fn, failure])

  useEffect(() => {
    void run()
  }, [run])

  const reload = useCallback(() => {
    setState((s) => (s.status === 'ready' ? { ...s, refreshing: true } : { status: 'loading' }))
    void run()
  }, [run])

  return [state, reload] as const
}
