import { supabase } from '@/lib/supabase'

export function oneEmbed<T>(value: unknown): T | null {
  if (!value) return null
  return (Array.isArray(value) ? ((value[0] as T) ?? null) : (value as T)) || null
}
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

export function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
