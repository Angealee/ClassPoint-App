-- ============================================================================
-- ClassPoint · 0044 · Student Space moderation
-- Run after 0043. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   Reports, auto-hide, and the instructor's review queue. It is the last file
--   before Student Space can safely be opened to anyone but the instructor:
--   0042 and 0043 give students places to write, and this is the only thing
--   that lets a bad afternoon be undone without opening the SQL editor.
--
-- ── ONE QUEUE ITEM PER TARGET, NOT PER REPORT ───────────────────────────────
--   The unique constraint is (target_type, target_id, reporter) — one report
--   each. The queue then GROUPS by target, so seven people reporting one post
--   is one item that says "7", listing who. The instructor's decision is about
--   the content, not about each complaint.
--
-- ── AUTO-HIDE AT 7 ──────────────────────────────────────────────────────────
--   Counted over UNRESOLVED reports only. That matters: after the instructor
--   restores something, the counter starts again from zero, so a group cannot
--   re-bury a post by adding one more report to an old pile.
--
--   Auto-hide withholds the BODY server-side (0042 and 0043 already do this in
--   every read path), so it is not a rendering preference the client can
--   ignore.
--
-- ── A REPORTED DM IS DELIBERATELY NOT SHOWN IN THE QUEUE ────────────────────
--   The queue shows the reason and who reported it, and nothing else. Reading
--   the message means `read_dm_thread()` — which writes an audit row. If the
--   queue printed the body, every DM report would be a silent break-glass and
--   the promise made on the DM screen would be false in the one case it is
--   most likely to be tested.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Widen the audit constraint
--
--    Name preserved; 0041's and 0043's values RE-LISTED. Dropping and
--    recreating narrows it silently otherwise.
-- ----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'delete','archive','restore','hard_delete','broadcast',
    'promote','semester_activate',
    'space_flag','space_section','space_timeout',
    'space_break_glass','space_moderate'
  ));

-- ----------------------------------------------------------------------------
-- 2. Table
-- ----------------------------------------------------------------------------
create table if not exists public.space_reports (
  id                  uuid primary key default gen_random_uuid(),
  target_type         text not null check (target_type in ('post', 'reply', 'message')),
  -- No FK: the target lives in one of three tables, and a report must survive
  -- the thing it is about being deleted — that is exactly the case worth
  -- reviewing.
  target_id           uuid not null,
  reporter_student_id uuid not null references public.students(id) on delete cascade,
  reason              text not null
                        check (reason in ('harassment', 'inappropriate', 'spam', 'other')),
  note                text check (note is null or char_length(note) <= 300),
  resolved_at         timestamptz,
  resolved_by         uuid,
  resolved_action     text check (resolved_action is null
                                  or resolved_action in ('delete', 'restore', 'dismiss')),
  created_at          timestamptz not null default now(),
  -- One report each: this is what makes the queue group cleanly, and what stops
  -- one student manufacturing an auto-hide on their own.
  unique (target_type, target_id, reporter_student_id)
);
create index if not exists space_reports_open_idx
  on public.space_reports (target_type, target_id)
  where resolved_at is null;
create index if not exists space_reports_reporter_idx
  on public.space_reports (reporter_student_id, created_at desc);

alter table public.space_reports enable row level security;

-- A student sees only their OWN reports (so the UI can say "you reported
-- this"); the instructor sees everything. No write policies — reporting goes
-- through the RPC so the dedupe and the auto-hide cannot be skipped.
drop policy if exists space_reports_select on public.space_reports;
create policy space_reports_select on public.space_reports
  for select to authenticated using (
    public.is_instructor() or reporter_student_id = public.cp_my_student_id()
  );

grant select on public.space_reports to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Helpers
-- ----------------------------------------------------------------------------

/** How many DISTINCT unresolved reports a target has. */
create or replace function public.cp_open_report_count(p_type text, p_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct reporter_student_id)::int
    from public.space_reports
   where target_type = p_type and target_id = p_id and resolved_at is null;
$$;

revoke execute on function public.cp_open_report_count(text, uuid) from public, anon, authenticated;

/** Set or clear `hidden_at` on whichever of the three tables owns this target. */
create or replace function public.cp_set_hidden(p_type text, p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := case when p_hidden then now() else null end;
begin
  if p_type = 'post' then
    update public.lounge_posts   set hidden_at = v_at where id = p_id;
  elsif p_type = 'reply' then
    update public.lounge_replies set hidden_at = v_at where id = p_id;
  elsif p_type = 'message' then
    update public.space_messages set hidden_at = v_at where id = p_id;
  end if;
end;
$$;

revoke execute on function public.cp_set_hidden(text, uuid, boolean) from public, anon, authenticated;

/** Soft-delete whichever of the three tables owns this target. */
create or replace function public.cp_soft_delete_target(p_type text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_type = 'post' then
    update public.lounge_posts   set deleted_at = now() where id = p_id and deleted_at is null;
  elsif p_type = 'reply' then
    update public.lounge_replies set deleted_at = now() where id = p_id and deleted_at is null;
  elsif p_type = 'message' then
    update public.space_messages set deleted_at = now() where id = p_id and deleted_at is null;
  end if;
end;
$$;

revoke execute on function public.cp_soft_delete_target(text, uuid) from public, anon, authenticated;

/** Does this target exist, and may the caller see it? */
create or replace function public.cp_target_visible(p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room uuid;
begin
  if p_type = 'post' then
    return exists (select 1 from public.lounge_posts where id = p_id and deleted_at is null)
       and (public.is_instructor() or public.cp_space_state() = 'open');
  elsif p_type = 'reply' then
    return exists (select 1 from public.lounge_replies where id = p_id and deleted_at is null)
       and (public.is_instructor() or public.cp_space_state() = 'open');
  elsif p_type = 'message' then
    select room_id into v_room from public.space_messages
     where id = p_id and deleted_at is null;
    if v_room is null then
      return false;
    end if;
    return public.cp_can_read_room(v_room);
  end if;
  return false;
end;
$$;

revoke execute on function public.cp_target_visible(text, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Reporting
-- ----------------------------------------------------------------------------
drop function if exists public.report_content(text, uuid, text, text);
create function public.report_content(
  p_type   text,
  p_id     uuid,
  p_reason text,
  p_note   text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_count int;
  v_note  text;
begin
  if v_me is null then
    raise exception 'Only students can report.';
  end if;
  if p_type not in ('post', 'reply', 'message') then
    raise exception 'Unknown thing to report.';
  end if;
  if p_reason not in ('harassment', 'inappropriate', 'spam', 'other') then
    raise exception 'Pick a reason.';
  end if;
  -- You must be able to SEE something to report it. Without this, a student
  -- could report by id alone and manufacture an auto-hide on content they were
  -- never shown — including in a DM they are not in.
  if not public.cp_target_visible(p_type, p_id) then
    raise exception 'That is no longer there.';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 300 then
    v_note := left(v_note, 300);
  end if;

  insert into public.space_reports (target_type, target_id, reporter_student_id, reason, note)
       values (p_type, p_id, v_me, p_reason, v_note)
  on conflict (target_type, target_id, reporter_student_id) do nothing;

  v_count := public.cp_open_report_count(p_type, p_id);

  -- AUTO-HIDE. Seven distinct people, counted over UNRESOLVED reports only —
  -- so a restore genuinely resets the pile rather than leaving it one report
  -- away from hiding again.
  if v_count >= 7 then
    perform public.cp_set_hidden(p_type, p_id, true);
    insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
         values (null, 'space_moderate', p_type, p_id,
                 'Auto-hidden after ' || v_count || ' reports',
                 jsonb_build_object('target_type', p_type, 'reports', v_count, 'auto', true));
  end if;

  return v_count;
end;
$$;

grant execute on function public.report_content(text, uuid, text, text) to authenticated;

-- What the caller has already reported, so the UI can say so instead of
-- offering a button that will silently do nothing.
drop function if exists public.my_reported_ids(text, uuid[]);
create function public.my_reported_ids(p_type text, p_ids uuid[])
returns table (target_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select r.target_id
    from public.space_reports r
   where r.reporter_student_id = public.cp_my_student_id()
     and r.target_type = p_type
     and r.target_id = any(coalesce(p_ids, array[]::uuid[]));
$$;

grant execute on function public.my_reported_ids(text, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. The instructor's queue
--
--    One row per reported TARGET, newest first. `body` is null for a message in
--    a DM room — see the header: printing it here would make every DM report a
--    silent break-glass.
-- ----------------------------------------------------------------------------
drop function if exists public.get_space_report_queue();
create function public.get_space_report_queue()
returns table (
  target_type   text,
  target_id     uuid,
  report_count  int,
  reporters     text[],
  reasons       text[],
  notes         text[],
  first_at      timestamptz,
  author_name   text,
  author_id     uuid,
  body          text,
  context       text,
  is_dm         boolean,
  room_id       uuid,
  is_hidden     boolean,
  is_deleted    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can review reports.';
  end if;

  return query
  with open_reports as (
    select r.target_type as tt,
           r.target_id   as ti,
           count(distinct r.reporter_student_id)::int as n,
           array_agg(distinct stu.display_name) as who,
           array_agg(distinct r.reason)         as why,
           array_remove(array_agg(r.note), null) as notes,
           min(r.created_at) as first_at
      from public.space_reports r
      join public.students stu on stu.id = r.reporter_student_id
     where r.resolved_at is null
     group by r.target_type, r.target_id
  )
  select
    o.tt, o.ti, o.n, o.who, o.why, o.notes, o.first_at,
    case o.tt
      when 'post'    then p.display_name
      when 'reply'   then rp.display_name
      else m.display_name
    end,
    case o.tt
      when 'post'    then p.author_student_id
      when 'reply'   then rp.author_student_id
      else m.author_student_id
    end,
    case o.tt
      when 'post'  then p.body
      when 'reply' then rp.body
      -- A DM's text is withheld even from this screen. `read_dm_thread()` is
      -- the way in, and it leaves a record.
      else case when rm.kind = 'dm' then null else m.body end
    end,
    case o.tt
      when 'post'  then 'Lounge post'
      when 'reply' then 'Lounge reply'
      else case rm.kind
             when 'dm'      then 'Direct message'
             when 'global'  then 'Global room'
             else 'Section room'
           end
    end,
    coalesce(rm.kind = 'dm', false),
    m.room_id,
    coalesce(
      case o.tt when 'post' then p.hidden_at when 'reply' then rp.hidden_at else m.hidden_at end
        is not null, false),
    coalesce(
      case o.tt when 'post' then p.deleted_at when 'reply' then rp.deleted_at else m.deleted_at end
        is not null, false)
  from open_reports o
  left join public.lounge_posts   p  on o.tt = 'post'    and p.id  = o.ti
  left join public.lounge_replies rp on o.tt = 'reply'   and rp.id = o.ti
  left join public.space_messages m  on o.tt = 'message' and m.id  = o.ti
  left join public.space_rooms    rm on rm.id = m.room_id
  order by o.first_at desc;
end;
$$;

grant execute on function public.get_space_report_queue() to authenticated;

-- Drives the Requests badge, the same way the redemption and excuse counts do.
drop function if exists public.count_open_reports();
create function public.count_open_reports()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_instructor() then (
    select count(distinct (target_type, target_id))::int
      from public.space_reports where resolved_at is null
  ) else 0 end;
$$;

grant execute on function public.count_open_reports() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Resolving
-- ----------------------------------------------------------------------------
drop function if exists public.resolve_report(text, uuid, text);
create function public.resolve_report(p_type text, p_id uuid, p_action text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_ids   uuid[];
  v_chunk uuid[];
  i       int;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can resolve a report.';
  end if;
  if p_action not in ('delete', 'restore', 'dismiss') then
    raise exception 'Unknown action.';
  end if;

  if p_action = 'delete' then
    perform public.cp_soft_delete_target(p_type, p_id);
  elsif p_action = 'restore' then
    -- Clears an auto-hide. The counterweight to hiding at 7: a group can bury
    -- something they merely disagree with, and this is the only way back.
    perform public.cp_set_hidden(p_type, p_id, false);
  end if;
  -- 'dismiss' leaves the content exactly as it is, hidden or not.

  update public.space_reports
     set resolved_at = now(), resolved_by = auth.uid(), resolved_action = p_action
   where target_type = p_type and target_id = p_id and resolved_at is null;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return 0;                            -- already resolved; idempotent
  end if;

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'space_moderate', p_type, p_id,
               'Report resolved: ' || p_action,
               jsonb_build_object('target_type', p_type, 'action', p_action,
                                  'reports', v_count));

  -- Tell every reporter it was looked at — no outcome, which is between the
  -- instructor and the other student. Closing the loop is what keeps the
  -- report button worth pressing.
  with targets as (
    select distinct r.reporter_student_id as sid
      from public.space_reports r
     where r.target_type = p_type and r.target_id = p_id
       and r.resolved_at is not null
  ), inserted as (
    insert into public.notifications (student_id, type, title, body, url)
    select t.sid, 'space_report', 'Your report was reviewed',
           'Thanks for flagging it.', '/app/space'
      from targets t
    returning id
  )
  select array_agg(id) into v_ids from inserted;

  -- Chunked at 50: cp_push_dispatch puts every id in ONE http body (0034).
  if v_ids is not null then
    i := 1;
    while i <= array_length(v_ids, 1) loop
      v_chunk := v_ids[i : least(i + 49, array_length(v_ids, 1))];
      perform public.cp_push_dispatch(v_chunk);
      i := i + 50;
    end loop;
  end if;

  return v_count;
end;
$$;

grant execute on function public.resolve_report(text, uuid, text) to authenticated;

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- 1. One report each, and the dedupe holds:
--   --   select public.report_content('post','<post>','spam');    -- 1
--   --   select public.report_content('post','<post>','spam');    -- still 1
--
--   -- 2. You cannot report what you cannot see. As a student, against a post
--   --    id from a DM or a deleted row:
--   --   select public.report_content('message','<a DM message>','spam');
--   --   -- ERROR: That is no longer there.
--   --   Without this, a student could manufacture an auto-hide on content they
--   --   were never shown.
--
--   -- 3. AUTO-HIDE AT 7, over UNRESOLVED reports only. With seven different
--   --    students reporting one post:
--   select hidden_at is not null as hidden from public.lounge_posts where id = '<post>';
--   -- expect true, and the body is withheld from every student read path.
--
--   -- 4. Restore genuinely RESETS the pile:
--   --   select public.resolve_report('post','<post>','restore');
--   select public.cp_open_report_count('post','<post>');   -- expect 0
--   -- One more report must NOT re-hide it. If it does, the count is running
--   -- over all reports rather than open ones, and a group can permanently bury
--   -- anything by adding one report at a time.
--
--   -- 5. A reported DM is NOT readable from the queue:
--   select target_type, is_dm, body from public.get_space_report_queue();
--   -- expect body IS NULL on every is_dm row. Reading it must go through
--   -- read_dm_thread(), which writes an audit row.
--
--   -- 6. Resolving notifies every reporter exactly once:
--   select count(*) from public.notifications where type = 'space_report';
--
--   -- 7. The badge count groups by target, not by report:
--   select public.count_open_reports();
--   -- seven reports on one post is 1, not 7.
-- ============================================================================
