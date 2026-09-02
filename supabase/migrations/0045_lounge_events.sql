-- ============================================================================
-- ClassPoint · 0045 · Random Events
-- Run after 0044. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   The instructor posts a question into the Lounge; students answer; points
--   are paid out when it closes. Two modes, and the difference is one column:
--     • `answer_key` SET   → correct answers are paid automatically on close.
--     • `answer_key` NULL  → open-ended, and the instructor awards by hand.
--
-- ── ANSWERS ARE SEALED UNTIL CLOSE, AND THAT IS THE WHOLE DESIGN ────────────
--   While an event is open a student can read ONLY their own answer; everyone
--   else sees a count. It is enforced in RLS, not in the client, because the
--   alternative is the first correct answer being copied by the whole class and
--   auto-award paying the fastest copier rather than the fastest thinker.
--
-- ── CLOSING IS THE ONLY THING THAT PAYS ─────────────────────────────────────
--   `cp_close_event_core()` is idempotent: a second call on a closed event
--   awards nothing. That matters because THREE things can close an event — the
--   instructor, the cron at `closes_at`, and a retried request — and any two of
--   them racing must not pay twice.
--
--   Winners are the first `winner_cap` CORRECT answers by submission time. Ties
--   are impossible: `created_at` plus the row id is a total order.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. The auto-close job registers itself below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Widen the ledger's category
--
--    Name preserved (0007/0011/0019). Every earlier value RE-LISTED.
--
--    `point_events_points_check` needs NO change: its `category <> 'redeem'`
--    branch already allows -100..100, and an event pays 1..50.
--
--    Reusing 'activity' would have been free. It was rejected because then
--    "how many points came from Random Events?" is unanswerable forever, and
--    the ledger is the one place in this app that has to stay honest.
-- ----------------------------------------------------------------------------
alter table public.point_events drop constraint if exists point_events_category_check;
alter table public.point_events
  add constraint point_events_category_check
  check (category in ('recitation', 'activity', 'penalty', 'redeem', 'event'));

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.lounge_events (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null default public.cp_active_semester_id()
                references public.semesters(id) on delete cascade,
  question    text not null check (char_length(btrim(question)) between 1 and 600),
  points      int not null check (points between 1 and 50),
  -- How many correct answers get paid. Without it an answer-key event pays the
  -- entire class, and the race is pointless.
  winner_cap  int not null default 5 check (winner_cap between 1 and 200),
  -- NULL = open-ended: nothing to match, so the instructor awards by hand.
  answer_key  text,
  -- NULL = open until closed by hand. Otherwise the cron closes it.
  closes_at   timestamptz,
  status      text not null default 'open' check (status in ('open', 'closed')),
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists lounge_events_open_idx
  on public.lounge_events (semester_id, created_at desc) where status = 'open';
create index if not exists lounge_events_due_idx
  on public.lounge_events (closes_at) where status = 'open' and closes_at is not null;

create table if not exists public.lounge_event_answers (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.lounge_events(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  display_name   text not null,
  avatar_url     text,
  body           text not null check (char_length(btrim(body)) between 1 and 600),
  -- Both set at close.
  is_correct     boolean,
  awarded_points int,
  point_event_id uuid,
  created_at     timestamptz not null default now(),
  -- ONE ANSWER EACH. Also what makes "first N by submission time" meaningful.
  unique (event_id, student_id)
);
create index if not exists lounge_event_answers_order_idx
  on public.lounge_event_answers (event_id, created_at, id);

alter table public.lounge_events        enable row level security;
alter table public.lounge_event_answers enable row level security;

-- ----------------------------------------------------------------------------
-- 3. RLS
--
--    The events themselves are readable by anyone with Student Space open —
--    but `answer_key` is a column on this table, so the CLIENT MUST NEVER
--    SELECT IT. Every read below goes through an RPC that omits it. A student
--    who can read the key can win every event.
-- ----------------------------------------------------------------------------
drop policy if exists lounge_events_select on public.lounge_events;
create policy lounge_events_select on public.lounge_events
  for select to authenticated using (
    public.is_instructor() or public.cp_space_state() = 'open'
  );

/*
 * THE ANTI-COPY RULE.
 *
 * While an event is open you can read your OWN answer and nobody else's. Once
 * it is closed, everything reveals. Nothing client-side is trusted for this:
 * the feed shows a count, and the count is all the database will give it.
 */
drop policy if exists lounge_event_answers_select on public.lounge_event_answers;
create policy lounge_event_answers_select on public.lounge_event_answers
  for select to authenticated using (
    public.is_instructor()
    or student_id = public.cp_my_student_id()
    or exists (
      select 1 from public.lounge_events e
       where e.id = event_id and e.status = 'closed'
    )
  );

-- No INSERT/UPDATE/DELETE policies anywhere: every write is an RPC. And the
-- events table is not granted at all — `answer_key` lives on it.
grant select on public.lounge_event_answers to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Answer matching
--
--    ⚠ THIS FUNCTION IS MIRRORED IN src/lib/lounge-answers.ts AND PINNED BY A
--    TEST. A drift between the two means the preview the instructor sees of who
--    would win disagrees with who actually gets paid — and points are the thing
--    this whole app is about. Change one, change the other, in the same commit.
--
--    Case, surrounding whitespace, internal runs of whitespace and punctuation
--    are all ignored, so "Run-time polymorphism." matches "runtime polymorphism".
-- ----------------------------------------------------------------------------
create or replace function public.cp_event_normalize(p_text text)
returns text
language sql
immutable
as $$
  select btrim(
           regexp_replace(
             regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9 ]', '', 'g'),
             '\s+', ' ', 'g'
           )
         );
$$;

grant execute on function public.cp_event_normalize(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Creating and answering
-- ----------------------------------------------------------------------------
drop function if exists public.create_lounge_event(text, int, int, text, timestamptz);
create function public.create_lounge_event(
  p_question   text,
  p_points     int,
  p_winner_cap int         default 5,
  p_answer_key text        default null,
  p_closes_at  timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_q     text;
  v_ids   uuid[];
  v_chunk uuid[];
  i       int;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can post an event.';
  end if;

  v_q := btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g'));
  if v_q = '' then
    raise exception 'Ask something first.';
  end if;
  if char_length(v_q) > 600 then
    raise exception 'Keep the question under 600 characters.';
  end if;
  if p_points is null or p_points < 1 or p_points > 50 then
    raise exception 'Points must be between 1 and 50.';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'Pick a closing time in the future.';
  end if;

  insert into public.lounge_events (question, points, winner_cap, answer_key, closes_at)
       values (v_q, p_points, coalesce(p_winner_cap, 5),
               nullif(btrim(coalesce(p_answer_key, '')), ''), p_closes_at)
    returning id into v_id;

  -- Tell everyone in the beta. An event nobody sees is an event nobody answers,
  -- and unlike a chat message this is rare enough to earn the interruption.
  with targets as (
    select stu.id
      from public.students stu
      join public.sections sec on sec.id = stu.section_id
     where sec.space_enabled
       and sec.semester_id = public.cp_active_semester_id()
       and stu.archived_at is null
  ), inserted as (
    insert into public.notifications (student_id, type, title, body, url)
    select t.id, 'space_event', 'New Random Event',
           left(v_q, 120) || ' · ' || p_points || ' points',
           '/app/space/lounge'
      from targets t
    returning id
  )
  select array_agg(id) into v_ids from inserted;

  -- Chunked at 50 — cp_push_dispatch puts every id in ONE http body (0034).
  if v_ids is not null then
    i := 1;
    while i <= array_length(v_ids, 1) loop
      v_chunk := v_ids[i : least(i + 49, array_length(v_ids, 1))];
      perform public.cp_push_dispatch(v_chunk);
      i := i + 50;
    end loop;
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_lounge_event(text, int, int, text, timestamptz) to authenticated;

drop function if exists public.submit_event_answer(uuid, text);
create function public.submit_event_answer(p_event uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_event   public.lounge_events%rowtype;
  v_body    text;
  v_id      uuid;
begin
  -- Same gate as every other Student Space write: space open, not muted.
  v_student := public.cp_lounge_author();
  v_body    := public.cp_lounge_clean(p_body);

  select * into v_event from public.lounge_events where id = p_event;
  if not found then
    raise exception 'That event is gone.';
  end if;
  if v_event.status <> 'open' then
    raise exception 'That event is closed.';
  end if;
  if v_event.closes_at is not null and v_event.closes_at <= now() then
    raise exception 'Too late — that one has closed.';
  end if;

  -- One answer each. Changing it is allowed while the event is open: nobody
  -- else can see it yet, so there is nothing to game, and refusing an edit
  -- punishes a typo rather than a cheat.
  insert into public.lounge_event_answers
         (event_id, student_id, display_name, avatar_url, body)
       values (p_event, v_student.id, v_student.display_name, v_student.avatar_url, v_body)
  on conflict (event_id, student_id) do update
       set body = excluded.body, created_at = now()
    returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_event_answer(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Closing — the only thing that pays
-- ----------------------------------------------------------------------------

/*
 * The core. NO instructor check: the cron calls it too.
 *
 * Idempotent by construction — it takes a row lock, returns immediately if the
 * event is already closed, and only then awards. Three things can close an
 * event (the instructor, the cron, a retried request) and any two racing must
 * not pay twice.
 */
create or replace function public.cp_close_event_core(p_event uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event   public.lounge_events%rowtype;
  v_key     text;
  v_ans     record;
  v_rank    int := 0;
  v_paid    int := 0;
  v_pe      uuid;
  v_names   text[] := array[]::text[];
  v_ids     uuid[] := array[]::uuid[];
  v_chunk   uuid[];
  i         int;
begin
  -- FOR UPDATE is what makes the double-close safe.
  select * into v_event from public.lounge_events where id = p_event for update;
  if not found or v_event.status = 'closed' then
    return 0;
  end if;

  update public.lounge_events
     set status = 'closed', closed_at = now()
   where id = p_event;

  -- Open-ended: nothing to match. Answers reveal; the instructor awards later.
  if v_event.answer_key is null then
    return 0;
  end if;

  v_key := public.cp_event_normalize(v_event.answer_key);

  for v_ans in
    select * from public.lounge_event_answers
     where event_id = p_event
     order by created_at, id            -- a total order: no ambiguous ties
  loop
    if public.cp_event_normalize(v_ans.body) = v_key then
      update public.lounge_event_answers set is_correct = true where id = v_ans.id;
      v_rank := v_rank + 1;

      if v_rank <= v_event.winner_cap then
        insert into public.point_events (student_id, points, category, note)
             values (v_ans.student_id, v_event.points, 'event',
                     'Random Event: ' || left(v_event.question, 80))
          returning id into v_pe;

        update public.lounge_event_answers
           set awarded_points = v_event.points, point_event_id = v_pe
         where id = v_ans.id;

        v_names := v_names || v_ans.display_name;
        v_paid := v_paid + 1;

        -- cp_notify_point_event (0017) already pushes for a point_events row,
        -- so queueing another here would double-notify. This is the same rule
        -- commit_attendance_penalties follows.
      end if;
    else
      update public.lounge_event_answers set is_correct = false where id = v_ans.id;
    end if;
  end loop;

  -- The reveal gets its own moment in the feed.
  if v_paid > 0 then
    insert into public.lounge_posts
      (kind, author_student_id, display_name, avatar_url, body, pulse_kind, pulse_value)
    values
      ('pulse', null, 'ClassPoint', null,
       array_to_string(v_names, ', ') ||
         (case when v_paid = 1 then ' got it: ' else ' got it: ' end) ||
         left(v_event.question, 100),
       'event', v_paid);
  end if;

  return v_paid;
end;
$$;

revoke execute on function public.cp_close_event_core(uuid) from public, anon, authenticated;

drop function if exists public.close_lounge_event(uuid);
create function public.close_lounge_event(p_event uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can close an event.';
  end if;
  return public.cp_close_event_core(p_event);
end;
$$;

grant execute on function public.close_lounge_event(uuid) to authenticated;

-- The deadline. Closes and pays out on time, without the instructor being
-- awake — which is why the core above is idempotent and takes a row lock.
create or replace function public.cp_close_due_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.lounge_events
     where status = 'open' and closes_at is not null and closes_at <= now()
  loop
    perform public.cp_close_event_core(v_id);
  end loop;
end;
$$;

revoke execute on function public.cp_close_due_events() from public, anon, authenticated;

select cron.schedule(
  'classpoint-close-due-events', '* * * * *',
  $cron$select public.cp_close_due_events();$cron$
);

-- ----------------------------------------------------------------------------
-- 7. Manual award (open-ended events)
-- ----------------------------------------------------------------------------
drop function if exists public.award_event_answer(uuid);
create function public.award_event_answer(p_answer uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ans   public.lounge_event_answers%rowtype;
  v_event public.lounge_events%rowtype;
  v_pe    uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can award an answer.';
  end if;

  select * into v_ans from public.lounge_event_answers where id = p_answer for update;
  if not found then
    raise exception 'That answer is gone.';
  end if;
  -- Idempotent: tapping Award twice must not pay twice.
  if v_ans.point_event_id is not null then
    return v_ans.awarded_points;
  end if;

  select * into v_event from public.lounge_events where id = v_ans.event_id;

  insert into public.point_events (student_id, points, category, note)
       values (v_ans.student_id, v_event.points, 'event',
               'Random Event: ' || left(v_event.question, 80))
    returning id into v_pe;

  update public.lounge_event_answers
     set awarded_points = v_event.points, point_event_id = v_pe, is_correct = true
   where id = p_answer;

  return v_event.points;
end;
$$;

grant execute on function public.award_event_answer(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Reading
--
--    ⚠ NOT ONE of these returns `answer_key`. It is a column on a table the
--    client can select, so every read path here omits it deliberately — a
--    student who can read the key wins every event.
-- ----------------------------------------------------------------------------
drop function if exists public.get_open_event();
create function public.get_open_event()
returns table (
  id           uuid,
  question     text,
  points       int,
  winner_cap   int,
  has_key      boolean,
  closes_at    timestamptz,
  answer_count int,
  my_answer    text,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.cp_my_student_id();
begin
  if not public.is_instructor() and public.cp_space_state() <> 'open' then
    return;
  end if;

  return query
    select e.id, e.question, e.points, e.winner_cap,
           e.answer_key is not null,          -- whether, never what
           e.closes_at,
           (select count(*)::int from public.lounge_event_answers a where a.event_id = e.id),
           (select a.body from public.lounge_event_answers a
             where a.event_id = e.id and a.student_id = v_me),
           e.created_at
      from public.lounge_events e
     where e.semester_id = public.cp_active_semester_id()
       and e.status = 'open'
     order by e.created_at desc
     limit 1;
end;
$$;

grant execute on function public.get_open_event() to authenticated;

drop function if exists public.get_event_answers(uuid);
create function public.get_event_answers(p_event uuid)
returns table (
  id             uuid,
  student_id     uuid,
  display_name   text,
  avatar_url     text,
  body           text,
  is_correct     boolean,
  awarded_points int,
  created_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me     uuid := public.cp_my_student_id();
  v_status text;
begin
  select status into v_status from public.lounge_events where id = p_event;
  if v_status is null then
    return;
  end if;

  -- THE ANTI-COPY RULE, again. The RLS policy says the same thing; this says it
  -- where a reader of the function can see it, and neither depends on the other.
  if not public.is_instructor() and v_status <> 'closed' then
    return query
      select a.id, a.student_id, a.display_name, a.avatar_url, a.body,
             a.is_correct, a.awarded_points, a.created_at
        from public.lounge_event_answers a
       where a.event_id = p_event and a.student_id = v_me;
    return;
  end if;

  return query
    select a.id, a.student_id, a.display_name, a.avatar_url, a.body,
           a.is_correct, a.awarded_points, a.created_at
      from public.lounge_event_answers a
     where a.event_id = p_event
     order by a.created_at, a.id;
end;
$$;

grant execute on function public.get_event_answers(uuid) to authenticated;

-- The instructor's history on /teach/space.
drop function if exists public.list_lounge_events();
create function public.list_lounge_events()
returns table (
  id            uuid,
  question      text,
  points        int,
  winner_cap    int,
  has_key       boolean,
  closes_at     timestamptz,
  status        text,
  closed_at     timestamptz,
  answer_count  int,
  awarded_count int,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.question, e.points, e.winner_cap, e.answer_key is not null,
         e.closes_at, e.status, e.closed_at,
         (select count(*)::int from public.lounge_event_answers a where a.event_id = e.id),
         (select count(*)::int from public.lounge_event_answers a
           where a.event_id = e.id and a.point_event_id is not null),
         e.created_at
    from public.lounge_events e
   where public.is_instructor()
     and e.semester_id = public.cp_active_semester_id()
   order by e.created_at desc
   limit 50;
$$;

grant execute on function public.list_lounge_events() to authenticated;

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- 1. The ledger accepts the new category, and still accepts the old ones:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'point_events_category_check';
--   -- must list recitation, activity, penalty, redeem AND event.
--
--   -- 2. THE ANTI-COPY RULE. With an OPEN event and two students who have both
--   --    answered, as student A:
--   select count(*) from public.lounge_event_answers where event_id = '<event>';
--   -- expect 1 — their own. If this returns 2, the first correct answer is
--   -- copyable and auto-award pays the fastest copier.
--
--   -- 3. Closing pays the first N correct, in submission order:
--   --   select public.close_lounge_event('<event>');   -- returns the count paid
--   select display_name, is_correct, awarded_points
--     from public.lounge_event_answers where event_id = '<event>'
--    order by created_at;
--   -- expect awarded_points set on the first `winner_cap` correct rows only.
--
--   -- 4. CLOSING TWICE PAYS NOTHING EXTRA. This is the one that matters, since
--   --    the cron and the instructor can both close the same event:
--   --   select public.close_lounge_event('<event>');   -- expect 0
--   select count(*) from public.point_events
--    where category = 'event' and note like 'Random Event:%';
--   -- must be unchanged.
--
--   -- 5. Awarding an open-ended answer twice pays once:
--   --   select public.award_event_answer('<answer>');  -- e.g. 5
--   --   select public.award_event_answer('<answer>');  -- 5 again, no new row
--
--   -- 6. The answer key is never returned by any read path:
--   select * from public.get_open_event();       -- has_key boolean, no key
--   select * from public.list_lounge_events();   -- same
--
--   -- 7. The auto-close job is registered exactly once:
--   select jobname, schedule from cron.job where jobname = 'classpoint-close-due-events';
-- ============================================================================
