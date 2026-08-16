-- ============================================================================
-- ClassPoint · 0036 · Per-term badges
-- Run after 0035. Safe to re-run.
--
-- The lifetime points ladder (40 / 80 / 150) rewards a whole career and is
-- untouched. This adds four badges you chase inside a SINGLE SIX-WEEK TERM, so
-- there is something winnable in a shorter horizon than a semester.
--
-- ── ONE-SHOT, NOT RE-EARNABLE (instructor's decision) ───────────────────────
-- `student_achievements` is `unique (student_id, achievement_code)`, so a badge
-- unlocks once, ever. These metrics are therefore "your BEST single term" —
-- `term_points` is the most you have ever banked within one term, across every
-- term of every semester. Do it once and the badge is yours for good, which is
-- consistent with the standing rule that achievements are lifetime (0029).
--
-- ── THE OWNERSHIP RULE (the 0021 lesson) ────────────────────────────────────
-- `cp_achievement_metrics` has exactly ONE owning migration. Its return type
-- GROWS here (four new columns), and `create or replace` cannot change a
-- signature — so this file drops it first, recreates it with 0030's body copied
-- forward VERBATIM plus the additions, then drops and recreates both dependents
-- and re-grants everything.
--
-- OWNERSHIP MOVE: cp_achievement_metrics 0030 → 0036.
--                 get_achievement_progress 0030 → 0036 (return type grows too).
--                 sync_achievements 0030 → 0036.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Metrics — 0030's body, forward, plus four term-scoped columns
--
--    A term is a row in `semester_terms` with EDITABLE dates (0027), so these
--    read the stored dates rather than computing six-week blocks. Dates are
--    compared in MANILA time: `created_at`/`started_at` are timestamptz against
--    plain dates, and a naive compare casts at UTC, which would push a 7am class
--    into the previous day and out of its own term (the 0034 lesson).
--
--    Every term of every semester is its own bucket, and the metric is the MAX
--    across them — that is what makes "do it in any single term" work.
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
  -- NEW in 0036 — all "best single term".
  term_points       integer,
  term_recitations  integer,
  term_early_streak integer,
  perfect_terms     integer,
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
  v_present    integer;
  v_attended   integer;
  v_streak_all integer;
  v_streak_sub integer;
  v_early_all  integer;
  v_early_sub  integer;
  -- 0036 additions
  v_term_points integer;
  v_term_recit  integer;
  v_term_early  integer;
  v_perfect     integer;
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

  -- ── 0036: best single term ────────────────────────────────────────────────
  -- Joined on the event's OWN semester_id (0029) as well as the date window, so
  -- a term from a different semester whose dates happen to overlap can never
  -- swallow these rows.
  select coalesce(max(total), 0)::integer into v_term_points
    from (
      select greatest(0, sum(pe.points)) as total
        from public.point_events pe
        join public.semester_terms st
          on st.semester_id = pe.semester_id
         and (pe.created_at at time zone 'Asia/Manila')::date
             between st.starts_on and st.ends_on
       where pe.student_id = p_student_id
       group by st.semester_id, st.term
    ) t;

  select coalesce(max(cnt), 0)::integer into v_term_recit
    from (
      select count(*) as cnt
        from public.point_events pe
        join public.semester_terms st
          on st.semester_id = pe.semester_id
         and (pe.created_at at time zone 'Asia/Manila')::date
             between st.starts_on and st.ends_on
       where pe.student_id = p_student_id and pe.category = 'recitation'
       group by st.semester_id, st.term
    ) t;

  -- Longest CONSECUTIVE on-time run inside one term (gaps-and-islands): rows
  -- sharing a `grp` are an unbroken run, because grp only increments on a
  -- not-early class. Deliberately not the trailing-run trick used above — a
  -- finished term's best run can sit anywhere inside it, not just at the end.
  select coalesce(max(run_len), 0)::integer into v_term_early
    from (
      select count(*) as run_len
        from (
          select st.semester_id,
                 st.term,
                 (ar.scanned_at is not null
                    and ar.scanned_at <= cs.started_at + interval '2 minutes') as is_early,
                 sum(
                   case when ar.scanned_at is not null
                             and ar.scanned_at <= cs.started_at + interval '2 minutes'
                        then 0 else 1 end
                 ) over (partition by st.semester_id, st.term order by cs.started_at) as grp
            from public.attendance_records ar
            join public.class_sessions cs on cs.id = ar.session_id
            join public.sections sec on sec.id = cs.section_id
            join public.semester_terms st
              on st.semester_id = sec.semester_id
             and (cs.started_at at time zone 'Asia/Manila')::date
                 between st.starts_on and st.ends_on
           where ar.student_id = p_student_id
             and ar.status not in ('excused', 'irregular')
        ) s
       where s.is_early
       group by s.semester_id, s.term, s.grp
    ) t;

  -- Terms finished with zero absences. Requires at least 6 counted classes so a
  -- term containing one session can't hand out "perfect attendance".
  -- excused/irregular are NEUTRAL: they neither count toward the 6 nor break it.
  select count(*)::integer into v_perfect
    from (
      select st.semester_id, st.term,
             count(*) filter (where ar.status in ('present','late','absent')) as counted,
             count(*) filter (where ar.status = 'absent') as absents
        from public.attendance_records ar
        join public.class_sessions cs on cs.id = ar.session_id
        join public.sections sec on sec.id = cs.section_id
        join public.semester_terms st
          on st.semester_id = sec.semester_id
         and (cs.started_at at time zone 'Asia/Manila')::date
             between st.starts_on and st.ends_on
       where ar.student_id = p_student_id
       group by st.semester_id, st.term
    ) t
   where t.counted >= 6 and t.absents = 0;

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
    v_term_points,
    v_term_recit,
    v_term_early,
    v_perfect,
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
--    get_achievement_progress's return type GROWS, so it must be dropped first.
-- ----------------------------------------------------------------------------
drop function if exists public.get_achievement_progress(uuid);
create function public.get_achievement_progress(p_student_id uuid)
returns table (
  points integer, recitations integer, present_count integer, attended_count integer,
  streak integer, early_streak integer, level integer, rank integer,
  views_received integer, views_given integer, unlocked_count integer, banner_count integer,
  points_spent integer, redemptions_approved integer,
  term_points integer, term_recitations integer, term_early_streak integer,
  perfect_terms integer
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
           m.points_spent, m.redemptions_approved,
           m.term_points, m.term_recitations, m.term_early_streak, m.perfect_terms
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
        ('high_roller',        m.points_spent >= 100),
        -- 0036 — per-term
        ('term_ace',           m.term_points >= 18),
        ('flawless_term',      m.perfect_terms >= 1),
        ('term_talker',        m.term_recitations >= 8),
        ('six_sharp',          m.term_early_streak >= 6)
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

-- ----------------------------------------------------------------------------
-- 3. Widen the metric CHECK, then seed the four badges (idempotent upsert)
-- ----------------------------------------------------------------------------
alter table public.achievements drop constraint if exists achievements_metric_check;
alter table public.achievements
  add constraint achievements_metric_check check (
    metric is null or metric in (
      'points','recitations','present_count','attended_count','streak','early_streak',
      'level','rank','views_received','views_given','unlocked_count','banner_count',
      'points_spent','redemptions_approved',
      'term_points','term_recitations','term_early_streak','perfect_terms'
    )
  );

insert into public.achievements (code, category, name, description, secret, granted_by, title_text, metric, threshold, sort_order) values
  ('term_ace',      'points',     'Term Ace',      'Bank 18 points inside a single term — not a whole semester, one term.', false, 'system', 'The Closer', 'term_points', 18, 100),
  ('flawless_term', 'attendance', 'Flawless',      'Get through an entire term without a single absence.',                   false, 'system', 'Untouchable', 'perfect_terms', 1, 101),
  ('term_talker',   'points',     'Certified Yapper', 'Eight recitation awards in one term. The hand goes up.',              false, 'system', null, 'term_recitations', 8, 102),
  ('six_sharp',     'attendance', 'Six Sharp',     'Six classes in a row, on time, inside one term.',                        false, 'system', null, 'term_early_streak', 6, 103)
on conflict (code) do update set
  category    = excluded.category,
  name        = excluded.name,
  description = excluded.description,
  secret      = excluded.secret,
  granted_by  = excluded.granted_by,
  title_text  = excluded.title_text,
  metric      = excluded.metric,
  threshold   = excluded.threshold,
  sort_order  = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 4. NO BACKFILL — deliberately, and this is worth explaining
--
--    The obvious move is a loop calling sync_achievements() for every student.
--    It does not work, and worse, it FAILS SILENTLY:
--
--      sync_achievements gates on `is_instructor() or <you are this student>`.
--      is_instructor() reads `auth.jwt() ->> 'email'`, and the SQL editor has no
--      JWT — so the gate raises for every single student. Wrapped in the
--      exception handler such a loop needs, the whole backfill reports success
--      and inserts nothing.
--
--    Inlining the badge rules into a DO block instead would duplicate the
--    threshold list in two places, which is exactly how the two copies drift.
--
--    None of this matters, because badges already sync lazily: StudentData
--    calls syncAchievements() on every app open (and the RPC is idempotent, and
--    only ever INSERTS). Every previous badge migration — 0016, 0021 — relied on
--    the same thing and shipped no backfill either. Students pick these up the
--    next time they open the app, which is also the only moment they could
--    possibly see them.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Verify (run the whole file twice — it is idempotent):
--
--   -- The four new metrics, for a student with history:
--   select term_points, term_recitations, term_early_streak, perfect_terms
--     from public.cp_achievement_metrics('<student id>');
--
--   -- Who cleared the hard one? On this semester's data expect very few —
--   -- 18 points in a six-week term is deliberately top-of-class.
--   select count(*) from public.student_achievements where achievement_code = 'term_ace';
--
--   -- All four seeded and constrained:
--   select code, name, metric, threshold from public.achievements
--    where metric in ('term_points','term_recitations','term_early_streak','perfect_terms')
--    order by sort_order;
--
--   -- Sanity: term_points can never exceed lifetime points.
--   select count(*) from public.students s
--    where (select term_points from public.cp_achievement_metrics(s.id)) > s.lifetime_points;
--   -- expect 0
-- ============================================================================
