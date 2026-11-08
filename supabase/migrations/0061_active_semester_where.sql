-- ============================================================================
-- 0061 · set_active_semester — "UPDATE requires a WHERE clause"
--
-- THE BUG (reported by the instructor, 2026-11-08)
--   Activating a newly created semester from /teach/semesters failed with
--   "UPDATE requires a WHERE clause" and nothing was switched.
--
-- WHY IT HAPPENED, AND WHY IT HID FOR MONTHS
--   `set_active_semester` (0035) discharges the 0029 contract by bulk-rebuilding
--   `students.semester_points` for every student — a cache `cp_recompute_points`
--   cannot rebuild on a semester CHANGE, because it is active-semester-relative
--   and only fires when a point row changes. 0035 wrote that as a deliberately
--   UNQUALIFIED update, and said so in its comment: every student row, archived
--   ones included.
--
--   Supabase runs **pg_safeupdate** for the API roles (`authenticated`, `anon`),
--   which refuses an UPDATE or DELETE with no WHERE clause. The SQL editor runs
--   as `postgres`, which is exempt — so:
--     * pasting 0035 succeeded,
--     * 0029's own top-level backfill (same unqualified shape) succeeded,
--     * and the function only broke when the APP called it through PostgREST.
--   A migration that pastes cleanly can still contain a statement that can
--   never run at runtime. That is the generalisable lesson here.
--
-- BLAST RADIUS — AUDITED, AND IT IS EXACTLY ONE STATEMENT
--   Every UPDATE/DELETE in migrations 0001–0060 was scanned with parenthesised
--   subqueries stripped first (a correlated subquery's own WHERE otherwise masks
--   the outer statement's missing one — the false negative that hid this bug
--   from a naive grep). Six unqualified statements exist:
--     0006:39, 0023:325, 0029:141  dead copies of refresh_leaderboard_snapshot,
--                                  superseded by 0038's version, which HAS a
--                                  WHERE on its sweep. Not runtime-reachable.
--     0029:114, 0048:67            top-level one-time backfills, run as
--                                  `postgres` in the SQL editor. Exempt, and
--                                  0029's has already run successfully.
--     0035:277                     inside set_active_semester. ← THIS ONE.
--   So this file fixes the only unqualified DML in the project that an API role
--   can ever reach.
--
-- OWNERSHIP MOVE
--   set_active_semester 0035 → 0061. Same signature, plain `create or replace`,
--   re-granted. The body was EXTRACTED from 0035 programmatically rather than
--   retyped and then diffed, so the only difference is the WHERE clause (and
--   its comment). 0035 is NOT edited — it is applied.
--
-- WHAT IS DELIBERATELY UNCHANGED
--   The two-step is_active flip (the partial unique index would be violated
--   mid-statement by a single UPDATE), the server-side re-run of the blocking
--   pre-flight, the archived-inclusive recompute, the snapshot refresh, and the
--   audit row. The recompute still touches every student row — that was never
--   the bug.
--
-- ── ONE-TIME SETUP ───────────────────────────────────────────────────────────
--   None. Paste and run. Idempotent — safe to run twice.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Ownership move: set_active_semester 0035 → 0061
-- ----------------------------------------------------------------------------
create or replace function public.set_active_semester(p_semester_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semester public.semesters%rowtype;
  v_previous uuid;
  v_blocker  record;
  v_students integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can switch semesters.';
  end if;

  select * into v_semester from public.semesters where id = p_semester_id for update;
  if not found then
    raise exception 'That semester no longer exists.';
  end if;
  if v_semester.is_active then
    return 0;                            -- already active; idempotent no-op
  end if;

  -- Re-run the blocking pre-flight HERE rather than trusting the UI to have
  -- checked. The wizard shows it, but this function is the actual gate.
  for v_blocker in
    select * from public.get_rollover_preflight(p_semester_id) where severity = 'block'
  loop
    raise exception '%', v_blocker.detail;
  end loop;

  select id into v_previous from public.semesters where is_active limit 1;

  -- Two-step flip. The partial unique index `(is_active) where is_active` means
  -- a single UPDATE that sets one row true while another is still true would
  -- violate it mid-statement — clear first, then set.
  update public.semesters set is_active = false where is_active;
  update public.semesters set is_active = true where id = p_semester_id;

  -- THE 0029 CONTRACT. cp_recompute_points is active-semester-relative and runs
  -- only when a point row changes, so nothing else in the system will ever
  -- rebuild this cache for a semester CHANGE. Without these lines every student
  -- keeps last semester's balance as their new spendable points.
  -- ⚠ THE WHERE CLAUSE IS THE 0061 FIX. Do not "simplify" it back.
  --   This statement must touch EVERY student row, and it used to say so by
  --   having no WHERE at all. Supabase runs `pg_safeupdate` for the API roles,
  --   so an unqualified UPDATE reached through PostgREST is rejected outright
  --   with "UPDATE requires a WHERE clause" — and this function is reached that
  --   way every time the instructor activates a semester.
  --
  --   The subquery computes the new balance once per student and the join
  --   predicate is a REAL WHERE, so the guard is satisfied without a tautology
  --   like `where s.id is not null` and without a second copy of the balance
  --   expression (which is what `where semester_points is distinct from <expr>`
  --   would have cost). Every student row is still updated exactly once:
  --   `v` has one row per student.
  update public.students s
     set semester_points = v.pts
    from (
      select st.id,
             greatest(0, coalesce((
               select sum(pe.points) from public.point_events pe
                where pe.student_id = st.id and pe.semester_id = p_semester_id
             ), 0)) as pts
        from public.students st
    ) v
   where v.id = s.id;

  select count(*) into v_students from public.students where archived_at is null;

  perform public.refresh_leaderboard_snapshot();

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'semester_activate', 'semesters', p_semester_id,
               'Activated ' || v_semester.name,
               jsonb_build_object(
                 'from_semester', v_previous,
                 'to_semester',   p_semester_id,
                 'name',          v_semester.name,
                 'students',      v_students
               ));

  return v_students;
end;
$$;

grant execute on function public.set_active_semester(uuid) to authenticated;


-- ============================================================================
-- Verify (run the whole file twice — it is idempotent):
--
--   -- 1. The function no longer carries an unqualified UPDATE.
--   select position('set semester_points = v.pts' in pg_get_functiondef(p.oid)) > 0
--             as fixed
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'set_active_semester';
--   --   true
--
--   -- 2. THE REAL TEST IS FROM THE APP, NOT FROM HERE.
--   --    The SQL editor runs as `postgres`, which pg_safeupdate exempts — so
--   --    calling this here would have succeeded even BEFORE the fix and proves
--   --    nothing. Activate a scratch semester from /teach/semesters instead.
--   --
--   --    If you do want to exercise the guard in SQL, impersonate the role:
--   --      set local role authenticated;
--   --      -- (this will now succeed where it previously raised)
--   --    …but the instructor check will refuse without a JWT, so the honest
--   --    test really is the screen.
--
-- ── THE ACID TEST (carried forward from 0035 — still the thing that matters) ──
--   The whole reason the recompute exists is that semester_points must
--   ROUND-TRIP. On a scratch semester with a section and two promoted students:
--
--     select semester_points, lifetime_points from public.students
--      where id = '<a student with points>';        -- note both numbers
--
--     select public.set_active_semester('<test sem id>');
--     -- semester_points must now be 0; lifetime_points UNCHANGED.
--
--     select public.set_active_semester('<original sem id>');
--     -- semester_points must ROUND-TRIP to its exact original value.
--
--   If it does not round-trip, STOP — this statement is the only thing standing
--   between a rollover and every student's balance being wrong. Then clean up
--   the test semester.
-- ============================================================================
