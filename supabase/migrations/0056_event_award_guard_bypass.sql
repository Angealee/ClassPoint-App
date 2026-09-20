-- ============================================================================
-- 0056 · Let a student's OWN event check-in award points (guard bypass)
--
-- THE BUG (reported live, 2026-09-21)
--   Scanning the event QR showed "You can only update your display name, photo,
--   bio and interests." — nothing checked in, no points. That string is
--   cp_guard_student_update (0009) raising.
--
--   Why it fires: scan_event_attendance (0055) is SECURITY DEFINER, but DEFINER
--   changes the OWNER's table privileges for RLS — it does NOT change auth.uid()
--   or is_instructor(), which read the JWT. So the whole call runs as the STUDENT.
--   Its point_events INSERT fires cp_recompute_points (0029), which UPDATEs
--   students.lifetime_points/semester_points, which fires the BEFORE-UPDATE guard
--   cp_guard_student_update — and the guard raises on any lifetime_points change
--   by a non-instructor, non-service-role session. Event check-in is the FIRST
--   place in the app where a student's OWN action writes a point_events row for
--   themselves; every other award runs as the instructor, so nothing hit this.
--
-- THE FIX
--   A transaction-local GUC. The two event-award RPCs raise cp.event_award = 'on'
--   with set_config(..., true) — LOCAL, so it is scoped to that one transaction
--   and reset the instant the RPC returns — immediately before their point_events
--   INSERT. The guard early-returns when it sees that flag. cp_recompute_points is
--   NOT touched: it is the most load-bearing trigger in the points system, and the
--   flag is far narrower than editing it.
--
--   Not a security hole: the flag is transaction-local and set ONLY inside these
--   two definer RPCs. PostgREST runs one statement per transaction and does not
--   expose set_config (it lives in pg_catalog, not the public schema), so a
--   student cannot raise the flag and then issue an arbitrary students UPDATE in
--   the same transaction — the guard still protects every ordinary profile write.
--
-- OWNERSHIP MOVES (all same-signature create-or-replace; grants are preserved,
-- and re-granted below to match 0055's precedent)
--   cp_guard_student_update   0009 → 0056  (body VERBATIM + one early-return)
--   scan_event_attendance     0055 → 0056  (body VERBATIM + one set_config line)
--   mark_event_attendance     0055 → 0056  (body VERBATIM + one set_config line)
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run. Must be applied AFTER 0055 (owns both RPCs) and after
--   0009 (owns the guard). Idempotent — safe to run twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. cp_guard_student_update  0009 → 0056
--    Verbatim from 0009, plus the first check: when an event award is in flight
--    (the transaction-local flag is 'on'), let the points recompute through.
-- ----------------------------------------------------------------------------
create or replace function public.cp_guard_student_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 0056: a student's own event check-in (scan_event_attendance /
  -- mark_event_attendance) raises this transaction-local flag right before the
  -- point_events insert, so cp_recompute_points may write lifetime/semester
  -- points here. The flag is LOCAL and set only inside those definer RPCs.
  if current_setting('cp.event_award', true) = 'on' then
    return NEW;
  end if;
  -- Instructor edits anything; service role (auth.uid() is null) bypasses too.
  if public.is_instructor() or auth.uid() is null then
    return NEW;
  end if;
  if NEW.id              is distinct from OLD.id
     or NEW.section_id      is distinct from OLD.section_id
     or NEW.full_name       is distinct from OLD.full_name
     or NEW.lifetime_points is distinct from OLD.lifetime_points
     or NEW.user_id         is distinct from OLD.user_id
     or NEW.created_at      is distinct from OLD.created_at then
    raise exception 'You can only update your display name, photo, bio and interests.';
  end if;
  return NEW;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. scan_event_attendance  0055 → 0056
--    Verbatim from 0055; the ONLY change is `perform set_config(...)` right
--    before the point_events INSERT in the "genuinely new" branch.
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

  -- Genuinely new → award once (the ledger row is silent; see cp_notify_point_event).
  if v_pts > 0 then
    -- 0056: let cp_recompute_points update this student's points through the
    -- profile guard. Transaction-local, reset when this RPC returns.
    perform set_config('cp.event_award', 'on', true);
    insert into public.point_events (student_id, points, category, note)
         values (v_student.id, v_pts, 'event_attend', 'Event · ' || v_event.name)
      returning id into v_pe;
    update public.event_attendance set point_event_id = v_pe where id = v_rec_id;
  end if;

  return query select false, v_pts, v_event.name, now()::timestamptz;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. mark_event_attendance  0055 → 0056
--    Verbatim from 0055 + the same set_config line. The instructor manual-add
--    already passes the guard (is_instructor()), but the flag makes the award
--    path identical to the scan path and costs nothing.
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
    -- 0056: same as scan_event_attendance — allow the points recompute through
    -- the profile guard. Transaction-local; harmless when the actor is already
    -- the instructor.
    perform set_config('cp.event_award', 'on', true);
    insert into public.point_events (student_id, points, category, note)
         values (p_student_id, v_pts, 'event_attend', 'Event · ' || v_event.name)
      returning id into v_pe;
    update public.event_attendance set point_event_id = v_pe where id = v_rec_id;
  end if;

  return query select false, v_pts;
end;
$$;

grant execute on function public.scan_event_attendance(uuid, bigint, text)  to authenticated;
grant execute on function public.mark_event_attendance(uuid, uuid)          to authenticated;

-- ============================================================================
-- Verify (run the whole file twice — every statement is idempotent):
--
--   -- the guard now early-returns on the event-award flag:
--   select pg_get_functiondef('public.cp_guard_student_update'::regproc)
--     like '%cp.event_award%';                    -- t
--
--   -- both award RPCs raise the flag before their insert:
--   select proname,
--          pg_get_functiondef(oid) like '%set_config(''cp.event_award''%' as has_flag
--     from pg_proc
--    where proname in ('scan_event_attendance','mark_event_attendance');  -- both t
--
--   -- END-TO-END (as a real student, via the app): scan the event QR →
--   -- "You're checked in!", +N points, and the ledger shows one 'event_attend'
--   -- row with NO push.
-- ============================================================================
