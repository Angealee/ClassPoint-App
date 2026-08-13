-- ============================================================================
-- ClassPoint · 0030 · Per-subject attendance metrics
-- Run after 0029. Safe to re-run.
--
-- WHY: 0028 made attendance subject-scoped, but the achievement metrics still
-- read every session as one undifferentiated pile. A student perfect in IT 32
-- and absent all month in Elective 1 looked identical to one who was mediocre in
-- both. This teaches the metrics about subjects.
--
-- THE TWO RULES (both chosen by the instructor):
--
--   Counts (present_count, attended_count) → BEST SUBJECT.
--     max(count) grouped by subject. "On Time" and "Reliable" now measure how
--     well you did in your strongest class rather than summing across both.
--
--   Streaks (streak, early_streak) → BEST OF per-subject OR combined.
--     greatest(combined_run, best_per_subject_run). Per-subject alone would have
--     shortened runs that legitimately span two classes, so every student's
--     progress bar would have dropped on the day this shipped through no fault
--     of their own. Taking the better of the two can only ever help, and it is
--     still honest: whichever number is larger IS a real run the student made.
--     Note per-subject can EXCEED combined — an absence in IT 32 breaks the
--     combined run but leaves an Elective 1 run untouched.
--
-- Untagged sessions (subject_id is null, i.e. everything from before 0028) form
-- their own group rather than being dropped. History that happened still counts,
-- and the numbers sharpen as the instructor re-tags from Class history.
--
-- ── OWNERSHIP (the 0021 lesson, still the rule) ─────────────────────────────
--   cp_achievement_metrics has exactly ONE owner, now THIS file (0021 → 0030).
--   Two migrations recreating it clash on re-run the moment its return type
--   moves (ERROR 42P13: cannot change return type). So: drop first, recreate,
--   then drop-first + recreate the dependents and re-grant. The return type is
--   unchanged here, but the discipline is what keeps it re-runnable.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Re-tagging legacy sessions (Class history → "N sessions with no
--   subject yet") is worth finishing, but nothing here waits on it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. cp_achievement_metrics — ownership move 0021 → 0030
-- ----------------------------------------------------------------------------
drop function if exists public.cp_achievement_metrics(uuid);
create function public.cp_achievement_metrics(p_student_id uuid)
returns table (
  points          integer,
  recitations     integer,
  present_count   integer,
  attended_count  integer,
  streak          integer,
  early_streak    integer,
  level           integer,
  rank            integer,
  views_received  integer,
  views_given     integer,
  unlocked_count  integer,
  banner_count    integer,
  points_spent        integer,
  redemptions_approved integer,
  has_events      boolean,
  has_attendance  boolean,
  has_avatar      boolean,
  has_bio_and_interests boolean,
  has_clean_slate boolean,
  has_comeback    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points     integer;
  v_bio        text;
  v_interests  text;
  v_avatar     text;
  v_banners    text[];
  v_created_at timestamptz;
  -- Attendance metrics are computed up front: the per-subject variants need
  -- window functions over grouped subqueries, which are unreadable inlined into
  -- a 20-column RETURN QUERY.
  v_present    integer;
  v_attended   integer;
  v_streak_all integer;
  v_streak_sub integer;
  v_early_all  integer;
  v_early_sub  integer;
begin
  -- lifetime_points, NOT semester_points: achievements are lifetime by decision
  -- (0029). A badge earned is a badge kept, and the `level` metric below has to
  -- agree with that or a returning student's progress would appear to regress.
  select lifetime_points, bio, interests, avatar_url, banner_urls, created_at
    into v_points, v_bio, v_interests, v_avatar, v_banners, v_created_at
    from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found.';
  end if;

  -- ── Counts: best subject ──────────────────────────────────────────────────
  select coalesce(max(cnt), 0)::integer into v_present
    from (
      select count(*) as cnt
        from public.attendance_records ar
        join public.class_sessions cs on cs.id = ar.session_id
       where ar.student_id = p_student_id and ar.status = 'present'
       group by cs.subject_id
    ) t;

  select coalesce(max(cnt), 0)::integer into v_attended
    from (
      select count(*) as cnt
        from public.attendance_records ar
        join public.class_sessions cs on cs.id = ar.session_id
       where ar.student_id = p_student_id and ar.status in ('present', 'late')
       group by cs.subject_id
    ) t;

  -- ── Streaks: combined run ─────────────────────────────────────────────────
  -- Newest-first; excused/irregular excluded so they neither break nor pad the
  -- run (0018's rule, carried forward).
  select count(*)::integer into v_streak_all
    from (
      select sum(case when ar.status = 'absent' then 1 else 0 end)
               over (order by cs.started_at desc) as running_absent
        from public.attendance_records ar
        join public.class_sessions cs on cs.id = ar.session_id
       where ar.student_id = p_student_id
         and ar.status not in ('excused', 'irregular')
    ) t
   where running_absent = 0;

  -- ── Streaks: best single subject ──────────────────────────────────────────
  select coalesce(max(cnt), 0)::integer into v_streak_sub
    from (
      select count(*) filter (where running_absent = 0) as cnt
        from (
          select cs.subject_id,
                 sum(case when ar.status = 'absent' then 1 else 0 end)
                   over (partition by cs.subject_id order by cs.started_at desc)
                   as running_absent
            from public.attendance_records ar
            join public.class_sessions cs on cs.id = ar.session_id
           where ar.student_id = p_student_id
             and ar.status not in ('excused', 'irregular')
        ) s
       group by s.subject_id
    ) t;

  -- ── Early streak: combined, then best subject ─────────────────────────────
  select count(*)::integer into v_early_all
    from (
      select sum(
               case when ar.scanned_at is not null
                         and ar.scanned_at <= cs.started_at + interval '2 minutes'
                    then 0 else 1 end
             ) over (order by cs.started_at desc) as running_not_early
        from public.attendance_records ar
        join public.class_sessions cs on cs.id = ar.session_id
       where ar.student_id = p_student_id
         and ar.status not in ('excused', 'irregular')
    ) t
   where running_not_early = 0;

  select coalesce(max(cnt), 0)::integer into v_early_sub
    from (
      select count(*) filter (where running_not_early = 0) as cnt
        from (
          select cs.subject_id,
                 sum(
                   case when ar.scanned_at is not null
                             and ar.scanned_at <= cs.started_at + interval '2 minutes'
                        then 0 else 1 end
                 ) over (partition by cs.subject_id order by cs.started_at desc)
                 as running_not_early
            from public.attendance_records ar
            join public.class_sessions cs on cs.id = ar.session_id
           where ar.student_id = p_student_id
             and ar.status not in ('excused', 'irregular')
        ) s
       group by s.subject_id
    ) t;

  return query
  select
    v_points,
    (select count(*)::integer from public.point_events
      where student_id = p_student_id and category = 'recitation'),
    v_present,
    v_attended,
    greatest(v_streak_all, v_streak_sub),
    greatest(v_early_all, v_early_sub),
    public.cp_level(v_points),
    (select rank from public.leaderboard_snapshot where student_id = p_student_id),
    (select coalesce(sum(view_count), 0)::integer from public.profile_views where viewed_id = p_student_id),
    (select coalesce(sum(view_count), 0)::integer from public.profile_views where viewer_id = p_student_id),
    (select count(*)::integer from public.student_achievements where student_id = p_student_id),
    coalesce(array_length(v_banners, 1), 0),
    (select coalesce(sum(points), 0)::integer from public.point_redemptions
      where student_id = p_student_id and status = 'approved'),
    (select count(*)::integer from public.point_redemptions
      where student_id = p_student_id and status = 'approved'),
    exists(select 1 from public.point_events where student_id = p_student_id),
    exists(select 1 from public.attendance_records where student_id = p_student_id and scanned_at is not null),
    v_avatar is not null,
    v_bio is not null and v_interests is not null,
    v_created_at <= now() - interval '30 days'
      and not exists (
        select 1 from public.point_events
         where student_id = p_student_id and category = 'penalty'
           and created_at >= now() - interval '30 days'
      ),
    exists (
      select 1
        from public.point_events p
        join public.point_events pen
          on pen.student_id = p.student_id and pen.category = 'penalty'
       where p.student_id = p_student_id and p.points > 0
         and p.created_at > pen.created_at
         and p.created_at <= pen.created_at + interval '24 hours'
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Dependents — recreated so they bind to the new function, and re-granted.
--    Bodies are unchanged from 0021; only their ownership moves here.
-- ----------------------------------------------------------------------------
drop function if exists public.get_achievement_progress(uuid);
create function public.get_achievement_progress(p_student_id uuid)
returns table (
  points integer, recitations integer, present_count integer, attended_count integer,
  streak integer, early_streak integer, level integer, rank integer,
  views_received integer, views_given integer, unlocked_count integer, banner_count integer,
  points_spent integer, redemptions_approved integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_student uuid;
begin
  select id into v_caller_student from public.students where user_id = auth.uid();
  if not (public.is_instructor() or v_caller_student = p_student_id) then
    raise exception 'You can only view your own achievement progress.';
  end if;

  return query
    select m.points, m.recitations, m.present_count, m.attended_count, m.streak, m.early_streak,
           m.level, m.rank, m.views_received, m.views_given, m.unlocked_count, m.banner_count,
           m.points_spent, m.redemptions_approved
      from public.cp_achievement_metrics(p_student_id) m;
end;
$$;

grant execute on function public.get_achievement_progress(uuid) to authenticated;

create or replace function public.sync_achievements(p_student_id uuid)
returns table(code text, name text, title_text text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_student uuid;
  m record;
begin
  select id into v_caller_student from public.students where user_id = auth.uid();
  if not (public.is_instructor() or v_caller_student = p_student_id) then
    raise exception 'You can only sync your own achievements.';
  end if;

  select * into m from public.cp_achievement_metrics(p_student_id);

  return query
    with satisfied(achievement_code, ok) as (
      values
        ('first_steps',        m.has_events),
        ('point_collector',    m.points >= 40),
        ('point_master',       m.points >= 80),
        ('recitation_regular', m.recitations >= 12),
        ('point_legend',       m.points >= 150),
        ('checked_in',         m.has_attendance),
        ('on_time',            m.present_count >= 10),
        ('reliable',           m.attended_count >= 20),
        ('streak_starter',     m.streak >= 5),
        ('iron_attendance',    m.streak >= 20),
        ('leveling_up',        m.level >= 1),
        ('halfway_hero',       m.level >= 3),
        ('top_ten',            m.rank is not null and m.rank <= 10),
        ('podium_finish',      m.rank is not null and m.rank <= 3),
        ('peak_performer',     m.rank = 1),
        ('picture_perfect',    m.has_avatar),
        ('open_book',          m.has_bio_and_interests),
        ('show_and_tell',      m.banner_count >= 3),
        ('getting_noticed',    m.views_received >= 20),
        ('profile_icon',       m.views_received >= 100),
        ('curious_classmate',  m.views_given >= 20),
        ('early_bird',         m.early_streak >= 8),
        ('clean_slate',        m.has_clean_slate),
        ('comeback_kid',       m.has_comeback),
        ('the_collector',      m.unlocked_count >= 20),
        ('big_spender',        m.redemptions_approved >= 1),
        ('high_roller',        m.points_spent >= 100)
    ),
    inserted as (
      insert into public.student_achievements (student_id, achievement_code)
      select p_student_id, s.achievement_code
        from satisfied s
        join public.achievements a on a.code = s.achievement_code and a.granted_by = 'system'
       where s.ok
      on conflict (student_id, achievement_code) do nothing
      returning achievement_code
    )
    select a.code, a.name, a.title_text
      from inserted i
      join public.achievements a on a.code = i.achievement_code;
end;
$$;

grant execute on function public.sync_achievements(uuid) to authenticated;

-- ============================================================================
-- Event-granted badges are still NOT in the satisfied list above:
-- `town_crier` (trg_town_crier on leaderboard_comments) and `window_shopper`
-- (trg_window_shopper on point_redemptions) are set by TRIGGERS and have no
-- metric. Don't add them to sync.
-- ============================================================================
-- Verify (run twice — the drop-first must re-run cleanly):
--
--   -- Exactly one of each, no accidental overloads:
--   select proname, count(*) from pg_proc
--    where proname in ('cp_achievement_metrics','get_achievement_progress','sync_achievements')
--    group by proname;                                     -- 1, 1, 1
--
--   -- Pick a student with sessions in BOTH subjects and eyeball the split:
--   select present_count, attended_count, streak, early_streak
--     from public.cp_achievement_metrics('<student-uuid>');
--
--   -- The counts above should equal the LARGEST of these rows:
--   select cs.subject_id,
--          count(*) filter (where ar.status = 'present') as present,
--          count(*) filter (where ar.status in ('present','late')) as attended
--     from public.attendance_records ar
--     join public.class_sessions cs on cs.id = ar.session_id
--    where ar.student_id = '<student-uuid>'
--    group by cs.subject_id;
--
--   -- And streak must never be SMALLER than it was before this migration
--   -- (greatest(combined, per-subject) can only go up).
-- ============================================================================
