-- ============================================================================
-- ClassPoint · applied_state.sql — WHICH MIGRATIONS ARE ACTUALLY APPLIED
--
-- NOT A MIGRATION. Read-only, writes nothing, safe to run any number of times.
-- Same category as leveling_audit.sql: paste a block into the Supabase SQL
-- editor and read the answer.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- CLAUDE.md carried roughly forty lines of per-file "WRITTEN AND NOT YET
-- APPLIED" prose that nobody could check without reading every migration and
-- guessing. A stale warning is worse than none, because the next reader cannot
-- tell which half is still true. This asks the database instead.
--
-- Run BLOCK 1, then write the result into CLAUDE.md as one line per migration.
-- Run BLOCK 2 before writing any migration that widens audit_log_action_check:
-- a drop-and-recreate that omits a value silently NARROWS the constraint, and
-- that has already happened twice in this project.
--
-- ⚠ A missing row does NOT always mean "the file was never pasted". A rename
--   inside an already-pasted migration produces exactly the same symptom —
--   that is the 0047 lesson, where get_space_people replaced
--   list_lounge_classmates inside 0042 after 0042 had been run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCK 1 · What exists right now
--
--   Each row names the migration that introduces it, so a missing row is a
--   migration to paste. `present` is the only column you have to read.
-- ----------------------------------------------------------------------------
with expected (migration, kind, name) as (
  values
    -- 0042 · The Student Lounge
    ('0042', 'table',    'lounge_posts'),
    ('0042', 'table',    'lounge_replies'),
    -- 0043 · Student Space messaging
    ('0043', 'table',    'space_rooms'),
    ('0043', 'table',    'space_messages'),
    ('0043', 'function', 'read_dm_thread'),
    -- 0044 · Student Space moderation
    ('0044', 'table',    'space_reports'),
    ('0044', 'function', 'report_content'),
    -- 0045 · Random events (Lounge)
    ('0045', 'table',    'lounge_events'),
    ('0045', 'function', 'cp_event_normalize'),
    -- 0046 · The room panel
    ('0046', 'table',    'space_pins'),
    ('0046', 'function', 'get_room_pins'),
    -- 0047 · get_space_people repair
    ('0047', 'function', 'get_space_people'),
    -- 0048 · Per-room notification level
    ('0048', 'function', 'get_room_level'),
    -- 0049 · Peer groups
    ('0049', 'table',    'peer_groups'),
    ('0049', 'table',    'peer_group_members'),
    -- 0050 · Peer evaluations
    ('0050', 'table',    'peer_evaluations'),
    ('0050', 'table',    'peer_ratings'),
    ('0050', 'function', 'submit_peer_evaluation'),
    -- 0051 · Peer results
    ('0051', 'function', 'get_my_peer_results'),
    ('0051', 'function', 'release_peer_results'),
    -- 0052 · Target an evaluation at specific groups
    ('0052', 'table',    'peer_evaluation_groups'),
    ('0052', 'function', 'cp_peer_in_audience'),
    -- 0053 · Hard-delete a peer evaluation
    ('0053', 'function', 'delete_peer_evaluation'),
    -- 0054 · Flagged comments + group shuffles
    ('0054', 'function', 'apply_peer_group_plan'),
    ('0054', 'function', 'cp_contains_banned_word'),
    -- 0055 · Global event attendance (reported APPLIED 2026-09-21)
    ('0055', 'table',    'event_sessions'),
    ('0055', 'table',    'event_attendance'),
    ('0055', 'function', 'scan_event_attendance'),
    -- 0056 · The event-award guard bypass. No new object, so it is probed by
    --        BLOCK 6 instead — the only tell is a line inside a function body.
    -- 0057 · Grades
    ('0057', 'table',    'grade_policies'),
    ('0057', 'table',    'grade_items'),
    ('0057', 'table',    'grade_scores'),
    ('0057', 'function', 'get_section_grade_sums'),
    -- 0058 · The grade importer
    ('0058', 'function', 'import_grade_term'),
    -- 0059 · Structured student names
    ('0059', 'column',   'students.last_name'),
    ('0059', 'function', 'update_student_name'),
    -- 0060 · Semester close (this era)
    ('0060', 'column',   'semesters.farewell_message'),
    ('0060', 'function', 'archive_semester_students'),
    ('0060', 'function', 'restore_student_into'),
    -- 0061 adds no new object — see BLOCK 6.
    -- 0062 · Student grades + grade boosts (this era)
    ('0062', 'column',   'grade_items.points_cost'),
    ('0062', 'column',   'point_redemptions.grade_item_id'),
    ('0062', 'table',    'grade_boosts'),
    ('0062', 'function', 'get_my_grades'),
    ('0062', 'function', 'request_grade_boost'),
    ('0062', 'function', 'reverse_grade_boost'),
    ('0062', 'function', 'set_student_grades_enabled'),
    ('0062', 'function', 'save_subject_policy')
)
select
  e.migration,
  e.kind,
  e.name,
  case
    when e.kind = 'table' then exists (
      select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = e.name
         and c.relkind = 'r'
    )
    when e.kind = 'function' then exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = e.name
    )
    -- kind = 'column', name = 'table.column'
    else exists (
      select 1
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = split_part(e.name, '.', 1)
         and a.attname = split_part(e.name, '.', 2)
         and a.attnum > 0
         and not a.attisdropped
    )
  end as present
from expected e
order by e.migration, e.kind, e.name;


-- ----------------------------------------------------------------------------
-- BLOCK 1b · The same answer collapsed to one line per migration
--
--   Run this instead of BLOCK 1 when you only want the summary. It is BLOCK 1
--   verbatim (minus its ORDER BY) wrapped in a CTE, so the two can never
--   disagree about what they probed.
-- ----------------------------------------------------------------------------
with expected (migration, kind, name) as (
  values
    ('0042', 'table', 'lounge_posts'), ('0042', 'table', 'lounge_replies'),
    ('0043', 'table', 'space_rooms'), ('0043', 'table', 'space_messages'),
    ('0043', 'function', 'read_dm_thread'),
    ('0044', 'table', 'space_reports'), ('0044', 'function', 'report_content'),
    ('0045', 'table', 'lounge_events'), ('0045', 'function', 'cp_event_normalize'),
    ('0046', 'table', 'space_pins'), ('0046', 'function', 'get_room_pins'),
    ('0047', 'function', 'get_space_people'),
    ('0048', 'function', 'get_room_level'),
    ('0049', 'table', 'peer_groups'), ('0049', 'table', 'peer_group_members'),
    ('0050', 'table', 'peer_evaluations'), ('0050', 'table', 'peer_ratings'),
    ('0050', 'function', 'submit_peer_evaluation'),
    ('0051', 'function', 'get_my_peer_results'), ('0051', 'function', 'release_peer_results'),
    ('0052', 'table', 'peer_evaluation_groups'), ('0052', 'function', 'cp_peer_in_audience'),
    ('0053', 'function', 'delete_peer_evaluation'),
    ('0054', 'function', 'apply_peer_group_plan'), ('0054', 'function', 'cp_contains_banned_word'),
    ('0055', 'table', 'event_sessions'), ('0055', 'table', 'event_attendance'),
    ('0055', 'function', 'scan_event_attendance'),
    ('0057', 'table', 'grade_policies'), ('0057', 'table', 'grade_items'),
    ('0057', 'table', 'grade_scores'), ('0057', 'function', 'get_section_grade_sums'),
    ('0058', 'function', 'import_grade_term'),
    ('0059', 'column', 'students.last_name'), ('0059', 'function', 'update_student_name'),
    ('0060', 'column', 'semesters.farewell_message'),
    ('0060', 'function', 'archive_semester_students'),
    ('0060', 'function', 'restore_student_into'),
    ('0062', 'column', 'grade_items.points_cost'),
    ('0062', 'column', 'point_redemptions.grade_item_id'),
    ('0062', 'table', 'grade_boosts'), ('0062', 'function', 'get_my_grades'),
    ('0062', 'function', 'request_grade_boost'), ('0062', 'function', 'reverse_grade_boost'),
    ('0062', 'function', 'set_student_grades_enabled'),
    ('0062', 'function', 'save_subject_policy')
),
probe as (
  select
    e.migration,
    case
      when e.kind = 'table' then exists (
        select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = e.name and c.relkind = 'r')
      when e.kind = 'function' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = e.name)
      else exists (
        select 1 from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = split_part(e.name, '.', 1)
           and a.attname = split_part(e.name, '.', 2)
           and a.attnum > 0 and not a.attisdropped)
    end as present
  from expected e
)
select
  migration,
  case
    when bool_and(present) then 'applied'
    when bool_or(present)  then 'PARTIAL — read BLOCK 1'
    else 'not applied'
  end as state
from probe
group by migration
order by migration;


-- ----------------------------------------------------------------------------
-- BLOCK 2 · The audit-log constraint, verbatim
--
--   Every migration that writes a NEW audit action must widen this AND re-list
--   every existing value. Copy this output into the new migration rather than
--   trusting a list written down in a comment — the comment is how the
--   constraint got silently narrowed twice.
-- ----------------------------------------------------------------------------
select pg_get_constraintdef(oid) as audit_log_action_check
  from pg_constraint
 where conname = 'audit_log_action_check';


-- ----------------------------------------------------------------------------
-- BLOCK 3 · Scheduled jobs
--
--   Several migrations only reveal themselves through a cron job, so a missing
--   job here is a file that was pasted while pg_cron was unavailable.
--   Expected: classpoint-leaderboard-noon, -pm, -comments-purge,
--   -auth-events-prune, -excuse-nudge, -nightly-backup, and (0045/0050) the
--   per-minute event and peer-evaluation closers.
-- ----------------------------------------------------------------------------
select jobname, schedule, active
  from cron.job
 order by jobname;


-- ----------------------------------------------------------------------------
-- BLOCK 4 · The realtime publication
--
--   Guarded publication adds are easy to miss. Expected members:
--   point_events, attendance_records, class_sessions (0033), lounge_posts
--   (0042), space_messages + space_message_reactions (0043),
--   leaderboard_comments (0020), event_sessions (0055).
--
--   ⚠ event_attendance is DELIBERATELY absent — the instructor's monitor polls
--     get_event_stats instead, because a school-wide event would otherwise push
--     hundreds of row events. Do not "fix" it.
-- ----------------------------------------------------------------------------
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
 order by tablename;


-- ----------------------------------------------------------------------------
-- BLOCK 5 · The backup mirror
--
--   cp_nightly_backup reads pg_class for schema `backup` rather than a
--   hardcoded list (the 0034 decision), so this is the honest answer to "what
--   is actually being backed up".
--
--   A grades table missing here means either that 0057's ownership move of
--   cp_nightly_backup has not run, or that the nightly job has not fired since
--   it did. Check BLOCK 3 before concluding the migration is missing.
-- ----------------------------------------------------------------------------
select c.relname as mirror
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'backup'
 order by c.relname;


-- ----------------------------------------------------------------------------
-- BLOCK 6 · Migrations that add no new object
--
--   Some files only CHANGE a function body, so BLOCK 1 cannot see them. The
--   only honest probe is to look for the line the migration introduced.
--
--   0056 raises a transaction-local GUC `cp.event_award` inside
--   scan_event_attendance so cp_guard_student_update can early-return. Until
--   it is applied, every event scan that awards points fails with
--   "You can only update your display name, photo, bio and interests."
-- ----------------------------------------------------------------------------
select
  '0056' as migration,
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'cp_guard_student_update'
       and pg_get_functiondef(p.oid) like '%cp.event_award%'
  ) as present
union all
--   0061 adds a WHERE clause to set_active_semester's bulk recompute. Until it
--   is applied, activating a semester fails with "UPDATE requires a WHERE
--   clause" — pg_safeupdate refuses the unqualified UPDATE for the API roles.
--
--   ⚠ You cannot test this by CALLING the function here: the SQL editor runs as
--     `postgres`, which the guard exempts, so it succeeds either way. Probing
--     the body is the only honest check from SQL.
select
  '0061',
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'set_active_semester'
       and pg_get_functiondef(p.oid) like '%set semester_points = v.pts%'
  )
union all
--   0062 takes decide_point_redemption from 0029. The new OBJECTS above prove the
--   file was pasted, but a partial paste could leave the OLD decide function in
--   place, and then approving a boost request would deduct the points and never
--   touch the mark. The grade branch writes an audit row — that is the tell.
select
  '0062 · decide_point_redemption has the grade branch',
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'decide_point_redemption'
       and pg_get_functiondef(p.oid) like '%grade_boost%'
  )
union all
--   …and the ledger must accept a POSITIVE redeem row (the refund of a reversed
--   boost). Until the CHECK is widened, reversing a boost fails at the refund.
--
--   ⚠ Postgres stores `between -500 and 50` as `points >= '-500' AND points <=
--     50`, so matching the words "between" or "-500 and 50" finds nothing. The
--     redeem branch's upper bound is the only `<= 50` in the constraint (the
--     other branch tops out at 100), which makes it the honest tell.
select
  '0062 · point_events accepts a refund',
  exists (
    select 1
      from pg_constraint
     where conname = 'point_events_points_check'
       and pg_get_constraintdef(oid) like '%points <= 50)%'
  );
