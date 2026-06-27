-- ============================================================================
-- ClassPoint · 0012 · Move the midday leaderboard settle to 12:30 PM
-- Run after 0011. Safe to re-run (idempotent).
--
-- The board settles twice a day. The morning slot moves from 7:30 AM to
-- 12:30 PM Manila; the evening slot stays at 7:30 PM.
--
--   12:30 PM Asia/Manila (UTC+8) == 04:30 UTC  ->  '30 4 * * *'
--    7:30 PM Asia/Manila (UTC+8) == 11:30 UTC  ->  '30 11 * * *'  (unchanged)
--
-- Keep these in sync with SNAPSHOT_HOURS in src/lib/time.ts (local clock, used
-- for the "next update in Xh Ym" countdown).
-- ============================================================================

-- Retire the old 7:30 AM job (named "-am"); ignore if it isn't scheduled.
do $$
begin
  perform cron.unschedule('classpoint-leaderboard-am');
exception when others then
  null;
end
$$;

-- Schedule the new midday (12:30 PM Manila) settle. cron.schedule upserts by
-- name, so re-running just retargets it.
select cron.schedule(
  'classpoint-leaderboard-noon', '30 4 * * *',
  $$select public.refresh_leaderboard_snapshot_notify();$$
);

-- Re-affirm the evening (7:30 PM Manila) settle — unchanged, here for clarity.
select cron.schedule(
  'classpoint-leaderboard-pm', '30 11 * * *',
  $$select public.refresh_leaderboard_snapshot_notify();$$
);
