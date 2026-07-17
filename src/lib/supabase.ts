import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * True once a Supabase project has been wired up via `.env`.
 * The app shell renders without it; data features check this flag.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[ClassPoint] Supabase env not set. Copy .env.example to .env and add your ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable data features.',
  )
}

// Falls back to harmless placeholders so import-time never throws; any real
// network call will simply fail until the env is configured.
export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
)

/**
 * A realtime channel whose topic is unique to THIS subscription.
 *
 * Why this exists: `supabase.channel(topic)` does not always make a new
 * channel — if one with that topic is already registered it hands the existing
 * one back (RealtimeClient.channel → `return exists`). Calling `.on()` on a
 * channel that has already subscribed throws:
 *
 *   cannot add `postgres_changes` callbacks for realtime:<topic> after `subscribe()`
 *
 * Two ordinary situations hit that:
 *   1. A component that renders more than once — e.g. anything passed to
 *      Shell's `actions`, which is rendered in BOTH the desktop sidebar and the
 *      mobile header. Both instances mount (only one is visible), the first
 *      subscribes, and the second's `.on()` lands on a channel that is already
 *      joining. This is what broke /teach.
 *   2. A remount racing the teardown: `removeChannel` awaits `unsubscribe()`
 *      before the topic leaves the registry, so the next `channel(sameTopic)`
 *      can still hand back the dying one — which is how a channel ends up
 *      silently dead instead of resubscribed (see StudentData.tsx's comment).
 *
 * A per-subscription suffix sidesteps both. Pair it with `removeChannel` on
 * unmount (page-scoped channel discipline) and nothing leaks.
 *
 * Use this for page-scoped channels. The one durable per-student channel in
 * StudentData.tsx deliberately keeps a stable topic — see the comment there.
 */
export function uniqueChannel(prefix: string) {
  return supabase.channel(`${prefix}-${Math.random().toString(36).slice(2, 10)}`)
}
