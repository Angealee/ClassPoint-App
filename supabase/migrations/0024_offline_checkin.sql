-- ============================================================================
-- ClassPoint · 0024 · Offline check-in — 48h sync from a captured QR proof
-- Run after 0023. Safe to re-run (idempotent).
--
-- THE IDEA
--   The rotating QR is HMAC(qr_secret, "{sessionId}.{window}") over 15-second
--   windows. Students never see the secret, so any (window, code) pair that
--   validates was necessarily on the instructor's screen during that exact 15s
--   — i.e. proof of presence AT CAPTURE TIME, verifiable hours later. A student
--   with no data scans optically (works offline), the app queues the proof, and
--   syncs within 48h. Status is computed from the CAPTURE window, never sync
--   time; the client clock is irrelevant because the HMAC binds the window.
--
-- WHAT THIS ADDS
--   1. attendance_records.synced_late — flags any record written/upgraded by an
--      offline sync (surfaced to instructor + student as "Offline check-in").
--   2. cp_apply_attendance_status() — the 0018 reconciliation core, EXTRACTED so
--      offline sync can reuse it WITHOUT loosening set_attendance_status's
--      instructor gate. set_attendance_status becomes a thin instructor-checked
--      wrapper (0024 becomes its owner).
--   3. submit_offline_scan() — validates the captured proof, computes status
--      from capture time, and either records or UPGRADES to a better status
--      (present > late > absent), reconciling penalties. Never worsens a status,
--      never overwrites an instructor's excused/irregular mark.
--
-- FUNCTION OWNERSHIP MOVE (CLAUDE.md): set_attendance_status 0018 → 0024.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. synced_late flag
-- ----------------------------------------------------------------------------
alter table public.attendance_records
  add column if not exists synced_late boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. Extract the reconciliation core (verbatim 0018 body + scanned_at/
--    synced_late stamping). NO auth check — the revoke is load-bearing.
-- ----------------------------------------------------------------------------
create or replace function public.cp_apply_attendance_status(
  p_record_id   uuid,
  p_status      text,
  p_scanned_at  timestamptz default null,   -- null = leave scanned_at unchanged
  p_synced_late boolean     default null    -- null = leave synced_late unchanged
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec     public.attendance_records%rowtype;
  v_session public.class_sessions%rowtype;
  v_label   text;
  v_points  integer := 0;
  v_event   uuid;
begin
  select * into v_rec from public.attendance_records where id = p_record_id for update;
  if not found then
    raise exception 'That attendance record no longer exists.';
  end if;

  if v_rec.status = p_status then
    -- Same status: still honour explicit scanned_at/synced_late stamps (an
    -- offline proof for an already-correct row records that it synced).
    update public.attendance_records
       set scanned_at  = coalesce(p_scanned_at, scanned_at),
           synced_late = coalesce(p_synced_late, synced_late)
     where id = p_record_id;
    return;
  end if;

  select * into v_session from public.class_sessions where id = v_rec.session_id for update;
  if not found then
    raise exception 'That class session no longer exists.';
  end if;

  if not v_rec.committed then
    update public.attendance_records
       set status      = p_status,
           scanned_at  = coalesce(p_scanned_at, scanned_at),
           synced_late = coalesce(p_synced_late, synced_late)
     where id = p_record_id;
    return;
  end if;

  -- Committed: reverse the old penalty (trigger restores points), write the new.
  if v_rec.penalty_event_id is not null then
    delete from public.point_events where id = v_rec.penalty_event_id;
  end if;

  if v_session.apply_penalties then
    if p_status = 'late' then
      v_points := v_session.late_penalty;
    elsif p_status = 'absent' then
      v_points := v_session.absent_penalty;
    end if;
  end if;

  if v_points > 0 then
    v_label := coalesce(nullif(v_session.topic, ''), to_char(v_session.started_at, 'Mon DD'));
    insert into public.point_events (student_id, points, category, note)
         values (v_rec.student_id, -v_points, 'penalty', initcap(p_status) || ' · ' || v_label)
      returning id into v_event;
  end if;

  update public.attendance_records
     set status           = p_status,
         penalty_event_id = v_event,
         scanned_at       = coalesce(p_scanned_at, scanned_at),
         synced_late      = coalesce(p_synced_late, synced_late)
   where id = p_record_id;
end;
$$;

revoke execute on function public.cp_apply_attendance_status(uuid, text, timestamptz, boolean)
  from public, anon, authenticated;

-- set_attendance_status (0018 → 0024): instructor gate + delegate. Manual edits
-- pass null for scanned_at/synced_late, so they never touch the offline flag.
create or replace function public.set_attendance_status(p_record_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change attendance.';
  end if;
  if p_status is null or p_status not in ('present', 'late', 'absent', 'excused', 'irregular') then
    raise exception 'Unknown attendance status: %', p_status;
  end if;
  perform public.cp_apply_attendance_status(p_record_id, p_status);
end;
$$;

grant execute on function public.set_attendance_status(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. submit_offline_scan — the queued-proof processor
-- ----------------------------------------------------------------------------
create or replace function public.submit_offline_scan(
  p_session_id uuid,
  p_window     bigint,
  p_code       text
) returns table (outcome text, status text, topic text, marked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student   public.students%rowtype;
  v_session   public.class_sessions%rowtype;
  v_secret    text;
  v_captured  timestamptz;
  v_expected  text;
  v_elapsed   numeric;
  v_status    text;
  v_existing  public.attendance_records%rowtype;
  v_label     text;
  -- status "goodness": present beats late beats absent. Neutral marks aren't
  -- on this scale and are never touched by this student-initiated path.
  v_rank      constant jsonb := '{"present":3,"late":2,"absent":1}';
begin
  -- Structured outcomes (never raise for the classifiable cases) so the client
  -- queue can decide keep/resolve/fail without string-matching messages.
  select * into v_student from public.students where user_id = auth.uid();
  if not found then
    raise exception 'Only a signed-in student can check in.';
  end if;
  if v_student.archived_at is not null then
    return query select 'invalid', null::text, null::text, null::timestamptz; return;
  end if;

  select * into v_session from public.class_sessions where id = p_session_id;
  if not found then
    return query select 'session_missing', null::text, null::text, null::timestamptz; return;
  end if;
  if v_student.section_id <> v_session.section_id then
    return query select 'wrong_section', null::text, null::text, null::timestamptz; return;
  end if;

  -- Capture time from the window index (self-authenticating via the HMAC below).
  v_captured := to_timestamp(p_window * 15);

  select qr_secret into v_secret from public.class_session_secrets where session_id = p_session_id;
  if v_secret is null then
    return query select 'invalid', null::text, null::text, null::timestamptz; return;
  end if;
  v_expected := left(
    encode(extensions.hmac(p_session_id::text || '.' || p_window::text, v_secret, 'sha256'), 'hex'),
    16
  );
  if v_expected is distinct from lower(p_code) then
    return query select 'invalid', null::text, null::text, null::timestamptz; return;
  end if;

  -- The window must fall inside the session's scannable span. The QR stops
  -- rendering at absent_after_min, so any later window was never displayed;
  -- strict `<` also guarantees the computed status is never 'absent'.
  if v_captured < v_session.started_at - interval '30 seconds'
     or v_captured >= v_session.started_at + make_interval(mins => v_session.absent_after_min)
     or v_captured > now() + interval '30 seconds' then
    return query select 'invalid', null::text, null::text, null::timestamptz; return;
  end if;

  -- 48-hour expiry from capture.
  if now() - v_captured > interval '48 hours' then
    return query select 'expired', null::text, null::text, null::timestamptz; return;
  end if;

  v_elapsed := extract(epoch from (v_captured - v_session.started_at)) / 60.0;
  if v_elapsed >= v_session.late_after_min then
    v_status := 'late';
  else
    v_status := 'present';
  end if;

  -- Existing record? (lock it)
  select * into v_existing
    from public.attendance_records
   where session_id = p_session_id and student_id = v_student.id
   for update;

  if not found then
    insert into public.attendance_records (session_id, student_id, status, scanned_at, synced_late)
         values (p_session_id, v_student.id, v_status, v_captured, true)
    on conflict (session_id, student_id) do nothing;
    -- Race with end_class_session / another device: re-read and fall through.
    if not found then
      select * into v_existing
        from public.attendance_records
       where session_id = p_session_id and student_id = v_student.id
       for update;
    end if;
  end if;

  if not found then
    -- Genuinely inserted (no race).
    perform public.cp_queue_notification(
      v_student.id, 'attendance', 'Offline check-in recorded',
      'Your check-in for ' ||
        coalesce(nullif(v_session.topic, ''), to_char(v_session.started_at, 'Mon DD')) ||
        ' was recorded — ' || initcap(v_status) || '.',
      '/app/attendance'
    );
    return query select 'recorded', v_status, v_session.topic, v_captured; return;
  end if;

  -- A row exists (pre-existing or just-lost-the-race).
  -- Neutral instructor marks are never overwritten by a student proof.
  if v_existing.status in ('excused', 'irregular') then
    return query select 'already', v_existing.status, v_session.topic, v_existing.scanned_at; return;
  end if;

  -- Take the better status (user decision): upgrade only when the captured
  -- proof outranks what's recorded; reconcile penalties via the shared core.
  if (v_rank ->> v_status)::int > (v_rank ->> v_existing.status)::int then
    perform public.cp_apply_attendance_status(v_existing.id, v_status, v_captured, true);
    perform public.cp_queue_notification(
      v_student.id, 'attendance', 'Offline check-in synced',
      'Your check-in for ' ||
        coalesce(nullif(v_session.topic, ''), to_char(v_session.started_at, 'Mon DD')) ||
        ' updated to ' || initcap(v_status) || '.',
      '/app/attendance'
    );
    return query select 'upgraded', v_status, v_session.topic, v_captured; return;
  end if;

  -- Same or worse than what's recorded — leave it, report it.
  return query select 'already', v_existing.status, v_session.topic, v_existing.scanned_at;
end;
$$;

grant execute on function public.submit_offline_scan(uuid, bigint, text) to authenticated;
