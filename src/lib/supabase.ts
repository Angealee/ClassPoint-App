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
