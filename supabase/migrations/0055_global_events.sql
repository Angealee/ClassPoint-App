-- ============================================================================
-- 0055 · Global event attendance ("special/limited event, large-scale check-in")
--
-- WHAT THIS ADDS
--   A cross-section attendance flow, fully ISOLATED from class attendance so it
--   can never inflate streaks / show-up rates / achievement metrics or weaken
--   scan_attendance's section guard:
--     * event_sessions         — one global check-in event (per active semester)
--     * event_session_secrets  — the rotating-QR HMAC secret (instructor-only)
--     * event_attendance        — one row per student per event; stamps the
--                                 student's SECTION at scan time (req: "record it
--                                 in their respective section")
--   Any active student, ANY section, may scan. A flat, configurable number of
--   points is awarded ONCE, into the ONE shared ledger, under a NEW category
--   'event_attend' (keeps the ledger answerable — separate from the Lounge's
--   'event' random-events and class 'activity').
--
-- WHY A NEW CATEGORY + A TRIGGER TOUCH
--   Points are awarded silently: a school-wide event is hundreds of point rows,
--   and cp_notify_point_event pushes for every non-'redeem' award — that would be
--   a push storm. There is no zero-touch way to silence it, so this file makes an
--   ownership move of that trigger and adds ONE skip line. A dedicated category
--   makes the skip self-explanatory (NEW.category in ('redeem','event_attend'))
--   instead of a per-row flag.
--
-- OWNERSHIP MOVES
--   cp_notify_point_event  0025 → 0055 (same signature; body carried forward
--     VERBATIM, plus 'event_attend' added to the skip). Nothing else changed.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run. Must be applied AFTER 0045 (which owns
--   point_events_category_check and adds 'event', re-listed below).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.event_sessions (
  id           uuid primary key default gen_random_uuid(),
  semester_id  uuid not null references public.semesters(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  -- Flat points every scanner earns, once. 0 = record attendance only.
  points_per_scan integer not null default 0 check (points_per_scan between 0 and 100),
  status       text not null default 'active' check (status in ('active','ended')),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
-- At most ONE active event per semester (there is one active semester, so this is
-- one active global event at a time). The instructor resumes it, never forks it.
create unique index if not exists event_sessions_one_active_idx
  on public.event_sessions (semester_id) where status = 'active';
create index if not exists event_sessions_semester_idx
  on public.event_sessions (semester_id, started_at desc);

-- Rotating-QR secret. Instructor-only (mirrors class_session_secrets); students
-- never read it — they scan the code the instructor's device renders.
create table if not exists public.event_session_secrets (
  event_id  uuid primary key references public.event_sessions(id) on delete cascade,
  qr_secret text not null
);

create table if not exists public.event_attendance (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.event_sessions(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  -- Snapshot of the student's section AT SCAN TIME, for the per-section breakdown
  -- (survives a later section change; nullable so a lost section never blocks a
  -- check-in).
  section_id     uuid references public.sections(id) on delete set null,
  scanned_at     timestamptz not null default now(),
  -- The ledger row the award created (audit; null when points_per_scan = 0).
  point_event_id uuid references public.point_events(id) on delete set null,
  -- true when the instructor added this student by hand (no phone / dead battery).
  manual         boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (event_id, student_id)                       -- one check-in per student
);
create index if not exists event_attendance_event_idx
  on public.event_attendance (event_id, scanned_at desc);
create index if not exists event_attendance_student_idx
  on public.event_attendance (student_id);
create index if not exists event_attendance_section_idx
  on public.event_attendance (event_id, section_id);

-- ----------------------------------------------------------------------------
-- 2. Row-Level Security
-- ----------------------------------------------------------------------------
alter table public.event_sessions        enable row level security;
alter table public.event_session_secrets enable row level security;
alter table public.event_attendance      enable row level security;

-- event_sessions: any signed-in user may read (name/time aren't sensitive; the
-- secret lives in its own table). Writes go only through the definer RPCs below.
drop policy if exists event_sessions_select on public.event_sessions;
create policy event_sessions_select on public.event_sessions
  for select to authenticated using (true);

-- event_session_secrets: instructor only (the scan RPC reads it via definer).
drop policy if exists event_session_secrets_select on public.event_session_secrets;
create policy event_session_secrets_select on public.event_session_secrets
  for select to authenticated using (public.is_instructor());

-- event_attendance: instructor sees all; a student sees only their own.
drop policy if exists event_attendance_select on public.event_attendance;
create policy event_attendance_select on public.event_attendance
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

grant select on public.event_sessions        to authenticated;
grant select on public.event_session_secrets to authenticated;
grant select on public.event_attendance      to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Realtime — only event_sessions (the global "event is starting" banner).
--    event_attendance is deliberately NOT published: at event scale that would
--    push hundreds of row events to the instructor; the monitor polls
--    get_event_stats() instead.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'event_sessions'
  ) then
    alter publication supabase_realtime add table public.event_sessions;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 4. point_events category: add 'event_attend' (re-list every existing value,
--    incl. 'event' from 0045 — a bare recreate would silently narrow it).
--    point_events_points_check needs NO change: its category <> 'redeem' branch
--    already allows 1..100.
-- ----------------------------------------------------------------------------
alter table public.point_events drop constraint if exists point_events_category_check;
alter table public.point_events
  add constraint point_events_category_check
  check (category in ('recitation', 'activity', 'penalty', 'redeem', 'event', 'event_attend'));

-- ----------------------------------------------------------------------------
-- 5. cp_notify_point_event  0025 → 0055
--    Body carried forward VERBATIM from 0025; the ONLY change is the skip list
--    on line 1 of the body: 'event_attend' joins 'redeem'. Event check-ins are
--    silent — the student sees the confirmation on their scan screen, and a
--    school-wide event must not fire hundreds of pushes.
-- ----------------------------------------------------------------------------
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
  v_url       text := '/app';
begin
  -- 'event_attend' (0055) joins 'redeem': both award points with no push.
  if NEW.category in ('redeem', 'event_attend') then
    return null;
  end if;

  select coalesce(sum(points), 0) into v_new
    from public.point_events where student_id = NEW.student_id;
  v_prev      := v_new - NEW.points;
  v_new_level := public.cp_level(v_new);
  v_old_level := public.cp_level(v_prev);

  if NEW.category = 'penalty' and NEW.note like 'Absent%' then
    -- e.g. "−5 · Absent · Lecture 5"
    v_title := NEW.points || ' · ' || NEW.note;
    v_body  := 'To be excused, get an admission slip from the Dean''s office. See the steps in the app.';
    v_url   := '/app/attendance';
  elsif NEW.points >= 0 then
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
    v_title, v_body, v_url
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

-- ----------------------------------------------------------------------------
-- 6. Instructor: start / resume the global event. Mirrors start_class_session —
--    OUT columns are NOT named after table columns (the 42702 ambiguity trap),
--    and an already-active event is returned as-is (a double tap / reload
--    resumes rather than forks).
-- ----------------------------------------------------------------------------
create or replace function public.start_event_session(
  p_name   text,
  p_points integer default 0
)
returns table (out_event_id uuid, out_qr_secret text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id     uuid;
  v_secret text;
  v_sem    uuid := public.cp_active_semester_id();
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can start an event.';
  end if;
  if v_sem is null then
    raise exception 'No active semester — activate one first.';
  end if;

  -- Resume the running event rather than creating a duplicate.
  select es.id, ess.qr_secret
    into v_id, v_secret
    from public.event_sessions es
    join public.event_session_secrets ess on ess.event_id = es.id
   where es.semester_id = v_sem and es.status = 'active'
   limit 1;
  if found then
    return query select v_id, v_secret;
    return;
  end if;

  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Give the event a name.';
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.event_sessions (semester_id, name, points_per_scan, created_by)
       values (v_sem, btrim(p_name), least(100, greatest(0, coalesce(p_points, 0))), auth.uid())
    returning id into v_id;

  insert into public.event_session_secrets (event_id, qr_secret)
       values (v_id, v_secret);

  return query select v_id, v_secret;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Instructor: end the event (no more scans).
-- ----------------------------------------------------------------------------
create or replace function public.end_event_session(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can end an event.';
  end if;
  update public.event_sessions
     set status = 'ended', ended_at = coalesce(ended_at, now())
   where id = p_event_id and status = 'active';
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Student: scan the event QR. SECURITY DEFINER so it can read the secret and
--    verify the HMAC without exposing either. NO section check — any active
--    student, any section — but the student must be in the CURRENT semester.
--    Awards the flat points ONCE (only when a genuinely-new row inserts), so a
--    re-scan or a concurrent double-tap can never double-pay. Silent: the
--    'event_attend' category is skipped by cp_notify_point_event above.
--    Returns `marked_at` (NOT scanned_at) — a RETURNS TABLE column sharing a name
--    with event_attendance.scanned_at is the 0014 ambiguity trap.
-- ----------------------------------------------------------------------------
create or replace function public.scan_event_attendance(
  p_event_id uuid,
  p_window   bigint,
  p_code     text
)
returns table (already boolean, points integer, event_name text, marked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student  public.students%rowtype;
  v_event    public.event_sessions%rowtype;
  v_secret   text;
  v_now_w    bigint;
  v_expected text;
  v_existing public.event_attendance%rowtype;
  v_sem      uuid;
  v_rec_id   uuid;
  v_pe       uuid;
  v_pts      integer;
begin
  select * into v_student from public.students where user_id = auth.uid();
  if not found then
    raise exception 'Only a signed-in student can check in.';
  end if;
  if v_student.archived_at is not null then
    raise exception 'This account has been archived — talk to your instructor.';
  end if;

  select * into v_event from public.event_sessions where id = p_event_id;
  if not found then
    raise exception 'That event no longer exists.';
  end if;
  if v_event.status <> 'active' then
    raise exception 'This event has ended.';
  end if;

  -- Any section may scan, but the account must belong to the current semester.
  select sec.semester_id into v_sem
    from public.sections sec where sec.id = v_student.section_id;
  if v_sem is distinct from public.cp_active_semester_id() then
    raise exception 'Your account is not in the current semester.';
  end if;

  -- 15s rotating window (prev/current/next), then the HMAC — mirrors
  -- scan_attendance, so a forwarded screenshot dies within ~45s.
  v_now_w := floor(extract(epoch from now()) / 15)::bigint;
  if p_window not in (v_now_w - 1, v_now_w, v_now_w + 1) then
    raise exception 'This QR code has expired — scan the one on screen now.';
  end if;
  select qr_secret into v_secret from public.event_session_secrets where event_id = p_event_id;
  v_expected := left(
    encode(extensions.hmac(p_event_id::text || '.' || p_window::text, v_secret, 'sha256'), 'hex'),
    16
  );
  if v_expected is distinct from lower(p_code) then
    raise exception 'That code is not valid for this event.';
  end if;

  v_pts := v_event.points_per_scan;

  -- Already checked in? Idempotent — no second row, no second award.
  select * into v_existing
    from public.event_attendance
   where event_id = p_event_id and student_id = v_student.id;
  if found then
    return query select true, v_pts, v_event.name, v_existing.scanned_at;
    return;
  end if;

  -- Insert the check-in; on a concurrent double-tap the unique index makes this a
  -- no-op and returns no id.
  insert into public.event_attendance (event_id, student_id, section_id, scanned_at, manual)
       values (p_event_id, v_student.id, v_student.section_id, now(), false)
  on conflict (event_id, student_id) do nothing
    returning id into v_rec_id;

  if v_rec_id is null then
    select * into v_existing
      from public.event_attendance
     where event_id = p_event_id and student_id = v_student.id;
    return query select true, v_pts, v_event.name, v_existing.scanned_at;
    return;
  end if;

  -- Genuinely new → award once (the ledger row is silent; see the trigger above).
  if v_pts > 0 then
    insert into public.point_events (student_id, points, category, note)
         values (v_student.id, v_pts, 'event_attend', 'Event · ' || v_event.name)
      returning id into v_pe;
    update public.event_attendance set point_event_id = v_pe where id = v_rec_id;
  end if;

  return query select false, v_pts, v_event.name, now()::timestamptz;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Instructor: manually add a student who couldn't scan (dead battery / no
--    phone). Same idempotent, single-award path; flagged manual.
-- ----------------------------------------------------------------------------
create or replace function public.mark_event_attendance(
  p_event_id   uuid,
  p_student_id uuid
)
returns table (already boolean, points integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event   public.event_sessions%rowtype;
  v_student public.students%rowtype;
  v_rec_id  uuid;
  v_pe      uuid;
  v_pts     integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can add an attendee.';
  end if;

  select * into v_event from public.event_sessions where id = p_event_id;
  if not found then
    raise exception 'That event no longer exists.';
  end if;
  if v_event.status <> 'active' then
    raise exception 'This event has ended.';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found or v_student.archived_at is not null then
    raise exception 'That student is not available.';
  end if;

  v_pts := v_event.points_per_scan;

  if exists (
    select 1 from public.event_attendance
     where event_id = p_event_id and student_id = p_student_id
  ) then
    return query select true, v_pts;
    return;
  end if;

  insert into public.event_attendance (event_id, student_id, section_id, scanned_at, manual)
       values (p_event_id, p_student_id, v_student.section_id, now(), true)
  on conflict (event_id, student_id) do nothing
    returning id into v_rec_id;

  if v_rec_id is null then
    return query select true, v_pts;
    return;
  end if;

  if v_pts > 0 then
    insert into public.point_events (student_id, points, category, note)
         values (p_student_id, v_pts, 'event_attend', 'Event · ' || v_event.name)
      returning id into v_pe;
    update public.event_attendance set point_event_id = v_pe where id = v_rec_id;
  end if;

  return query select false, v_pts;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Instructor: live monitor stats — total + per-section counts. The monitor
--     POLLS this (event_attendance isn't in realtime), which is what keeps a
--     school-wide event from pushing hundreds of row events.
-- ----------------------------------------------------------------------------
create or replace function public.get_event_stats(p_event_id uuid)
returns table (total bigint, by_section jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can view event stats.';
  end if;
  return query
    select
      (select count(*) from public.event_attendance ea where ea.event_id = p_event_id)::bigint,
      coalesce((
        -- ORDER BY lives INSIDE jsonb_agg: a subquery's ORDER BY is not a
        -- guaranteed aggregate input order, the aggregate's own is.
        select jsonb_agg(r order by r.cnt desc, r.section_name)
        from (
          select coalesce(s.name, 'No section') as section_name,
                 ea.section_id,
                 count(*)::int as cnt
          from public.event_attendance ea
          left join public.sections s on s.id = ea.section_id
          where ea.event_id = p_event_id
          group by ea.section_id, s.name
        ) r
      ), '[]'::jsonb);
end;
$$;

grant execute on function public.start_event_session(text, integer)         to authenticated;
grant execute on function public.end_event_session(uuid)                    to authenticated;
grant execute on function public.scan_event_attendance(uuid, bigint, text)  to authenticated;
grant execute on function public.mark_event_attendance(uuid, uuid)          to authenticated;
grant execute on function public.get_event_stats(uuid)                      to authenticated;

-- ============================================================================
-- Verify (run the whole file twice — every statement is idempotent):
--
--   -- category re-listed, incl. 'event' and the new 'event_attend':
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'point_events_category_check';
--
--   -- exactly ONE of each new function (no accidental overload):
--   select proname, count(*) from pg_proc
--    where proname in ('start_event_session','end_event_session',
--                      'scan_event_attendance','mark_event_attendance',
--                      'get_event_stats')
--    group by proname;
--
--   -- the trigger skip now covers event_attend (grep the body):
--   select pg_get_functiondef('public.cp_notify_point_event'::regproc)
--     like '%''redeem'', ''event_attend''%';   -- t
-- ============================================================================
