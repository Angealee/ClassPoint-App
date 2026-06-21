-- ============================================================================
-- ClassPoint · 0008 · Web Push notifications
-- Run after 0007.
--
-- Adds the plumbing for *background* push (delivered while the app is closed):
--   1. push_subscriptions    — one row per browser/device a student enables.
--   2. realtime on snapshot  — lets the live dashboard catch its own new rank.
--   3. DB → Edge triggers     — fire the `send-push` Edge Function via pg_net on
--                               point events and twice-daily rank changes.
--
-- ── One-time setup before push works (safe to skip; in-app stays functional) ─
--   a) Enable the HTTP extension:           handled below (create extension).
--   b) Tell Postgres where the Edge Function lives + how to authenticate.
--      Run ONCE in the SQL editor, with YOUR values:
--
--        alter database postgres
--          set app.settings.edge_url   = 'https://<PROJECT_REF>.functions.supabase.co';
--        alter database postgres
--          set app.settings.service_key = '<SERVICE_ROLE_KEY>';
--
--      (Reconnect after running these so the new settings load.)
--   c) Generate VAPID keys, deploy the `send-push` function, and set its secrets
--      — see supabase/functions/send-push/index.ts header.
-- ============================================================================

create extension if not exists pg_net;

-- 1. Subscriptions -----------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_student_idx
  on public.push_subscriptions (student_id);

alter table public.push_subscriptions enable row level security;

-- A student manages only their own device rows; the instructor can see all.
-- (The send-push function uses the service role, which bypasses RLS to read.)
drop policy if exists push_sub_select on public.push_subscriptions;
create policy push_sub_select on public.push_subscriptions
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

drop policy if exists push_sub_write on public.push_subscriptions;
create policy push_sub_write on public.push_subscriptions
  for all to authenticated
  using (student_id in (select id from public.students where user_id = auth.uid()))
  with check (student_id in (select id from public.students where user_id = auth.uid()));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- 2. Realtime: let the dashboard observe its own new snapshot rank ------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'leaderboard_snapshot'
  ) then
    alter publication supabase_realtime add table public.leaderboard_snapshot;
  end if;
end
$$;

-- 3a. Point events → push ----------------------------------------------------
-- Fires after each award/penalty. Computes the before/after level so the Edge
-- Function can also celebrate a level-up in the same payload.
create or replace function public.cp_notify_point_event()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url       text := current_setting('app.settings.edge_url', true);
  v_key       text := current_setting('app.settings.service_key', true);
  v_new       integer;
  v_prev      integer;
  v_new_level integer;
  v_old_level integer;
begin
  if v_url is null or v_key is null then
    return null; -- push not configured yet; in-app notifications still work
  end if;

  select coalesce(sum(points), 0) into v_new
    from public.point_events where student_id = NEW.student_id;
  v_prev      := v_new - NEW.points;
  v_new_level := public.cp_level(v_new);
  v_old_level := public.cp_level(v_prev);

  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'type',       case when NEW.points >= 0 then 'point' else 'deduct' end,
      'student_id', NEW.student_id,
      'points',     NEW.points,
      'note',       NEW.note,
      'level',      case when v_new_level > v_old_level then v_new_level else null end
    )
  );
  return null;
end;
$$;

drop trigger if exists trg_points_notify on public.point_events;
create trigger trg_points_notify
  after insert on public.point_events
  for each row execute function public.cp_notify_point_event();

-- 3b. Twice-daily rank changes → push ----------------------------------------
-- Wraps the existing snapshot refresh: captures old ranks, refreshes, then
-- pushes to anyone whose rank actually moved.
create or replace function public.refresh_leaderboard_snapshot_notify()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url text := current_setting('app.settings.edge_url', true);
  v_key text := current_setting('app.settings.service_key', true);
  r     record;
begin
  create temp table _old_ranks on commit drop as
    select student_id, rank from public.leaderboard_snapshot;

  perform public.refresh_leaderboard_snapshot();

  if v_url is null or v_key is null then
    return; -- push not configured; snapshot still refreshed above
  end if;

  for r in
    select n.student_id, n.rank as new_rank, o.rank as old_rank
      from public.leaderboard_snapshot n
      join _old_ranks o on o.student_id = n.student_id
     where o.rank is distinct from n.rank
  loop
    perform net.http_post(
      url     := v_url || '/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'type', 'rank',
        'student_id', r.student_id,
        'rank', r.new_rank,
        'prev_rank', r.old_rank
      )
    );
  end loop;
end;
$$;

-- Point the existing twice-daily cron jobs at the notifying wrapper.
-- cron.schedule() upserts by job name, so this just retargets them.
select cron.schedule(
  'classpoint-leaderboard-am', '30 23 * * *',   -- 07:30 Manila
  $$select public.refresh_leaderboard_snapshot_notify();$$
);
select cron.schedule(
  'classpoint-leaderboard-pm', '30 11 * * *',   -- 19:30 Manila
  $$select public.refresh_leaderboard_snapshot_notify();$$
);
