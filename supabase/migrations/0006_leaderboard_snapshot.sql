-- ============================================================================
-- ClassPoint · 0006 · Leaderboard snapshot (twice-daily "settle")
-- Run after 0005.
--
-- Dashboards stay live, but the leaderboard only "settles" twice a day:
-- 7:30 AM and 7:30 PM Philippine Time (Asia/Manila, UTC+8).
-- pg_cron runs in UTC, so those map to 23:30 and 11:30 UTC.
--
-- Requires the pg_cron extension. On Supabase: Dashboard → Database →
-- Extensions → enable "pg_cron" first (or the CREATE EXTENSION below).
-- ============================================================================

create extension if not exists pg_cron;

-- Frozen ranking. Refilled wholesale on each refresh. -------------------------
create table if not exists public.leaderboard_snapshot (
  student_id      uuid primary key references public.students(id) on delete cascade,
  display_name    text    not null,
  section_id      uuid    not null,
  lifetime_points integer not null,
  rank            integer not null
);
create index if not exists leaderboard_snapshot_rank_idx
  on public.leaderboard_snapshot (rank);

-- Single-row metadata: when the current snapshot was captured. ----------------
create table if not exists public.leaderboard_meta (
  id          boolean primary key default true check (id),
  captured_at timestamptz not null default now()
);

-- Recompute the snapshot from current live points. ---------------------------
create or replace function public.refresh_leaderboard_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.leaderboard_snapshot;

  insert into public.leaderboard_snapshot
    (student_id, display_name, section_id, lifetime_points, rank)
  select
    s.id,
    s.display_name,
    s.section_id,
    s.lifetime_points,
    row_number() over (order by s.lifetime_points desc, s.display_name asc)
  from public.students s;

  insert into public.leaderboard_meta (id, captured_at)
       values (true, now())
  on conflict (id) do update set captured_at = excluded.captured_at;
end;
$$;

-- RLS: everyone signed in can read the frozen board; nobody writes directly. --
alter table public.leaderboard_snapshot enable row level security;
alter table public.leaderboard_meta     enable row level security;

drop policy if exists snapshot_select on public.leaderboard_snapshot;
create policy snapshot_select on public.leaderboard_snapshot
  for select to authenticated using (true);

drop policy if exists meta_select on public.leaderboard_meta;
create policy meta_select on public.leaderboard_meta
  for select to authenticated using (true);

grant select on public.leaderboard_snapshot to authenticated;
grant select on public.leaderboard_meta     to authenticated;

-- Let the instructor force an early refresh if they ever need one. -------------
create or replace function public.force_leaderboard_refresh()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can refresh the leaderboard.';
  end if;
  perform public.refresh_leaderboard_snapshot();
end;
$$;
grant execute on function public.force_leaderboard_refresh() to authenticated;

-- Schedule: 7:30 AM & 7:30 PM Asia/Manila == 23:30 & 11:30 UTC. ---------------
-- cron.schedule() upserts by job name, so re-running this migration just
-- updates the existing jobs (no need to delete from cron.job, which the
-- SQL Editor role isn't allowed to do).
select cron.schedule(
  'classpoint-leaderboard-am', '30 23 * * *',   -- 07:30 Manila
  $$select public.refresh_leaderboard_snapshot();$$
);
select cron.schedule(
  'classpoint-leaderboard-pm', '30 11 * * *',   -- 19:30 Manila
  $$select public.refresh_leaderboard_snapshot();$$
);

-- Seed the first snapshot now so the board isn't empty before the next run.
select public.refresh_leaderboard_snapshot();
