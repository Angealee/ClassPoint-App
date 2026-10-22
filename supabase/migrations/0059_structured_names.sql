-- ============================================================================
-- 0059 · Structured student names
--
-- Adds last_name / first_name / middle_name / suffix columns to students.
-- display_name and full_name are now SYSTEM-GENERATED from these parts:
--   full_name    = "Dela Cruz, Juan M."   (sort key, official format)
--   display_name = "Juan Dela Cruz"        (social format, rank tiebreaker)
--
-- EXISTING STUDENTS: structured columns stay NULL. display_name is backfilled
-- to natural word order for names in "Last, First" format (idempotent guard:
-- WHERE last_name IS NULL). Names that are already natural order are unchanged.
--
-- OWNERSHIP MOVES
--   cp_guard_student_update  0056 → 0059
--     Adds display_name, last_name, first_name, middle_name, suffix to the
--     column denylist. Students can no longer set any name field directly.
--     Error message becomes: "You can only update your photo, bio and interests."
--
-- NEW RPC
--   update_student_name — instructor-only, writes structured + canonical fields
--     and one audit_log row ('edit_name'), then refreshes the leaderboard
--     snapshot so its cached display_name copy doesn't go stale.
--
-- SIGNATURE CHANGES (drop exact old signature first — the 0028 lesson;
--   create_or_replace with a new parameter list creates an overload and
--   PostgREST then rejects every call as ambiguous)
--   create_student  (uuid, text)  → (uuid, text, text, text?, text?)
--
-- create_students signature is UNCHANGED (uuid, text[]) — body updated only.
--
-- audit_log_action_check widened with 'edit_name' (all prior values re-listed).
--
-- ── ONE-TIME SETUP ───────────────────────────────────────────────────────────
--   None. Paste and run. Idempotent — safe to run twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Structured name columns
-- ----------------------------------------------------------------------------
alter table public.students add column if not exists last_name   text;
alter table public.students add column if not exists first_name  text;
alter table public.students add column if not exists middle_name text;
alter table public.students add column if not exists suffix      text;

-- ----------------------------------------------------------------------------
-- 2. Backfill display_name for existing students
--    Any student who has a comma in full_name is in "Last, First [MI.]" format.
--    Flip it to "First [MI.] Last" natural order.
--    Guard: last_name IS NULL ensures only old (un-structured) students are
--    touched, and the UPDATE is idempotent on re-run.
-- ----------------------------------------------------------------------------
update public.students
   set display_name = trim(split_part(full_name, ',', 2))
                   || ' '
                   || trim(split_part(full_name, ',', 1))
 where last_name is null
   and position(',' in full_name) > 0;

-- ----------------------------------------------------------------------------
-- 3. cp_guard_student_update  0056 → 0059
--    Carry forward the event-award bypass verbatim.
--    Add display_name, last_name, first_name, middle_name, suffix to the
--    denylist — students can no longer update any name field directly.
--    Update error message now that display_name is system-generated.
-- ----------------------------------------------------------------------------
create or replace function public.cp_guard_student_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 0056: a student's own event check-in raises this transaction-local flag so
  -- cp_recompute_points may write lifetime/semester points through the guard.
  if current_setting('cp.event_award', true) = 'on' then
    return NEW;
  end if;
  -- Instructor edits anything; service role (auth.uid() is null) bypasses too.
  if public.is_instructor() or auth.uid() is null then
    return NEW;
  end if;
  -- 0059: display_name is now system-generated; added to the denylist.
  -- last_name / first_name / middle_name / suffix added as well.
  if NEW.id              is distinct from OLD.id
     or NEW.section_id      is distinct from OLD.section_id
     or NEW.full_name       is distinct from OLD.full_name
     or NEW.display_name    is distinct from OLD.display_name
     or NEW.last_name       is distinct from OLD.last_name
     or NEW.first_name      is distinct from OLD.first_name
     or NEW.middle_name     is distinct from OLD.middle_name
     or NEW.suffix          is distinct from OLD.suffix
     or NEW.lifetime_points is distinct from OLD.lifetime_points
     or NEW.user_id         is distinct from OLD.user_id
     or NEW.created_at      is distinct from OLD.created_at then
    raise exception 'You can only update your photo, bio and interests.';
  end if;
  return NEW;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. create_student  (uuid, text) → (uuid, text, text, text?, text?)
--    Drop the exact old signature first (the 0028 lesson).
--    New signature: p_last_name, p_first_name, p_middle_name DEFAULT NULL,
--    p_suffix DEFAULT NULL.
--    Both canonical strings are composed server-side.
-- ----------------------------------------------------------------------------
drop function if exists public.create_student(uuid, text);

create or replace function public.create_student(
  p_section_id  uuid,
  p_last_name   text,
  p_first_name  text,
  p_middle_name text default null,
  p_suffix      text default null
)
returns table (student_id uuid, claim_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id       uuid;
  v_token    text;
  v_mi       text;
  v_full     text;
  v_display  text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can add students.';
  end if;

  -- Middle initial: upper first letter + period, when middle name is provided.
  v_mi := case
    when p_middle_name is not null and trim(p_middle_name) <> ''
    then upper(left(trim(p_middle_name), 1)) || '.'
    else null
  end;

  -- Official: "Dela Cruz, Juan M." or "Dela Cruz, Juan M. Jr." or "Dela Cruz, Juan"
  v_full := trim(p_last_name) || ', ' || trim(p_first_name)
         || case when v_mi    is not null then ' ' || v_mi    else '' end
         || case when p_suffix is not null and trim(p_suffix) <> ''
                 then ' ' || trim(p_suffix) else '' end;

  -- Social: "Juan Dela Cruz" or "Juan Dela Cruz Jr." (NO middle initial)
  v_display := trim(p_first_name) || ' ' || trim(p_last_name)
            || case when p_suffix is not null and trim(p_suffix) <> ''
                    then ' ' || trim(p_suffix) else '' end;

  v_token := public.cp_generate_token();

  insert into public.students (
    section_id, full_name, display_name,
    last_name, first_name, middle_name, suffix
  ) values (
    p_section_id, v_full, v_display,
    trim(p_last_name), trim(p_first_name),
    case when p_middle_name is not null and trim(p_middle_name) <> ''
         then trim(p_middle_name) else null end,
    case when p_suffix is not null and trim(p_suffix) <> ''
         then trim(p_suffix) else null end
  ) returning id into v_id;

  insert into public.student_secrets (student_id, claim_token)
       values (v_id, v_token);

  return query select v_id, v_token;
end;
$$;

grant execute on function public.create_student(uuid, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. create_students  (uuid, text[]) — signature unchanged, body updated
--    Parses each "Last, First [MI.]" string from the array.
--    Sets structured columns when a comma is present; leaves them NULL for
--    entries that are already in natural order (no comma).
-- ----------------------------------------------------------------------------
create or replace function public.create_students(
  p_section_id uuid,
  p_full_names text[]
)
returns table (full_name text, claim_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw      text;
  v_id       uuid;
  v_token    text;
  v_last     text;
  v_first    text;
  v_rest     text;    -- everything after "Last, " — may be "First MI." or "First"
  v_mi_char  text;
  v_full     text;
  v_display  text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can add students.';
  end if;

  foreach v_raw in array p_full_names loop
    v_raw := btrim(v_raw);
    continue when v_raw = '';

    if position(',' in v_raw) > 0 then
      -- "Dela Cruz, Juan M." format
      v_last := trim(split_part(v_raw, ',', 1));
      v_rest := trim(split_part(v_raw, ',', 2));   -- "Juan M." or "Juan"

      -- Compose canonical strings from parsed parts.
      v_full    := v_last || ', ' || v_rest;
      v_display := v_rest || ' ' || v_last;

      -- We store only last + first here; we don't try to separate "Juan M." into
      -- first "Juan" and MI "M" — the old bulk-import path passes the whole string
      -- and we leave middle_name NULL so the instructor can set it via Edit name.
      v_first := v_rest;
    else
      -- Already in natural order ("Juan Dela Cruz") — use as-is.
      v_last    := null;
      v_first   := null;
      v_full    := v_raw;
      v_display := v_raw;
    end if;

    v_token := public.cp_generate_token();

    insert into public.students (
      section_id, full_name, display_name,
      last_name, first_name
    ) values (
      p_section_id, v_full, v_display,
      v_last, v_first
    ) returning id into v_id;

    insert into public.student_secrets (student_id, claim_token)
         values (v_id, v_token);

    full_name   := v_full;
    claim_token := v_token;
    return next;
  end loop;
end;
$$;

grant execute on function public.create_students(uuid, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. update_student_name — new RPC
--    Instructor-only. Writes all structured fields and recomputes both
--    canonical strings. Writes one audit_log row ('edit_name').
--    Refreshes the leaderboard snapshot so the cached display_name copy is
--    not stale (the same call update_student_name adds one round-trip, but
--    there is no other trigger-based path that keeps the snapshot current after
--    a name change).
-- ----------------------------------------------------------------------------
create or replace function public.update_student_name(
  p_student_id  uuid,
  p_last_name   text,
  p_first_name  text,
  p_middle_name text default null,
  p_suffix      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mi      text;
  v_full    text;
  v_display text;
  v_old     public.students%rowtype;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can edit a student name.';
  end if;

  select * into v_old from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found.';
  end if;

  v_mi := case
    when p_middle_name is not null and trim(p_middle_name) <> ''
    then upper(left(trim(p_middle_name), 1)) || '.'
    else null
  end;

  v_full := trim(p_last_name) || ', ' || trim(p_first_name)
         || case when v_mi     is not null then ' ' || v_mi    else '' end
         || case when p_suffix is not null and trim(p_suffix) <> ''
                 then ' ' || trim(p_suffix) else '' end;

  v_display := trim(p_first_name) || ' ' || trim(p_last_name)
            || case when p_suffix is not null and trim(p_suffix) <> ''
                    then ' ' || trim(p_suffix) else '' end;

  update public.students
     set full_name    = v_full,
         display_name = v_display,
         last_name    = trim(p_last_name),
         first_name   = trim(p_first_name),
         middle_name  = case when p_middle_name is not null and trim(p_middle_name) <> ''
                              then trim(p_middle_name) else null end,
         suffix       = case when p_suffix is not null and trim(p_suffix) <> ''
                              then trim(p_suffix) else null end
   where id = p_student_id;

  insert into public.audit_log (action, target_id, row_data)
       values (
         'edit_name',
         p_student_id,
         jsonb_build_object(
           'before', jsonb_build_object(
             'full_name', v_old.full_name,
             'display_name', v_old.display_name,
             'last_name', v_old.last_name,
             'first_name', v_old.first_name,
             'middle_name', v_old.middle_name,
             'suffix', v_old.suffix
           ),
           'after', jsonb_build_object(
             'full_name', v_full,
             'display_name', v_display,
             'last_name', trim(p_last_name),
             'first_name', trim(p_first_name),
             'middle_name', case when p_middle_name is not null and trim(p_middle_name) <> ''
                                  then trim(p_middle_name) else null end,
             'suffix', case when p_suffix is not null and trim(p_suffix) <> ''
                             then trim(p_suffix) else null end
           )
         )
       );

  perform public.refresh_leaderboard_snapshot();
end;
$$;

grant execute on function public.update_student_name(uuid, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. audit_log_action_check — widen to include 'edit_name'
--    Re-list every prior value (the 0034 lesson: a drop+recreate silently
--    narrows the constraint if any value is omitted).
-- ----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'delete', 'archive', 'restore', 'hard_delete', 'broadcast',
    'promote', 'semester_activate',
    'space_flag', 'space_section', 'space_timeout',
    'space_break_glass', 'space_moderate',
    'peer_group', 'peer_eval',
    'edit_name'
  ));

-- ----------------------------------------------------------------------------
-- 8. Refresh leaderboard snapshot so the cached display_name copies reflect the
--    backfill performed in step 2.
-- ----------------------------------------------------------------------------
select public.refresh_leaderboard_snapshot();

-- ============================================================================
-- Verify (run the whole file twice — every statement is idempotent):
--
--   -- new columns exist:
--   select column_name from information_schema.columns
--    where table_name = 'students'
--      and column_name in ('last_name','first_name','middle_name','suffix');
--
--   -- old-student display_names were flipped where there was a comma:
--   select full_name, display_name from public.students
--    where last_name is null and full_name like '%,%' limit 5;
--
--   -- guard blocks a student from touching display_name:
--   -- (run as a student JWT) update students set display_name='x' where id=...;
--   -- → "You can only update your photo, bio and interests."
--
--   -- new single-add RPC:
--   select * from public.create_student(
--     '<section-id>','Dela Cruz','Juan','Andres','Jr.'
--   );  -- → full_name "Dela Cruz, Juan A. Jr.", display_name "Juan Dela Cruz Jr."
--
--   -- update_student_name audit row:
--   select row_data from public.audit_log
--    where action = 'edit_name' order by created_at desc limit 1;
-- ============================================================================
