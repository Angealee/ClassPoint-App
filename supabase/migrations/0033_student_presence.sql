-- ============================================================================
-- ClassPoint · 0033 · Student presence: live classes + the excuse deadline
-- Run after 0032. Safe to re-run.
--
-- Two gaps this closes, both about a student not knowing something in time.
--
-- 1. A STUDENT CANNOT TELL THAT CLASS HAS STARTED. `class_sessions` was never
--    in the realtime publication, so the only way to learn a session is live is
--    to be in the room and see the QR. Adding it lets the app show a "class is
--    live now" banner the moment you start one.
--
--    Safe to publish: `class_sessions` is already `for select using (true)` to
--    authenticated (0014), realtime honours that same RLS, and the thing that
--    actually matters — the rotating QR secret — lives in the separate
--    instructor-only `class_session_secrets` table and is NOT published.
--
-- 2. THE 7-DAY EXCUSE WINDOW EXPIRES SILENTLY. `request_absence_excuse` (0025)
--    refuses an excuse more than 7 days after the session, and nothing warns the
--    student. An absence that could have been excused just quietly becomes
--    permanent — the one deadline in this app with a real consequence.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. The cron job is created below and upserts by name.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Publish class_sessions (0004's guarded pattern — re-runnable)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'class_sessions'
  ) then
    alter publication supabase_realtime add table public.class_sessions;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. The excuse-deadline nudge
--
--    Fires ONE push per absence, on day 5 of the 7-day window, leaving two full
--    days to get an admission slip signed. Never repeats: the dedupe below
--    checks whether a notification already points at this record.
-- ----------------------------------------------------------------------------
create or replace function public.cp_excuse_nudge()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_ids    uuid[] := '{}';
  v_id     uuid;
begin
  for r in
    select ar.id            as record_id,
           ar.student_id,
           cs.started_at,
           coalesce(sub.code, 'class') as subject_code,
           '/app/attendance?nudge=' || ar.id as url
      from public.attendance_records ar
      join public.class_sessions cs on cs.id = ar.session_id
      left join public.subjects sub on sub.id = cs.subject_id
      join public.students s on s.id = ar.student_id
     where ar.status = 'absent'
       and s.archived_at is null
       -- Day 5 of 7: the session is 5–6 days old. Every session lands in this
       -- window on exactly one nightly run, whatever hour it started.
       and cs.started_at <= now() - interval '5 days'
       and cs.started_at >  now() - interval '6 days'
       -- Nothing filed yet. A CANCELLED excuse is deliberately not counted —
       -- the student withdrew it and can still refile inside the window.
       and not exists (
         select 1 from public.absence_excuses ae
          where ae.record_id = ar.id
            and ae.status in ('pending', 'approved', 'rejected')
       )
       -- Dedupe as an anti-join rather than a per-row check inside the loop:
       -- one nudge per absence, ever, even if the window arithmetic ever
       -- overlaps or this is run by hand mid-day.
       and not exists (
         select 1 from public.notifications n
          where n.student_id = ar.student_id
            and n.url = '/app/attendance?nudge=' || ar.id
       )
  loop
    -- The copy states the ACTUAL deadline date, not "2 days left". The window
    -- spans 5–6 days old, so the time remaining is anywhere from ~1 to 2 days
    -- (an evening class caught at 5d22h has barely one) — a relative count
    -- would be wrong at the edge, and this is the one deadline in the app that
    -- costs a student real points.
    v_id := public.cp_queue_notification(
      r.student_id,
      'excuse',
      'Excuse an absence before it locks in',
      'Your ' || r.subject_code || ' absence from ' ||
        to_char(r.started_at at time zone 'Asia/Manila', 'Mon DD') ||
        ' can still be excused until ' ||
        to_char((r.started_at + interval '7 days') at time zone 'Asia/Manila', 'Mon DD') ||
        ' — bring your admission slip.',
      r.url
    );
    v_ids := v_ids || v_id;
  end loop;

  if array_length(v_ids, 1) > 0 then
    perform public.cp_push_dispatch(v_ids);
  end if;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke execute on function public.cp_excuse_nudge() from public, anon, authenticated;

-- 18:00 Manila = 10:00 UTC. Early evening, when students are on their phones.
-- cron.schedule upserts by job name, so re-running just retargets it.
select cron.schedule(
  'classpoint-excuse-nudge', '0 10 * * *',
  $$select public.cp_excuse_nudge();$$
);

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- class_sessions is published (expect 1 row):
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename = 'class_sessions';
--
--   select jobname, schedule from cron.job where jobname = 'classpoint-excuse-nudge';
--
--   -- Dry-run the nudge. Returns how many pushes it queued; running it a second
--   -- time must return 0, which proves the dedupe works.
--   select public.cp_excuse_nudge();
--   select public.cp_excuse_nudge();                                -- expect 0
--
--   -- What it queued:
--   select student_id, title, url, created_at from public.notifications
--    where type = 'excuse' order by created_at desc limit 10;
-- ============================================================================
