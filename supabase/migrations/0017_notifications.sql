-- ============================================================================
-- ClassPoint · 0017 · Notification outbox + reliable push + notification center
-- Run after 0016. Safe to re-run (idempotent).
--
-- WHAT THIS CHANGES
--   Push used to be fire-and-forget: trigger → pg_net → edge function, and any
--   failure (cold function, missing Vault key, flaky network) silently lost the
--   notification. Now every notification is FIRST persisted in
--   public.notifications (the outbox — also the data behind the in-app bell),
--   THEN pushed. A pg_cron sweep retries undelivered rows every 5 minutes
--   (max 5 attempts, 24 h window). Only the edge function ever marks a row
--   'sent' — pg_net gives no delivery feedback, so SQL never assumes success.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   1. Run THIS migration first.
--   2. THEN deploy the rewritten edge function:
--        supabase functions deploy send-push
--      Order matters but is self-healing: after step 1 the old function
--      rejects the new payload shape, so rows stay 'pending' and the sweep
--      re-delivers them within ~5 minutes of step 2. Nothing is lost.
--   3. Verify the Vault secret exists (from 0010):
--        select name from vault.secrets where name = 'edge_service_key';
--   4. Cron sanity check afterwards:
--        select jobname, schedule from cron.job;
--        select * from cron.job_run_details order by start_time desc limit 10;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The outbox / history table
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  -- Deliberately no CHECK: later phases add types ('redemption',
  -- 'attendance_penalty', …) without needing an ALTER.
  type            text not null,
  title           text not null,
  body            text not null default '',
  url             text not null default '/app',
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  push_status     text not null default 'pending'
                    check (push_status in ('pending','sent','failed','skipped')),
  attempts        int not null default 0,
  last_attempt_at timestamptz
);

create index if not exists notifications_student_created_idx
  on public.notifications (student_id, created_at desc);
-- The sweep only ever scans undelivered rows.
create index if not exists notifications_undelivered_idx
  on public.notifications (created_at)
  where push_status in ('pending','failed');

alter table public.notifications enable row level security;

-- Students read their own history (the bell); instructor can see all.
-- No direct write policies — every write goes through the RPCs below.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

grant select on public.notifications to authenticated;

-- Subscription health bookkeeping (send-push updates these).
alter table public.push_subscriptions
  add column if not exists last_seen_at timestamptz not null default now();
alter table public.push_subscriptions
  add column if not exists fail_count int not null default 0;

-- Realtime: the bell badge increments live while the app is open.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. Internal plumbing: queue, dispatch, sweep
-- ----------------------------------------------------------------------------

-- Vault lookup shared by the dispatchers. Missing/broken Vault → null → the
-- outbox row still exists and the bell still shows it; only push is skipped.
create or replace function public.cp_edge_key()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  begin
    select decrypted_secret into v_key
      from vault.decrypted_secrets
     where name = 'edge_service_key'
     limit 1;
  exception when others then
    v_key := null;
  end;
  return v_key;
end;
$$;

-- THE single write path into the outbox. Every feature (points, ranks,
-- redemptions, attendance penalties, instructor grants) queues through here.
create or replace function public.cp_queue_notification(
  p_student_id uuid,
  p_type       text,
  p_title      text,
  p_body       text default '',
  p_url        text default '/app'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (student_id, type, title, body, url)
  values (p_student_id, p_type, p_title, coalesce(p_body, ''), coalesce(p_url, '/app'))
  returning id into v_id;
  return v_id;
end;
$$;

-- One batched HTTP call to send-push for any number of outbox rows. pg_net is
-- fire-and-forget: this NEVER marks rows sent — only send-push transitions
-- push_status after it actually talks to the push service.
create or replace function public.cp_push_dispatch(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url text := 'https://cxfxstazlwjijozkglgx.functions.supabase.co';
  v_key text := public.cp_edge_key();
begin
  if v_key is null or p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;
  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('notification_ids', to_jsonb(p_ids))
  );
end;
$$;

-- Retry sweep: re-dispatch undelivered rows. The 4-minute last_attempt guard
-- keeps the sweep from double-sending a row the trigger dispatched seconds ago
-- that send-push simply hasn't marked yet. At-least-once semantics — the
-- client collapses same-tag notifications, so a rare duplicate is harmless.
create or replace function public.cp_push_sweep()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from (
      select id
        from public.notifications
       where push_status in ('pending', 'failed')
         and attempts < 5
         and created_at > now() - interval '24 hours'
         and (last_attempt_at is null or last_attempt_at < now() - interval '4 minutes')
       order by created_at
       limit 50
    ) t;
  perform public.cp_push_dispatch(v_ids);
end;
$$;

-- Internal-only: callers go through triggers/RPCs, never directly.
revoke execute on function public.cp_edge_key() from public, anon, authenticated;
revoke execute on function public.cp_queue_notification(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.cp_push_dispatch(uuid[]) from public, anon, authenticated;
revoke execute on function public.cp_push_sweep() from public, anon, authenticated;

select cron.schedule(
  'classpoint-push-sweep', '*/5 * * * *',
  $$select public.cp_push_sweep();$$
);

-- ----------------------------------------------------------------------------
-- 3. Event sources → outbox (replaces the 0010 fire-and-forget versions)
-- ----------------------------------------------------------------------------

-- Point events. Copy tone: playful, no emoji (user decision 2026-07-16).
create or replace function public.cp_notify_point_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new       integer;
  v_prev      integer;
  v_new_level integer;
  v_old_level integer;
  v_ids       uuid[] := '{}';
  v_title     text;
  v_body      text;
begin
  -- Redemption debits announce themselves (the decision RPC sends a richer
  -- "approved/declined" notification) — skip so students never get two pushes.
  if NEW.category = 'redeem' then
    return null;
  end if;

  select coalesce(sum(points), 0) into v_new
    from public.point_events where student_id = NEW.student_id;
  v_prev      := v_new - NEW.points;
  v_new_level := public.cp_level(v_new);
  v_old_level := public.cp_level(v_prev);

  if NEW.points >= 0 then
    v_title := '+' || NEW.points || ' points';
    v_body  := coalesce(nullif(btrim(NEW.note), '') || ' — keep cooking.', 'Keep cooking.');
  else
    v_title := NEW.points || ' points';
    v_body  := coalesce(
      nullif(btrim(NEW.note), '') || ' — win it back next class.',
      'Ouch — win it back next class.'
    );
  end if;

  v_ids := array_append(v_ids, public.cp_queue_notification(
    NEW.student_id,
    case when NEW.points >= 0 then 'point' else 'deduct' end,
    v_title, v_body, '/app'
  ));

  if v_new_level > v_old_level then
    v_ids := array_append(v_ids, public.cp_queue_notification(
      NEW.student_id, 'level',
      'Level ' || v_new_level || ' unlocked',
      'You leveled up. The grind is paying off.',
      '/app'
    ));
  end if;

  perform public.cp_push_dispatch(v_ids);
  return null;
end;
$$;

-- (trigger trg_points_notify from 0008 already points at this function.)

-- Twice-daily rank changes: queue everyone's row, then ONE batched dispatch
-- (the old version fired one HTTP call per student).
create or replace function public.refresh_leaderboard_snapshot_notify()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r     record;
  v_ids uuid[] := '{}';
begin
  create temp table _old_ranks on commit drop as
    select student_id, rank from public.leaderboard_snapshot;

  perform public.refresh_leaderboard_snapshot();

  for r in
    select n.student_id, n.rank as new_rank, o.rank as old_rank
      from public.leaderboard_snapshot n
      join _old_ranks o on o.student_id = n.student_id
     where o.rank is distinct from n.rank
  loop
    v_ids := array_append(v_ids, public.cp_queue_notification(
      r.student_id, 'rank',
      case when r.new_rank < r.old_rank
        then 'You climbed to #' || r.new_rank
        else 'Rank check: #' || r.new_rank end,
      case when r.new_rank < r.old_rank
        then 'Up from #' || r.old_rank || '. Someone''s sweating.'
        else 'Down from #' || r.old_rank || '. Time for a comeback arc.' end,
      '/app/leaderboard'
    ));
  end loop;

  perform public.cp_push_dispatch(v_ids);
end;
$$;

-- Instructor-granted achievements now reach the lock screen too. Auto-unlocks
-- (granted_by is null, see 0016) already celebrate in-app at sync time — only
-- grants by someone else are worth a push.
create or replace function public.cp_notify_achievement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_name  text;
  v_title text;
begin
  if NEW.granted_by is null then
    return null;
  end if;
  select user_id into v_user from public.students where id = NEW.student_id;
  if v_user is not null and NEW.granted_by = v_user then
    return null;
  end if;

  select name, title_text into v_name, v_title
    from public.achievements where code = NEW.achievement_code;
  if v_name is null then
    return null;
  end if;

  perform public.cp_push_dispatch(array[public.cp_queue_notification(
    NEW.student_id, 'achievement',
    'Achievement unlocked: ' || v_name,
    coalesce(
      'New title in your closet: "' || v_title || '".',
      'Your instructor thinks you earned this one.'
    ),
    '/app/achievements'
  )]);
  return null;
end;
$$;

drop trigger if exists trg_achievement_notify on public.student_achievements;
create trigger trg_achievement_notify
  after insert on public.student_achievements
  for each row execute function public.cp_notify_achievement();

revoke execute on function public.cp_notify_achievement() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Client-facing RPCs
-- ----------------------------------------------------------------------------

-- Mark my notifications read (the bell sheet calls this on open). p_before
-- pins the cutoff so rows arriving mid-scroll stay unread.
create or replace function public.mark_notifications_read(p_before timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications n
     set read_at = now()
   where n.read_at is null
     and n.created_at <= p_before
     and n.student_id in (select id from public.students where user_id = auth.uid());
end;
$$;

grant execute on function public.mark_notifications_read(timestamptz) to authenticated;

-- End-to-end pipeline test, triggered from the Profile page. Goes through the
-- real outbox + edge function so it proves the whole path, not just the UI.
create or replace function public.send_test_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_id      uuid;
begin
  select id into v_student
    from public.students where user_id = auth.uid() limit 1;
  if v_student is null then
    raise exception 'Only students can send a test notification.';
  end if;

  v_id := public.cp_queue_notification(
    v_student, 'test',
    'Test notification',
    'If you can read this on your lock screen, push works.',
    '/app'
  );
  perform public.cp_push_dispatch(array[v_id]);
end;
$$;

grant execute on function public.send_test_push() to authenticated;

-- Self-healing for browser-rotated subscriptions. Called from the service
-- worker's `pushsubscriptionchange` handler, which runs with NO Supabase
-- session — knowledge of the old (unguessable, ~1800-bit) endpoint URL is the
-- credential here, the standard pattern for this event.
create or replace function public.replace_push_subscription(
  p_old_endpoint text,
  p_endpoint     text,
  p_p256dh       text,
  p_auth         text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_old_endpoint is null or p_endpoint is null
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    return;
  end if;

  -- Only act when the old endpoint is actually ours; otherwise no-op (also
  -- protects against a stray delete when the page already re-synced the new
  -- endpoint and the old row is gone).
  if exists (select 1 from public.push_subscriptions where endpoint = p_old_endpoint) then
    delete from public.push_subscriptions
     where endpoint = p_endpoint and endpoint <> p_old_endpoint;
    update public.push_subscriptions
       set endpoint     = p_endpoint,
           p256dh       = p_p256dh,
           auth         = p_auth,
           last_seen_at = now(),
           fail_count   = 0
     where endpoint = p_old_endpoint;
  end if;
end;
$$;

grant execute on function public.replace_push_subscription(text, text, text, text)
  to anon, authenticated;
