-- ============================================================================
-- ClassPoint · 0019 · Use Points — student redemption requests
-- Run after 0018. Safe to re-run (idempotent).
--
-- THE RULE THIS IMPLEMENTS
--   Students can put their class points toward a quiz/activity grade. They
--   request, the instructor approves or rejects, and ONLY on approval are the
--   points actually spent.
--
-- ONE BALANCE (the user's explicit decision): an approved request inserts a
--   NEGATIVE point_events row (category 'redeem'), so spending lowers XP, level
--   and leaderboard rank exactly like losing points would. There is no separate
--   wallet. The student UI warns loudly before they commit.
--
-- OVERSPEND PREVENTION
--   Both RPCs lock `students` FOR UPDATE before checking the balance. That row
--   is the serialization point — concurrent requests, concurrent decisions, and
--   the cp_recompute_points trigger all touch it, so two requests can never both
--   pass a check against the same points. Available = lifetime_points minus
--   everything already pending, so three queued requests can't overdraw either.
--   The balance is re-checked at DECISION time too: points can drop between
--   asking and approving (a penalty, another approval).
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run. (Requires 0017 for the notification helpers.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Teach point_events about spending (keep the constraint names — 0007/0011)
-- ----------------------------------------------------------------------------
alter table public.point_events drop constraint if exists point_events_category_check;
alter table public.point_events
  add constraint point_events_category_check
  check (category in ('recitation', 'activity', 'penalty', 'redeem'));

-- Category-scoped so the instructor's manual award range stays tight at ±100
-- while a redemption is always a debit. The real per-request limit (1–50) is
-- enforced on point_redemptions below; the headroom here just avoids a
-- migration if that limit is ever raised.
alter table public.point_events drop constraint if exists point_events_points_check;
alter table public.point_events
  add constraint point_events_points_check
  check (
    (category = 'redeem' and points between -500 and -1)
    or (category <> 'redeem' and points between -100 and 100 and points <> 0)
  );

-- ----------------------------------------------------------------------------
-- 2. The request ledger
-- ----------------------------------------------------------------------------
create table if not exists public.point_redemptions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  points        int not null check (points between 1 and 50),
  kind          text not null check (kind in ('quiz', 'activity', 'exam', 'other')),
  note          text check (note is null or char_length(btrim(note)) <= 120),
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) <= 200),
  -- The debit this approval created. `on delete set null` mirrors
  -- attendance_records.penalty_event_id.
  point_event_id uuid references public.point_events(id) on delete set null
);

create index if not exists point_redemptions_student_idx
  on public.point_redemptions (student_id, requested_at desc);
create index if not exists point_redemptions_pending_idx
  on public.point_redemptions (requested_at)
  where status = 'pending';

alter table public.point_redemptions enable row level security;

-- Read your own; the instructor reads all. Writes go through the RPCs only.
drop policy if exists point_redemptions_select on public.point_redemptions;
create policy point_redemptions_select on public.point_redemptions
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

grant select on public.point_redemptions to authenticated;

-- Realtime: the student sees a decision land live; the instructor's pending
-- badge updates as requests arrive.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'point_redemptions'
  ) then
    alter publication supabase_realtime add table public.point_redemptions;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 3. Student: request / cancel
-- ----------------------------------------------------------------------------
create or replace function public.request_point_redemption(
  p_points int,
  p_kind   text,
  p_note   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student        public.students%rowtype;
  v_pending_count  int;
  v_pending_points int;
  v_available      int;
  v_note           text := nullif(btrim(coalesce(p_note, '')), '');
  v_id             uuid;
begin
  -- Lock first, validate second: everything below reads a balance.
  select * into v_student from public.students where user_id = auth.uid() for update;
  if not found then
    raise exception 'Only students can request to use points.';
  end if;

  if p_kind is null or p_kind not in ('quiz', 'activity', 'exam', 'other') then
    raise exception 'Pick what these points are for.';
  end if;
  if p_kind = 'other' and v_note is null then
    raise exception 'Add a short note so your instructor knows what this is for.';
  end if;
  if v_note is not null and char_length(v_note) > 120 then
    raise exception 'Keep the note under 120 characters.';
  end if;
  if p_points is null or p_points < 1 or p_points > 50 then
    raise exception 'You can request between 1 and 50 points at a time.';
  end if;

  select count(*)::int, coalesce(sum(points), 0)::int
    into v_pending_count, v_pending_points
    from public.point_redemptions
   where student_id = v_student.id and status = 'pending';

  if v_pending_count >= 3 then
    raise exception 'You already have 3 requests waiting. Cancel one first.';
  end if;

  -- Points already promised to pending requests aren't spendable twice.
  v_available := v_student.lifetime_points - v_pending_points;
  if p_points > v_available then
    raise exception 'Not enough points — you have % available after your pending requests.',
      greatest(v_available, 0);
  end if;

  insert into public.point_redemptions (student_id, points, kind, note)
       values (v_student.id, p_points, p_kind, v_note)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_point_redemption(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.point_redemptions%rowtype;
begin
  select * into v_req from public.point_redemptions where id = p_id for update;
  if not found then
    return;
  end if;
  if not exists (
    select 1 from public.students
     where id = v_req.student_id and user_id = auth.uid()
  ) then
    raise exception 'That is not your request.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'That request was already %.', v_req.status;
  end if;

  update public.point_redemptions set status = 'cancelled' where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Instructor: decide
-- ----------------------------------------------------------------------------
create or replace function public.decide_point_redemption(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req     public.point_redemptions%rowtype;
  v_student public.students%rowtype;
  v_event   uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_label   text;
  v_title   text;
  v_body    text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can decide requests.';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Keep the note under 200 characters.';
  end if;

  -- Lock the request (guards a double-tap on Approve), then the student row.
  -- Same lock order as request_point_redemption → no deadlock between them.
  select * into v_req from public.point_redemptions where id = p_id for update;
  if not found then
    raise exception 'That request no longer exists.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'That request was already %.', v_req.status;
  end if;

  select * into v_student from public.students where id = v_req.student_id for update;
  if not found then
    raise exception 'That student no longer exists.';
  end if;

  v_label := case v_req.kind
               when 'quiz' then 'Quiz'
               when 'activity' then 'Activity'
               when 'exam' then 'Exam'
               else 'Other'
             end;

  if p_approve then
    -- Re-validate: their balance may have dropped since they asked.
    if v_req.points > v_student.lifetime_points then
      raise exception 'They only have % points now — not enough for this request.',
        v_student.lifetime_points;
    end if;

    insert into public.point_events (student_id, points, category, note)
         values (
           v_req.student_id, -v_req.points, 'redeem',
           'Used · ' || v_label || coalesce(' · ' || v_req.note, '')
         )
      returning id into v_event;
  end if;

  update public.point_redemptions
     set status         = case when p_approve then 'approved' else 'rejected' end,
         decided_at     = now(),
         decided_by     = auth.uid(),
         decision_note  = v_note,
         point_event_id = v_event
   where id = p_id;

  -- One push per decision: cp_notify_point_event (0017) deliberately skips
  -- 'redeem' rows so the debit above doesn't also announce itself.
  if p_approve then
    v_title := 'Request approved — ' || v_req.points || ' points used';
    v_body  := coalesce(v_note, 'Applied to your ' || lower(v_label) || '. Worth it.');
  else
    v_title := 'Request declined';
    v_body  := coalesce(v_note, 'Your ' || v_req.points || ' points are still yours.');
  end if;

  perform public.cp_push_dispatch(array[
    public.cp_queue_notification(v_req.student_id, 'redemption', v_title, v_body, '/app/points')
  ]);
end;
$$;

grant execute on function public.request_point_redemption(int, text, text) to authenticated;
grant execute on function public.cancel_point_redemption(uuid)             to authenticated;
grant execute on function public.decide_point_redemption(uuid, boolean, text) to authenticated;
