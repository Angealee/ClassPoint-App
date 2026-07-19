-- ============================================================================
-- ClassPoint · 0023 · Data safety net — audit log, nightly backups, archive
-- Run after 0022. Safe to re-run (idempotent).
--
-- WHAT THIS CHANGES
--   1. audit_log — every destructive action (deletes incl. cascades, archive/
--      restore/hard-delete) is captured with the FULL row JSON, so nothing is
--      ever silently unrecoverable again.
--   2. Nightly in-database backups — a `backup` schema holding 14 daily
--      snapshots of every critical table, refreshed at 02:00 Manila by pg_cron.
--      Self-healing: if a source table's shape changes later, the backup table
--      rebuilds itself on the next run instead of failing forever.
--   3. Archive instead of delete — students.archived_at. Archived students
--      vanish from rosters, the leaderboard, attendance-taking and analytics,
--      but every record survives and they restore in one tap. TRUE deletion
--      only exists for already-archived students (the app double-confirms with
--      a typed-name challenge).
--
-- FUNCTION OWNERSHIP MOVES (recorded in CLAUDE.md):
--   refresh_leaderboard_snapshot  0006 → 0023 (archived filter)
--   end_class_session             0014 → 0023 (archived filter on auto-absents)
--   scan_attendance               0014 → 0023 (archived-student guard)
--   get_achievement_rarity        0021 → 0023 (archived filter on denominator)
--   All same-signature `create or replace` — no drop-first needed.
--
-- ── RESTORE (manual, from a backup snapshot) ────────────────────────────────
--   See what you have:   select snapshot_date, count(*) from backup.students group by 1;
--   Restore one row:     insert into public.point_events (id, student_id, points, category, note, created_at)
--                        select id, student_id, points, category, note, created_at
--                          from backup.point_events
--                         where snapshot_date = 'YYYY-MM-DD' and id = '<uuid>';
--   (Columns after snapshot_date mirror the live table exactly.)
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None here. The claim-token edge function must ALSO be redeployed after
--   this migration (it gains an archived-student rejection):
--     supabase functions deploy claim-token
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. audit_log
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  -- Deliberately NO foreign keys: audit rows must survive the very deletions
  -- they record (including the auth user going away).
  actor      uuid,
  action     text not null check (action in ('delete','archive','restore','hard_delete')),
  table_name text not null,
  row_id     uuid,
  student_id uuid,
  summary    text,
  row_data   jsonb not null
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_student_idx on public.audit_log (student_id, at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_instructor());
-- No write policies and no write grants: only the SECURITY DEFINER trigger
-- and RPCs below insert.
grant select on public.audit_log to authenticated;

-- One generic row-level AFTER DELETE trigger. Row-level on purpose: a cascade
-- (hard-deleting a student wipes their events/records) fires this once per
-- child row, capturing each row's full JSON — that IS the recovery net.
create or replace function public.cp_audit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_row_id  uuid;
  v_summary text;
begin
  if tg_table_name = 'students' then
    v_row_id  := old.id;
    v_student := old.id;
    v_summary := old.full_name || ' · ' || old.lifetime_points || ' pts';
  elsif tg_table_name = 'point_events' then
    v_row_id  := old.id;
    v_student := old.student_id;
    v_summary := old.points || ' · ' || old.category || coalesce(' · ' || old.note, '');
  elsif tg_table_name = 'attendance_records' then
    v_row_id  := old.id;
    v_student := old.student_id;
    v_summary := old.status;
  elsif tg_table_name = 'class_sessions' then
    v_row_id  := old.id;
    v_student := null;
    v_summary := coalesce(nullif(old.topic, ''), to_char(old.started_at, 'Mon DD'));
  end if;

  insert into public.audit_log (actor, action, table_name, row_id, student_id, summary, row_data)
       values (auth.uid(), 'delete', tg_table_name, v_row_id, v_student, v_summary, to_jsonb(old));
  return null;
end;
$$;

revoke execute on function public.cp_audit_delete() from public, anon, authenticated;

drop trigger if exists trg_audit_delete_students on public.students;
create trigger trg_audit_delete_students
  after delete on public.students
  for each row execute function public.cp_audit_delete();

drop trigger if exists trg_audit_delete_point_events on public.point_events;
create trigger trg_audit_delete_point_events
  after delete on public.point_events
  for each row execute function public.cp_audit_delete();

drop trigger if exists trg_audit_delete_attendance on public.attendance_records;
create trigger trg_audit_delete_attendance
  after delete on public.attendance_records
  for each row execute function public.cp_audit_delete();

drop trigger if exists trg_audit_delete_sessions on public.class_sessions;
create trigger trg_audit_delete_sessions
  after delete on public.class_sessions
  for each row execute function public.cp_audit_delete();

-- ----------------------------------------------------------------------------
-- 2. Nightly backups — backup schema, 14-day retention, 02:00 Manila
-- ----------------------------------------------------------------------------
create schema if not exists backup;

-- One table per source, keyed by snapshot_date. `like` mirrors columns/types;
-- inserts always list snapshot_date first then the source row order, so the
-- shapes stay aligned. If a source table changes shape later, the nightly job
-- below rebuilds the backup table automatically.
create table if not exists backup.students             (snapshot_date date not null, like public.students);
create table if not exists backup.point_events         (snapshot_date date not null, like public.point_events);
create table if not exists backup.attendance_records   (snapshot_date date not null, like public.attendance_records);
create table if not exists backup.class_sessions       (snapshot_date date not null, like public.class_sessions);
create table if not exists backup.sections             (snapshot_date date not null, like public.sections);
create table if not exists backup.point_redemptions    (snapshot_date date not null, like public.point_redemptions);
create table if not exists backup.student_achievements (snapshot_date date not null, like public.student_achievements);
create table if not exists backup.student_secrets      (snapshot_date date not null, like public.student_secrets);

create index if not exists students_snapshot_idx             on backup.students (snapshot_date);
create index if not exists point_events_snapshot_idx         on backup.point_events (snapshot_date);
create index if not exists attendance_records_snapshot_idx   on backup.attendance_records (snapshot_date);
create index if not exists class_sessions_snapshot_idx       on backup.class_sessions (snapshot_date);
create index if not exists sections_snapshot_idx             on backup.sections (snapshot_date);
create index if not exists point_redemptions_snapshot_idx    on backup.point_redemptions (snapshot_date);
create index if not exists student_achievements_snapshot_idx on backup.student_achievements (snapshot_date);
create index if not exists student_secrets_snapshot_idx      on backup.student_secrets (snapshot_date);

create or replace function public.cp_nightly_backup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t      text;
  tables constant text[] := array[
    'students', 'point_events', 'attendance_records', 'class_sessions',
    'sections', 'point_redemptions', 'student_achievements', 'student_secrets'
  ];
begin
  foreach t in array tables loop
    begin
      -- Idempotent per day: re-running replaces today's snapshot.
      execute format('delete from backup.%I where snapshot_date = current_date', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    exception when others then
      -- Schema drift: the source table changed shape since the backup table
      -- was created. Rebuild the mirror and retry once. Old snapshots for
      -- this one table are sacrificed for a working backup going forward —
      -- the other tables' history is untouched.
      execute format('drop table if exists backup.%I', t);
      execute format('create table backup.%I (snapshot_date date not null, like public.%I)', t, t);
      execute format('create index on backup.%I (snapshot_date)', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    end;
  end loop;

  -- Retention: 14 daily snapshots; audit trail kept a full year.
  foreach t in array tables loop
    execute format('delete from backup.%I where snapshot_date < current_date - 14', t);
  end loop;
  delete from public.audit_log where at < now() - interval '365 days';
end;
$$;

revoke execute on function public.cp_nightly_backup() from public, anon, authenticated;

-- 02:00 Manila = 18:00 UTC. cron.schedule upserts by job name.
select cron.schedule(
  'classpoint-nightly-backup', '0 18 * * *',
  $$select public.cp_nightly_backup();$$
);

-- ----------------------------------------------------------------------------
-- 3. Archive instead of delete
-- ----------------------------------------------------------------------------
alter table public.students add column if not exists archived_at timestamptz;
create index if not exists students_active_idx
  on public.students (section_id) where archived_at is null;

create or replace function public.archive_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can archive students.';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'That student no longer exists.';
  end if;
  if v_student.archived_at is not null then
    return; -- already archived; no-op
  end if;

  update public.students set archived_at = now() where id = p_student_id;

  insert into public.audit_log (actor, action, table_name, row_id, student_id, summary, row_data)
       values (auth.uid(), 'archive', 'students', p_student_id, p_student_id,
               v_student.full_name || ' · ' || v_student.lifetime_points || ' pts',
               to_jsonb(v_student));

  -- Keep the frozen board consistent immediately (cheap at class scale)
  -- instead of letting the archived student haunt it until the next settle.
  perform public.refresh_leaderboard_snapshot();
end;
$$;

create or replace function public.restore_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can restore students.';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'That student no longer exists.';
  end if;
  if v_student.archived_at is null then
    return; -- not archived; no-op
  end if;

  update public.students set archived_at = null where id = p_student_id;

  insert into public.audit_log (actor, action, table_name, row_id, student_id, summary, row_data)
       values (auth.uid(), 'restore', 'students', p_student_id, p_student_id,
               v_student.full_name, to_jsonb(v_student));

  perform public.refresh_leaderboard_snapshot();
end;
$$;

-- The ONLY remaining path to irreversible deletion — and it requires the
-- student to already be archived, so it can never be a first tap.
create or replace function public.hard_delete_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can delete students.';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    return; -- already gone; idempotent
  end if;
  if v_student.archived_at is null then
    raise exception 'Archive this student first — permanent deletion is only for archived students.';
  end if;

  -- Intent row (actor + action); the delete trigger below adds the per-row
  -- cascade audit (their events, records, …) with full JSON.
  insert into public.audit_log (actor, action, table_name, row_id, student_id, summary, row_data)
       values (auth.uid(), 'hard_delete', 'students', p_student_id, p_student_id,
               v_student.full_name || ' · ' || v_student.lifetime_points || ' pts',
               to_jsonb(v_student));

  delete from public.students where id = p_student_id;

  perform public.refresh_leaderboard_snapshot();
end;
$$;

grant execute on function public.archive_student(uuid)     to authenticated;
grant execute on function public.restore_student(uuid)     to authenticated;
grant execute on function public.hard_delete_student(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Archived filter ripple (ownership moves; bodies otherwise unchanged)
-- ----------------------------------------------------------------------------

-- 4a. refresh_leaderboard_snapshot (0006 → 0023): archived students leave the
-- frozen board entirely; everyone below moves up a rank.
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
  from public.students s
  where s.archived_at is null;

  insert into public.leaderboard_meta (id, captured_at)
       values (true, now())
  on conflict (id) do update set captured_at = excluded.captured_at;
end;
$$;

-- 4b. end_class_session (0014 → 0023): archived students are never auto-marked
-- absent (their existing records, if any, are untouched — the insert has
-- always been on-conflict-do-nothing).
create or replace function public.end_class_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can end a class.';
  end if;

  update public.class_sessions
     set status = 'ended', ended_at = coalesce(ended_at, now())
   where id = p_session_id and status = 'active';

  -- Everyone ACTIVE in the section without a record so far = absent.
  insert into public.attendance_records (session_id, student_id, status, scanned_at)
  select p_session_id, s.id, 'absent', null
    from public.students s
    join public.class_sessions cs on cs.id = p_session_id
   where s.section_id = cs.section_id
     and s.archived_at is null
  on conflict (session_id, student_id) do nothing;
end;
$$;

-- 4c. scan_attendance (0014 → 0023): archived accounts can't check in.
create or replace function public.scan_attendance(
  p_session_id uuid,
  p_window     bigint,
  p_code       text
)
returns table (status text, already boolean, topic text, marked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student   public.students%rowtype;
  v_session   public.class_sessions%rowtype;
  v_secret    text;
  v_now_w     bigint;
  v_expected  text;
  v_elapsed   numeric;
  v_status    text;
  v_existing  public.attendance_records%rowtype;
begin
  -- Identify the caller as a claimed, active student.
  select * into v_student from public.students where user_id = auth.uid();
  if not found then
    raise exception 'Only a signed-in student can check in.';
  end if;
  if v_student.archived_at is not null then
    raise exception 'This account has been archived — talk to your instructor.';
  end if;

  select * into v_session from public.class_sessions where id = p_session_id;
  if not found then
    raise exception 'That class session no longer exists.';
  end if;
  if v_session.status <> 'active' then
    raise exception 'This class session has ended.';
  end if;
  if v_student.section_id <> v_session.section_id then
    raise exception 'This class is for a different section.';
  end if;

  -- 15-second windows. Accept the previous/current/next window: "previous" covers
  -- scan latency, "next" tolerates the instructor device's clock running slightly
  -- ahead of the DB. A valid code still lasts under a minute, so a forwarded
  -- screenshot stops working quickly.
  v_now_w := floor(extract(epoch from now()) / 15)::bigint;
  if p_window not in (v_now_w - 1, v_now_w, v_now_w + 1) then
    raise exception 'This QR code has expired — scan the one on screen now.';
  end if;

  select qr_secret into v_secret from public.class_session_secrets where session_id = p_session_id;
  v_expected := left(
    encode(extensions.hmac(p_session_id::text || '.' || p_window::text, v_secret, 'sha256'), 'hex'),
    16
  );
  if v_expected is distinct from lower(p_code) then
    raise exception 'That code is not valid for this class.';
  end if;

  -- Already checked in? Return the recorded status (idempotent, no double log).
  select * into v_existing
    from public.attendance_records
   where session_id = p_session_id and student_id = v_student.id;
  if found then
    return query select v_existing.status, true, v_session.topic, v_existing.scanned_at;
    return;
  end if;

  v_elapsed := extract(epoch from (now() - v_session.started_at)) / 60.0;
  if v_elapsed >= v_session.absent_after_min then
    v_status := 'absent';
  elsif v_elapsed >= v_session.late_after_min then
    v_status := 'late';
  else
    v_status := 'present';
  end if;

  insert into public.attendance_records (session_id, student_id, status, scanned_at)
       values (p_session_id, v_student.id, v_status, now())
  on conflict (session_id, student_id) do nothing;

  return query select v_status, false, v_session.topic, now();
end;
$$;

-- 4d. get_achievement_rarity (0021 → 0023): archived students leave the
-- rarity denominator so percentages reflect the actual class.
create or replace function public.get_achievement_rarity()
returns table (code text, holders int, total_students int)
language sql
security definer
set search_path = public
as $$
  select a.code,
         (select count(*)::int from public.student_achievements sa
           where sa.achievement_code = a.code) as holders,
         (select count(*)::int from public.students s
           where s.user_id is not null and s.archived_at is null) as total_students
    from public.achievements a;
$$;
