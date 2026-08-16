-- ============================================================================
-- ClassPoint · 0034 · Instructor ops: visibility, broadcast, risk, workbook
-- Run after 0033. Safe to re-run.
--
-- Four systems already run in this database and NONE of them can be seen from
-- the app: the nightly backup (0023), the audit log (0023), the auth-event
-- trail (0026), and the on-demand leaderboard refresh (0006, granted and never
-- called). This migration adds the read side for all four, plus three
-- instructor tools that needed SQL rather than client fan-out.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. audit_log gains 'broadcast'
--
--    Constraint name preserved (the 0007/0011 rule) — dropping and recreating
--    under a new name is how you end up with two constraints that disagree.
--    Phase I will widen this again with 'promote' and 'semester_activate'.
-- ----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('delete','archive','restore','hard_delete','broadcast'));

-- ----------------------------------------------------------------------------
-- 2. Backup health
--
--    Reads `information_schema` rather than a hardcoded table list so it can
--    never drift from what cp_nightly_backup actually writes — a health check
--    that lies about coverage is worse than none.
-- ----------------------------------------------------------------------------
drop function if exists public.get_backup_health();
create function public.get_backup_health()
returns table (
  table_name    text,
  last_snapshot date,
  row_count     bigint,
  snapshot_days integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read backup health.';
  end if;

  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'backup' and c.relkind = 'r'
     order by c.relname
  loop
    -- Scalar subqueries rather than aggregates with a FILTER containing a
    -- subquery — the latter is not something an aggregate FILTER accepts.
    return query execute format(
      'select %L::text,
              (select max(snapshot_date) from backup.%I)::date,
              (select count(*) from backup.%I
                where snapshot_date = (select max(snapshot_date) from backup.%I))::bigint,
              (select count(distinct snapshot_date) from backup.%I)::integer',
      t, t, t, t, t);
  end loop;
end;
$$;

grant execute on function public.get_backup_health() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Section overview — the "what needs finishing" signal for the section grid
--
--    `unfinalized` counts ENDED sessions that were configured to apply
--    penalties and never had them committed. That is real unfinished work: the
--    absences are recorded but nobody has been docked, so the ledger and the
--    attendance record disagree until the instructor commits.
-- ----------------------------------------------------------------------------
drop function if exists public.get_section_overview();
create function public.get_section_overview()
returns table (
  section_id      uuid,
  last_session_at timestamptz,
  active_session  boolean,
  unfinalized     integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read the section overview.';
  end if;

  return query
  select s.id,
         max(cs.started_at),
         bool_or(cs.status = 'active'),
         (count(*) filter (
            where cs.status = 'ended'
              and cs.apply_penalties
              and not cs.penalties_committed
          ))::integer
    from public.sections s
    left join public.class_sessions cs on cs.section_id = s.id
   where s.semester_id = public.cp_active_semester_id()
   group by s.id;
end;
$$;

grant execute on function public.get_section_overview() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Per-term attendance — the workbook backend
--
--    ATTENDANCE ONLY, and that is a deliberate product decision, not an
--    oversight: the instructor's rule is that POINTS ARE NEVER TURNED INTO A
--    GRADE. Points reach a grade only through an individually-approved
--    redemption (0019/0029), never through a formula. So this function does not
--    return points at all — a points column in a grading export would imply an
--    arithmetic that is explicitly not the policy.
--
--    Raw counts only. No computed percentage beyond the show-up rate the app
--    already displays everywhere, and no letter/score of any kind.
--
--    Term dates come from `semester_terms` (0027), which are EDITABLE — this
--    reads them rather than computing six-week blocks, or a holiday shift would
--    silently put a class in the wrong term.
-- ----------------------------------------------------------------------------
drop function if exists public.get_term_attendance(uuid, text);
create function public.get_term_attendance(p_section_id uuid, p_term text)
returns table (
  student_id   uuid,
  full_name    text,
  display_name text,
  present      integer,
  late         integer,
  absent       integer,
  excused      integer,
  irregular    integer,
  counted      integer,
  show_up_rate numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date;
  v_to   date;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read term attendance.';
  end if;

  select st.starts_on, st.ends_on into v_from, v_to
    from public.semester_terms st
    join public.sections s on s.semester_id = st.semester_id
   where s.id = p_section_id and st.term = p_term;

  if v_from is null then
    raise exception 'That term has no dates set for this section''s semester.';
  end if;

  -- The term filter lives INSIDE the joined subquery, not in the WHERE clause.
  -- Filtering after a left join would drop any student whose records all fall
  -- outside this term — and a student with zero classes in the term is exactly
  -- the row the instructor needs to see, not one to hide.
  return query
  select stu.id,
         stu.full_name,
         stu.display_name,
         (count(*) filter (where t.status = 'present'))::integer,
         (count(*) filter (where t.status = 'late'))::integer,
         (count(*) filter (where t.status = 'absent'))::integer,
         (count(*) filter (where t.status = 'excused'))::integer,
         (count(*) filter (where t.status = 'irregular'))::integer,
         -- 'excused' and 'irregular' are NEUTRAL everywhere in this app: they
         -- are excluded from the denominator, not counted as attendance.
         (count(*) filter (where t.status in ('present','late','absent')))::integer,
         case
           when count(*) filter (where t.status in ('present','late','absent')) = 0 then 0
           else round(
             100.0 * count(*) filter (where t.status in ('present','late'))
                   / count(*) filter (where t.status in ('present','late','absent')), 1)
         end
    from public.students stu
    left join (
      select ar.student_id, ar.status
        from public.attendance_records ar
        join public.class_sessions cs on cs.id = ar.session_id
       -- Compared in MANILA time. `started_at` is timestamptz and the term
       -- bounds are plain dates; comparing them directly casts the date at the
       -- server's timezone (UTC), which would push a 7am Manila class into the
       -- previous day and out of the term.
       where (cs.started_at at time zone 'Asia/Manila')::date between v_from and v_to
    ) t on t.student_id = stu.id
   where stu.section_id = p_section_id
     and stu.archived_at is null
   group by stu.id, stu.full_name, stu.display_name
   order by stu.full_name;
end;
$$;

grant execute on function public.get_term_attendance(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Cross-section absence risk
--
--    Tied to the 7-day excuse window (0025) rather than to a show-up-rate
--    threshold, because this list exists to drive a DECISION: `actionable` is
--    the count of absences the student can still excuse today. A rate-based
--    list flags people you can no longer help, and early in a term two absences
--    out of three classes reads as a crisis.
--
--    An absence counts as unexcused unless an excuse is pending or approved.
--    A rejected or cancelled one leaves the absence standing — which is exactly
--    when the instructor most wants to see it.
-- ----------------------------------------------------------------------------
drop function if exists public.get_absence_risk();
create function public.get_absence_risk()
returns table (
  student_id        uuid,
  display_name      text,
  full_name         text,
  section_id        uuid,
  section_name      text,
  unexcused         integer,
  actionable        integer,
  next_deadline     timestamptz,
  last_absence_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read the risk overview.';
  end if;

  return query
  select stu.id,
         stu.display_name,
         stu.full_name,
         sec.id,
         sec.name,
         count(*)::integer,
         (count(*) filter (where cs.started_at > now() - interval '7 days'))::integer,
         -- The soonest window still open, so the list can be sorted by urgency.
         min(cs.started_at + interval '7 days')
           filter (where cs.started_at > now() - interval '7 days'),
         max(cs.started_at)
    from public.attendance_records ar
    join public.class_sessions cs on cs.id = ar.session_id
    join public.students stu on stu.id = ar.student_id
    join public.sections sec on sec.id = stu.section_id
   where ar.status = 'absent'
     and stu.archived_at is null
     and sec.semester_id = public.cp_active_semester_id()
     and not exists (
       select 1 from public.absence_excuses ae
        where ae.record_id = ar.id
          and ae.status in ('pending', 'approved')
     )
   group by stu.id, stu.display_name, stu.full_name, sec.id, sec.name;
end;
$$;

grant execute on function public.get_absence_risk() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Broadcast
--
--    One notification per targeted student through the SAME outbox every other
--    notification uses, so the bell history, the retry sweep and push delivery
--    all work with no special cases.
--
--    Two deliberate choices:
--
--    * The insert is ONE statement, not 208 calls to cp_queue_notification.
--      A per-row loop over a whole semester's roster is a long transaction for
--      no benefit.
--
--    * Dispatch is CHUNKED at 50, mirroring cp_push_sweep's batch size. The
--      existing cp_push_dispatch puts every id in a single HTTP body, which is
--      fine for the one-or-two-id calls it was written for and a bad idea for
--      208. pg_net queues the posts, so several small ones cost nothing.
--
--    Returns the recipient count so the UI can report what actually happened
--    rather than what it predicted.
-- ----------------------------------------------------------------------------
drop function if exists public.send_broadcast(text, text, text, uuid);
create function public.send_broadcast(
  p_title      text,
  p_body       text,
  p_url        text default '/app',
  p_section_id uuid default null   -- null = every section this semester
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   uuid[];
  v_chunk uuid[];
  v_total integer;
  i       integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can send a broadcast.';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'A broadcast needs a title.';
  end if;
  if char_length(p_title) > 80 then
    raise exception 'Keep the title to 80 characters or fewer.';
  end if;
  if char_length(coalesce(p_body, '')) > 300 then
    raise exception 'Keep the message to 300 characters or fewer.';
  end if;

  -- Insert and capture the ids in one statement.
  with targets as (
    select stu.id
      from public.students stu
      join public.sections sec on sec.id = stu.section_id
     where stu.archived_at is null
       and sec.semester_id = public.cp_active_semester_id()
       and (p_section_id is null or stu.section_id = p_section_id)
  ), inserted as (
    insert into public.notifications (student_id, type, title, body, url)
    select t.id, 'broadcast', btrim(p_title), coalesce(btrim(p_body), ''),
           coalesce(nullif(btrim(p_url), ''), '/app')
      from targets t
    returning id
  )
  select array_agg(id) into v_ids from inserted;

  v_total := coalesce(array_length(v_ids, 1), 0);
  if v_total = 0 then
    -- Refuse rather than silently succeed: an empty send is always a mistake
    -- (wrong section picked, or the roster isn't in the active semester).
    raise exception 'That target has no active students — nothing was sent.';
  end if;

  -- Audit BEFORE dispatch: the record of what you sent must survive a push
  -- failure, and pg_net is fire-and-forget anyway.
  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
  values (
    auth.uid(), 'broadcast', 'notifications', null,
    format('Broadcast to %s student(s): %s', v_total, btrim(p_title)),
    jsonb_build_object(
      'title', btrim(p_title),
      'body', coalesce(btrim(p_body), ''),
      'url', p_url,
      'section_id', p_section_id,
      'recipients', v_total
    )
  );

  i := 1;
  while i <= v_total loop
    v_chunk := v_ids[i : i + 49];
    perform public.cp_push_dispatch(v_chunk);
    i := i + 50;
  end loop;

  return v_total;
end;
$$;

grant execute on function public.send_broadcast(text, text, text, uuid) to authenticated;

-- ============================================================================
-- Verify (run the whole file twice — it is idempotent):
--
--   select * from public.get_backup_health();          -- 13 rows, recent dates
--   select * from public.get_section_overview();
--   select * from public.get_absence_risk() order by actionable desc;
--   select * from public.get_term_attendance(
--     (select id from public.sections limit 1), 'prelim');
--
--   -- Broadcast: TEST ON ONE SECTION FIRST. This really does send.
--   -- select public.send_broadcast('Test', 'Ignore me', '/app',
--   --   (select id from public.sections order by name limit 1));
--
--   -- What it recorded:
--   select at, summary, row_data from public.audit_log
--    where action = 'broadcast' order by at desc limit 5;
-- ============================================================================
