/**
 * Shared plumbing for the api modules.
 *
 * These were private helpers inside the old single-file api.ts; the split made
 * them cross-module so they're exported here. Only api/* should import this —
 * screens go through the '@/lib/api' barrel.
 */
import { supabase } from '@/lib/supabase'

/**
 * Normalise a PostgREST embedded relation to a single row.
 *
 * A many-to-one embed (`subjects(code, name)` through a FK) comes back as an
 * OBJECT at runtime, but supabase-js's generated types often infer an array.
 * Rather than fight the inference at every call site, accept both shapes.
 */
export function oneEmbed<T>(value: unknown): T | null {
  if (!value) return null
  return (Array.isArray(value) ? ((value[0] as T) ?? null) : (value as T)) || null
}
/**
 * Retry a Supabase call once behind a forced session refresh. Guards against the
 * transient "Invalid Refresh Token / JWT expired" 400 that supabase-js can throw
 * when a request races its own background token refresh — the hiccup a manual
 * page reload used to clear.
 */
/**
 * Call a mutating RPC behind withAuthRetry.
 *
 * Safe to apply blanket-wide, including to non-idempotent writes: the retry
 * fires ONLY on the auth classifications below (401 / PGRST301 / expired JWT /
 * refresh token). Those are rejections at the auth layer, before PostgREST ever
 * reaches the table — so the first attempt provably did not run. A dropped
 * response after a successful commit does NOT match, and rethrows.
 */
export async function rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
  return withAuthRetry(async () => {
    const { data, error } = await supabase.rpc(name, args)
    if (error) throw error
    return data as T
  })
}

export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const err = e as { status?: number; code?: string; message?: string } | null
    const msg = (err?.message ?? '').toLowerCase()
    const isAuthBlip =
      err?.status === 401 ||
      err?.code === 'PGRST301' ||
      msg.includes('jwt') ||
      msg.includes('token is expired') ||
      msg.includes('refresh token')
    if (!isAuthBlip) throw e
    await supabase.auth.getSession() // refreshes if the access token is stale
    return fn()
  }
}
/**
 * Page through a table — Supabase caps responses at 1000 rows, and a term of
 * point_events can exceed that. Ordering makes the pagination stable.
 */
export async function fetchAllRows<T>(
  table: string,
  columns: string,
  orderBy: string,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/**
 * fetchAllRows for arbitrary queries: the caller builds a FRESH query per page
 * (supabase builders are single-use) and this loops `.range()` until a short
 * page. Same 1000-row-cap rationale; the query MUST carry a stable order (add a
 * unique tiebreaker column) or rows can duplicate/skip across page boundaries.
 */
export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}
