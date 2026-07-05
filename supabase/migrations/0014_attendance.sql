-- ============================================================================
-- ClassPoint · 0014 · Attendance (QR-based class sessions)
-- Run after 0013. Safe to re-run (idempotent).
--
-- WHAT THIS ADDS
--   * class_sessions        — one row per class the instructor runs (per section)
--   * class_session_secrets — instructor-only rotating-QR secret (mirrors the
--                             student_secrets pattern; students can never read it,
--                             so they can't precompute QR codes)
--   * attendance_records    — one row per student per session (the "device lock"
--                             is a unique(session_id, student_id) constraint)
--
-- THE FLOW
--   1. Instructor picks a section + config (thresholds, penalties) and calls
--      start_class_session(). A rotating QR is shown; its code is HMAC(secret,
--      session.window) computed in the instructor's browser and re-validated by
--      scan_attendance() here, so a screenshot expires within ~30s.
--   2. Students scan in-app -> scan_attendance() logs present/late/absent from
--      the elapsed time. One scan per student per session.
--   3. Instructor ends the session -> end_class_session() fills in absents for
--      everyone who never scanned. They review/override, then
--      commit_attendance_penalties() writes the -1 (late) / -5 (absent) penalties
--      into point_events (existing 'penalty' category), so attendance flows into
--      XP / the leaderboard exactly like a manual penalty.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.class_sessions (
  id               uuid primary key default gen_random_uuid(),
  section_id       uuid not null references public.sections(id) on delete cascade,
  topic            text,                                    -- optional label, e.g. "Lecture 5"
  status           text not null default 'active' check (status in ('active','ended')),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  -- Minutes after start: at/after this = late; at/after absent_after = absent.
  late_after_min   integer not null default 10 check (late_after_min   >= 0),
  absent_after_min integer not null default 30 check (absent_after_min >= late_after_min),
  -- Penalty magnitudes (stored positive; applied as negative point_events).
  late_penalty     integer not null default 1 check (late_penalty   >= 0),
  absent_penalty   integer not null default 5 check (absent_penalty >= 0),
  -- When false, statuses are still recorded but no points are deducted on commit.
  apply_penalties  boolean not null default true,
  -- Set true once commit_attendance_penalties() has finalised the session.
  penalties_committed boolean not null default false,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists class_sessions_section_idx
  on public.class_sessions (section_id, started_at desc);
-- At most one active session per section (the instructor resumes it, not forks it).
create unique index if not exists class_sessions_one_active_idx
  on public.class_sessions (section_id) where status = 'active';

-- Rotating-QR secret. Instructor-only (like student_secrets); never sent to
-- students, so only the holder can generate valid codes.
create table if not exists public.class_session_secrets (
  session_id uuid primary key references public.class_sessions(id) on delete cascade,
  qr_secret  text not null
);

create table if not exists public.attendance_records (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.class_sessions(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  status           text not null check (status in ('present','late','absent')),
  scanned_at       timestamptz,                             -- null = never scanned (auto-absent)
  committed        boolean not null default false,          -- penalty applied?
  penalty_event_id uuid references public.point_events(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (session_id, student_id)                           -- one record per student per session
);
create index if not exists attendance_session_idx on public.attendance_records (session_id);
create index if not exists attendance_student_idx on public.attendance_records (student_id);

-- ----------------------------------------------------------------------------
-- Functions
-- ----------------------------------------------------------------------------

-- Start (or resume) the section's class session. Instructor-only. Returns the
-- session id + its QR secret so the instructor's browser can render the rotating
-- code. If a session is already active for the section, it's returned as-is
-- (idempotent — a double tap or a page reload just resumes).
create or replace function public.start_class_session(
  p_section_id       uuid,
  p_topic            text default null,
  p_late_after_min   integer default 10,
  p_absent_after_min integer default 30,
  p_late_penalty     integer default 1,
  p_absent_penalty   integer default 5,
  p_apply_penalties  boolean default true
)
returns table (session_id uuid, qr_secret text, started_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id     uuid;
  v_secret text;
  v_start  timestamptz;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can start a class.';
  end if;

  -- Resume an already-running session rather than creating a duplicate.
  select cs.id, css.qr_secret, cs.started_at
    into v_id, v_secret, v_start
    from public.class_sessions cs
    join public.class_session_secrets css on css.session_id = cs.id
   where cs.section_id = p_section_id and cs.status = 'active'
   limit 1;

  if found then
    return query select v_id, v_secret, v_start;
    return;
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.class_sessions (
    section_id, topic, late_after_min, absent_after_min,
    late_penalty, absent_penalty, apply_penalties, created_by
  ) values (
    p_section_id, nullif(btrim(p_topic), ''), p_late_after_min, p_absent_after_min,
    greatest(0, p_late_penalty), greatest(0, p_absent_penalty), p_apply_penalties, auth.uid()
  )
  returning id, started_at into v_id, v_start;

  insert into public.class_session_secrets (session_id, qr_secret)
       values (v_id, v_secret);

  return query select v_id, v_secret, v_start;
end;
$$;

-- Student scans the rotating QR. SECURITY DEFINER so it can read the secret and
-- verify the code without exposing either to the student. Validates the code is
-- current (this window or the previous one), then logs present/late/absent from
-- the elapsed time. Idempotent: a second scan returns the first result.
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
  -- Identify the caller as a claimed student.
  select * into v_student from public.students where user_id = auth.uid();
  if not found then
    raise exception 'Only a signed-in student can check in.';
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

  -- 15-second windows; accept the current or previous one to tolerate scan lag,
  -- so a valid displayed code lasts ~15-30s and older screenshots are rejected.
  v_now_w := floor(extract(epoch from now()) / 15)::bigint;
  if p_window <> v_now_w and p_window <> v_now_w - 1 then
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

-- End the session and auto-mark every non-scanner Absent. Instructor-only.
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

  -- Everyone in the section without a record so far = never scanned = absent.
  insert into public.attendance_records (session_id, student_id, status, scanned_at)
  select p_session_id, s.id, 'absent', null
    from public.students s
    join public.class_sessions cs on cs.id = p_session_id
   where s.section_id = cs.section_id
  on conflict (session_id, student_id) do nothing;
end;
$$;

-- Finalise: write the late (-1) / absent (-5) penalties into point_events. Only
-- deducts when the session's apply_penalties is on; otherwise it just marks the
-- records committed. Idempotent — already-committed records are skipped, so it's
-- safe to call again. Instructor-only.
create or replace function public.commit_attendance_penalties(p_session_id uuid)
returns table (applied integer, deducted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.class_sessions%rowtype;
  v_rec     record;
  v_points  integer;
  v_event   uuid;
  v_label   text;
  v_applied integer := 0;
  v_deducted integer := 0;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can finalise attendance.';
  end if;

  select * into v_session from public.class_sessions where id = p_session_id;
  if not found then
    raise exception 'That class session no longer exists.';
  end if;

  v_label := coalesce(nullif(v_session.topic, ''), to_char(v_session.started_at, 'Mon DD'));

  for v_rec in
    select * from public.attendance_records
     where session_id = p_session_id and committed = false
  loop
    v_event := null;
    v_points := 0;
    if v_session.apply_penalties then
      if v_rec.status = 'late' then
        v_points := v_session.late_penalty;
      elsif v_rec.status = 'absent' then
        v_points := v_session.absent_penalty;
      end if;
    end if;

    if v_points > 0 then
      insert into public.point_events (student_id, points, category, note)
           values (
             v_rec.student_id, -v_points, 'penalty',
             initcap(v_rec.status) || ' · ' || v_label
           )
        returning id into v_event;
      v_applied := v_applied + 1;
      v_deducted := v_deducted + v_points;
    end if;

    update public.attendance_records
       set committed = true, penalty_event_id = v_event
     where id = v_rec.id;
  end loop;

  update public.class_sessions set penalties_committed = true where id = p_session_id;
  return query select v_applied, v_deducted;
end;
$$;

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
alter table public.class_sessions        enable row level security;
alter table public.class_session_secrets enable row level security;
alter table public.attendance_records    enable row level security;

-- class_sessions: any signed-in user may read (topic/time are not sensitive; the
-- secret lives in its own table). Only the instructor writes directly; the RPCs
-- above are SECURITY DEFINER.
drop policy if exists class_sessions_select on public.class_sessions;
create policy class_sessions_select on public.class_sessions
  for select to authenticated using (true);

drop policy if exists class_sessions_write on public.class_sessions;
create policy class_sessions_write on public.class_sessions
  for all to authenticated
  using (public.is_instructor())
  with check (public.is_instructor());

-- class_session_secrets: instructor only. Students never touch it (the scan RPC
-- reads it via SECURITY DEFINER).
drop policy if exists class_session_secrets_all on public.class_session_secrets;
create policy class_session_secrets_all on public.class_session_secrets
  for all to authenticated
  using (public.is_instructor())
  with check (public.is_instructor());

-- attendance_records: instructor sees/edits all; a student sees only their own.
drop policy if exists attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

drop policy if exists attendance_write on public.attendance_records;
create policy attendance_write on public.attendance_records
  for all to authenticated
  using (public.is_instructor())
  with check (public.is_instructor());

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.class_sessions        to authenticated;
grant select, insert, update, delete on public.class_session_secrets to authenticated;
grant select, insert, update, delete on public.attendance_records    to authenticated;

grant execute on function public.start_class_session(uuid, text, integer, integer, integer, integer, boolean) to authenticated;
grant execute on function public.scan_attendance(uuid, bigint, text)        to authenticated;
grant execute on function public.end_class_session(uuid)                    to authenticated;
grant execute on function public.commit_attendance_penalties(uuid)          to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime — the instructor's live roster reacts as students check in.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_records'
  ) then
    alter publication supabase_realtime add table public.attendance_records;
  end if;
end
$$;
