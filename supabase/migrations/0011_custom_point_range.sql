-- ============================================================================
-- ClassPoint · 0011 · Wider custom point range
-- Run after 0010. Safe to re-run (idempotent).
--
-- WHY: migration 0007 capped every award at `points between -5 and 5`, so the
-- instructor's "Custom" amount (anything beyond the +1..+5 presets) was rejected
-- by Postgres — awarding e.g. +10 silently failed with a check-constraint error.
--
-- This widens the allowed magnitude to ±100 (still never 0). A student's
-- lifetime_points stays SUM(points) clamped at 0 (see cp_recompute_points in
-- 0007), and the table's `lifetime_points >= 0` check still holds, so XP/level
-- math is unaffected. Keep this max in sync with MAX_POINTS in Award.tsx.
-- ============================================================================

alter table public.point_events
  drop constraint if exists point_events_points_check;
alter table public.point_events
  add constraint point_events_points_check
  check (points between -100 and 100 and points <> 0);
