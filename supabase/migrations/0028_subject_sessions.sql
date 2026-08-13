-- ============================================================================
-- ClassPoint · 0028 · Subject-scoped attendance
-- Run after 0027. Safe to re-run.
--
-- WHY: the same roster meets you under two labels — "IT 32 · Platform
-- Technologies" and "Elective 1 · Event-driven Programming". A student can be
-- absent all week in one and perfect in the other, and until now attendance
-- couldn't tell the difference: sessions only knew their section.
--
-- Points stay ONE shared pool (a point earned in IT 32 spends anywhere) — only
-- attendance is subject-scoped. That's a deliberate product decision, not a
-- limitation: see the DB map in CLAUDE.md.
--
-- Legacy sessions keep `subject_id = null` ("untagged"). The column stays
-- NULLABLE on purpose — history that predates subjects is real history, and the
-- instructor re-tags it from Class history at their own pace.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The column
-- ----------------------------------------------------------------------------
alter table public.class_sessions
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

create index if not exists class_sessions_subject_idx
  on public.class_sessions (subject_id);

-- ----------------------------------------------------------------------------
-- 2. start_class_session — ownership move 0014 → 0028
--
--    The SIGNATURE changes (new p_subject_id), so this MUST drop first: a
--    `create or replace` with a different parameter list creates an OVERLOAD
--    instead of replacing, and PostgREST would then reject every call as
--    ambiguous. Drop the exact 0014 signature, then recreate and re-grant.
-- ----------------------------------------------------------------------------
drop function if exists public.start_class_session(uuid, text, integer, integer, integer, integer, boolean);
drop function if exists public.start_class_session(uuid, uuid, text, integer, integer, integer, integer, boolean);

create or replace function public.start_class_session(
  p_section_id       uuid,
  p_subject_id       uuid default null,
  p_topic            text default null,
  p_late_after_min   integer default 10,
  p_absent_after_min integer default 30,
  p_late_penalty     integer default 1,
  p_absent_penalty   integer default 5,
  p_apply_penalties  boolean default true
)
-- NOTE: the OUT columns are deliberately NOT named after any table column
-- (e.g. `started_at`). A `RETURNS TABLE` column is an output variable, and if it
-- shares a name with a column used in a `RETURNING ... INTO`, Postgres raises
-- "column reference is ambiguous" (42702 -> HTTP 400). The client re-reads the
-- full row separately, so this only needs to hand back the id + secret.
returns table (out_session_id uuid, out_qr_secret text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id           uuid;
  v_secret       text;
  v_assigned     integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can start a class.';
  end if;

  -- Resume an already-running session rather than creating a duplicate. Checked
  -- BEFORE any validation below: a live class must never be blocked by config.
  select cs.id, css.qr_secret
    into v_id, v_secret
    from public.class_sessions cs
    join public.class_session_secrets css on css.session_id = cs.id
   where cs.section_id = p_section_id and cs.status = 'active'
   limit 1;

  if found then
    return query select v_id, v_secret;
    return;
  end if;

  -- Sessions belong to the semester that's running now.
  if not exists (
    select 1 from public.sections s
     where s.id = p_section_id
       and s.semester_id = public.cp_active_semester_id()
  ) then
    raise exception 'That section belongs to another semester.';
  end if;

  select count(*) into v_assigned
    from public.section_subjects ss
   where ss.section_id = p_section_id;

  if p_subject_id is null then
    -- Only insist on a subject when the section actually has one to pick. A
    -- section with nothing assigned yet can still hold class — being unable to
    -- start one because of a setup gap would be a worse failure than an
    -- untagged session.
    if v_assigned > 0 then
      raise exception 'Pick a subject for this class.';
    end if;
  elsif not exists (
    select 1 from public.section_subjects ss
     where ss.section_id = p_section_id and ss.subject_id = p_subject_id
  ) then
    raise exception 'That subject is not assigned to this section.';
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.class_sessions (
    section_id, subject_id, topic, late_after_min, absent_after_min,
    late_penalty, absent_penalty, apply_penalties, created_by
  ) values (
    p_section_id, p_subject_id, nullif(btrim(p_topic), ''), p_late_after_min, p_absent_after_min,
    -- Clamp to the point_events magnitude ceiling (±100) so commit never fails.
    least(100, greatest(0, p_late_penalty)), least(100, greatest(0, p_absent_penalty)),
    p_apply_penalties, auth.uid()
  )
  returning id into v_id;

  insert into public.class_session_secrets (session_id, qr_secret)
       values (v_id, v_secret);

  return query select v_id, v_secret;
end;
$$;

grant execute on function public.start_class_session(uuid, uuid, text, integer, integer, integer, integer, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- NOT changed here, on purpose:
--   • scan_attendance (owner 0023) gets its active-semester guard in the
--     rollover migration, where a past-semester section can first exist. Copying
--     that long function forward twice is how ownership bugs happen.
--   • end_class_session, commit_attendance_penalties, set_attendance_status and
--     submit_offline_scan are all subject-agnostic — a session's subject never
--     changes what a status means or what a penalty costs.
-- ============================================================================
-- Verify (run twice — the drop-first must re-run cleanly):
--
--   -- Exactly ONE start_class_session should exist (no accidental overload):
--   select count(*) from pg_proc where proname = 'start_class_session';   -- 1
--
--   select count(*) as untagged from public.class_sessions where subject_id is null;
--
--   -- Should raise 'Pick a subject for this class.' for a section that has
--   -- subjects assigned:
--   -- select * from public.start_class_session('<section-uuid>');
-- ============================================================================
