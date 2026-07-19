-- ============================================================================
-- ClassPoint · 0025 · Absence excuses — the DCT-CCS admission-slip flow
-- Run after 0024. Safe to re-run (idempotent).
--
-- THE REAL-WORLD CHAIN THIS MODELS
--   absent → student gets a valid excuse letter → the Dean's office validates
--   it and issues an ADMISSION SLIP → student presents the slip to the
--   instructor in person → only THEN is the absence formally excused.
--   The app queues + tracks this; the decision moment stays physical (the
--   instructor taps Excuse when the slip is in hand).
--
-- FUNCTION OWNERSHIP MOVE (recorded in CLAUDE.md):
--   cp_notify_point_event  0017 → 0025 (same signature; the absence penalty
--   push gains the admission-slip line). Still exactly ONE push per absence.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. absence_excuses
-- ----------------------------------------------------------------------------
create table if not exists public.absence_excuses (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references public.attendance_records(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  reason        text not null check (char_length(btrim(reason)) between 3 and 280),
  -- The student flips this once the Dean's office issues the physical slip.
  has_slip      boolean not null default false,
  slip_updated_at timestamptz,
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','cancelled')),
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) <= 200)
);

-- One open request per record (the race backstop for double-submits).
create unique index if not exists absence_excuses_one_pending_idx
  on public.absence_excuses (record_id) where status = 'pending';
create index if not exists absence_excuses_pending_idx
  on public.absence_excuses (requested_at) where status = 'pending';
create index if not exists absence_excuses_student_idx
  on public.absence_excuses (student_id, requested_at desc);

alter table public.absence_excuses enable row level security;

drop policy if exists absence_excuses_select on public.absence_excuses;
create policy absence_excuses_select on public.absence_excuses
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );
-- No direct write policies — everything goes through the RPCs below.
grant select on public.absence_excuses to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'absence_excuses'
  ) then
    alter publication supabase_realtime add table public.absence_excuses;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. Student RPCs — request / update slip / cancel
-- ----------------------------------------------------------------------------
create or replace function public.request_absence_excuse(
  p_record_id uuid,
  p_reason    text,
  p_has_slip  boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_rec     public.attendance_records%rowtype;
  v_session public.class_sessions%rowtype;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_existing text;
  v_id      uuid;
begin
  select * into v_student from public.students where user_id = auth.uid();
  if not found then
    raise exception 'Only students can request an excuse.';
  end if;
  if v_student.archived_at is not null then
    raise exception 'This account has been archived — talk to your instructor.';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 280 then
    raise exception 'Give a short reason (3–280 characters).';
  end if;

  select * into v_rec from public.attendance_records where id = p_record_id for update;
  if not found then
    raise exception 'That attendance record no longer exists.';
  end if;
  if v_rec.student_id <> v_student.id then
    raise exception 'That is not your record.';
  end if;
  if v_rec.status <> 'absent' then
    raise exception 'Only an absence can be excused this way.';
  end if;

  select * into v_session from public.class_sessions where id = v_rec.session_id;
  if found and now() > v_session.started_at + interval '7 days' then
    raise exception 'The 7-day window to request an excuse for this class has passed — talk to your instructor.';
  end if;

  -- Block a second request on the same record (the partial unique index also
  -- guards pending; this gives a clearer message per prior outcome).
  select status into v_existing
    from public.absence_excuses
   where record_id = p_record_id and status <> 'cancelled'
   order by requested_at desc
   limit 1;
  if v_existing = 'pending' then
    raise exception 'You already have an excuse request waiting for this class.';
  elsif v_existing = 'rejected' then
    raise exception 'The decision on this one is final — talk to your instructor.';
  elsif v_existing = 'approved' then
    raise exception 'This absence is already excused.';
  end if;

  insert into public.absence_excuses (record_id, student_id, reason, has_slip, slip_updated_at)
       values (p_record_id, v_student.id, v_reason, coalesce(p_has_slip, false),
               case when p_has_slip then now() else null end)
    returning id into v_id;
  return v_id;
end;
$$;

-- The student updates their slip status when the Dean issues (or they lose) it.
create or replace function public.set_excuse_slip_status(p_id uuid, p_has_slip boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_excuse public.absence_excuses%rowtype;
begin
  select * into v_excuse from public.absence_excuses where id = p_id for update;
  if not found then
    return;
  end if;
  if not exists (
    select 1 from public.students where id = v_excuse.student_id and user_id = auth.uid()
  ) then
    raise exception 'That is not your request.';
  end if;
  if v_excuse.status <> 'pending' then
    raise exception 'That request has already been decided.';
  end if;

  update public.absence_excuses
     set has_slip = coalesce(p_has_slip, false), slip_updated_at = now()
   where id = p_id;
end;
$$;

create or replace function public.cancel_absence_excuse(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_excuse public.absence_excuses%rowtype;
begin
  select * into v_excuse from public.absence_excuses where id = p_id for update;
  if not found then
    return;
  end if;
  if not exists (
    select 1 from public.students where id = v_excuse.student_id and user_id = auth.uid()
  ) then
    raise exception 'That is not your request.';
  end if;
  if v_excuse.status <> 'pending' then
    raise exception 'That request has already been decided.';
  end if;

  update public.absence_excuses set status = 'cancelled' where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Instructor RPC — decide (Excuse on sight of the slip / Reject)
-- ----------------------------------------------------------------------------
create or replace function public.decide_absence_excuse(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_excuse   public.absence_excuses%rowtype;
  v_rec      public.attendance_records%rowtype;
  v_session  public.class_sessions%rowtype;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_restored int := 0;
  v_label    text;
  v_title    text;
  v_body     text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can decide excuses.';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Keep the note under 200 characters.';
  end if;

  select * into v_excuse from public.absence_excuses where id = p_id for update;
  if not found then
    raise exception 'That request no longer exists.';
  end if;
  if v_excuse.status <> 'pending' then
    raise exception 'That request was already %.', v_excuse.status;
  end if;

  -- Read the record + any committed penalty magnitude BEFORE excusing (the
  -- status change below deletes the penalty event).
  select * into v_rec from public.attendance_records where id = v_excuse.record_id;
  if found then
    select cs.topic, cs.started_at into v_session.topic, v_session.started_at
      from public.class_sessions cs where cs.id = v_rec.session_id;
    if p_approve and v_rec.penalty_event_id is not null then
      select abs(points) into v_restored
        from public.point_events where id = v_rec.penalty_event_id;
    end if;
  end if;
  v_label := coalesce(nullif(v_session.topic, ''), to_char(v_session.started_at, 'Mon DD'), 'that class');

  if p_approve then
    -- Reconcile through the one true path (caller is the instructor → gate
    -- passes; committed −5 is deleted, points restored). No-op if the record
    -- was already excused; raises only if the record vanished mid-decision.
    if v_rec.id is not null then
      perform public.set_attendance_status(v_excuse.record_id, 'excused');
    end if;
    v_title := 'Excuse approved';
    v_body  := 'Excused — ' || v_label || ' won''t count against you.'
             || case when v_restored > 0 then ' Your ' || v_restored || ' points are back.' else '' end;
  else
    v_title := 'Excuse not approved';
    v_body  := coalesce(v_note, 'Your excuse for ' || v_label || ' was not approved.');
  end if;

  update public.absence_excuses
     set status        = case when p_approve then 'approved' else 'rejected' end,
         decided_at    = now(),
         decided_by    = auth.uid(),
         decision_note = v_note
   where id = p_id;

  -- One 'excuse' notification. (Excused inserts no penalty, and deleting one
  -- fires no trigger, so this is the only announcement.)
  perform public.cp_push_dispatch(array[
    public.cp_queue_notification(v_excuse.student_id, 'excuse', v_title, v_body, '/app/attendance')
  ]);
end;
$$;

grant execute on function public.request_absence_excuse(uuid, text, boolean) to authenticated;
grant execute on function public.set_excuse_slip_status(uuid, boolean)       to authenticated;
grant execute on function public.cancel_absence_excuse(uuid)                 to authenticated;
grant execute on function public.decide_absence_excuse(uuid, boolean, text)  to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Process-aware absence push (cp_notify_point_event 0017 → 0025)
--    Same body as 0017, with ONE added branch: a penalty for an absence gets
--    the admission-slip line. Still exactly one push per absence.
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
  if NEW.category = 'redeem' then
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
