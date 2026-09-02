/**
 * The data layer's public surface.
 *
 * ALL Supabase access lives under src/lib/api/ — one module per domain — and is
 * re-exported here, so every screen keeps importing from '@/lib/api' exactly as
 * before. The split is organisational: no call site changed.
 *
 * Adding a query? Put it in the domain module it belongs to, not here.
 */
export * from './api/core'
export * from './api/attendance'
export * from './api/backup'
export * from './api/excuses'
export * from './api/comments'
export * from './api/redemptions'
export * from './api/rewards'
export * from './api/notifications'
export * from './api/ops'
export * from './api/rollover'
export * from './api/space'
