import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  const message =
    '[ClassPoint] Supabase env not set. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
    'are required. Copy .env.example to .env locally, or set them in the Vercel ' +
    'project settings and redeploy.'
  if (import.meta.env.PROD) throw new Error(message)
  console.warn(message)
}

export const supabase = createClient<Database>(
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

export function uniqueChannel(prefix: string) {
  return supabase.channel(`${prefix}-${Math.random().toString(36).slice(2, 10)}`)
}
