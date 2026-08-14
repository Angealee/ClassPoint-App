-- ============================================================================
-- ClassPoint · leveling audit (NOT a migration — run each block separately)
--
-- The input for Era 5.0 Phase E (leveling & badges rebalance). The suspicion,
-- from the audit: the ×1.5 level curve (L5 = 661 cumulative pts) outruns what a
-- real 18-week semester can supply, while the points-badge ladder tops out at
-- 150 and exhausts by midterms. These queries replace suspicion with numbers.
--
-- Run each block on its own in the SQL editor (it only shows the last result
-- set of a multi-statement paste). Re-run right before the Phase E checkpoint
-- so the decision uses the freshest weeks.
-- ============================================================================

-- ── 1. Where students actually are on the curve ─────────────────────────────
-- The current level ladder needs: L1=50, L2=125, L3=238, L4=407, L5=661 …
select
  public.cp_level(s.semester_points)             as level_now,
  count(*)                                       as students,
  min(s.semester_points)                         as min_pts,
  round(avg(s.semester_points))                  as avg_pts,
  max(s.semester_points)                         as max_pts
from public.students s
where s.archived_at is null
group by 1
order by 1;

-- ── 2. Supply: points issued per week, by category ──────────────────────────
-- The real earn rate. Multiply the top decile's weekly rate by 18 to see the
-- ceiling a fully-engaged student can reach this semester.
select
  wk.week,
  pe.category,
  count(*)                                       as events,
  sum(pe.points)                                 as net_points,
  sum(pe.points) filter (where pe.points > 0)    as earned,
  sum(-pe.points) filter (where pe.points < 0)   as lost
from public.point_events pe
cross join lateral (
  -- date - date = integer days; week 1 anchors on the semester's Monday.
  select 1 + (
    ((pe.created_at at time zone 'Asia/Manila')::date
      - (select starts_on from public.semesters where is_active)) / 7
  ) as week
) as wk
where pe.semester_id = public.cp_active_semester_id()
group by 1, 2
order by 1, 2;

-- ── 3. Per-student earn distribution (who the curve must serve) ─────────────
-- Quartiles of semester earnings so the retuned curve can put the MEDIAN
-- student around a satisfying level at finals, not just the top scorer.
select
  percentile_cont(0.25) within group (order by s.semester_points) as p25,
  percentile_cont(0.50) within group (order by s.semester_points) as median,
  percentile_cont(0.75) within group (order by s.semester_points) as p75,
  percentile_cont(0.90) within group (order by s.semester_points) as p90,
  max(s.semester_points)                                          as top
from public.students s
where s.archived_at is null;

-- ── 4. Badge-ladder pressure: the points badges vs reality ──────────────────
-- How many students have already maxed the 150-pt ladder ("point_legend"), and
-- how far the leaders are past it. If a majority clears 150 by midterm, the
-- ladder needs new rungs (Phase E adds them).
select
  count(*) filter (where s.lifetime_points >= 40)  as past_point_collector_40,
  count(*) filter (where s.lifetime_points >= 80)  as past_point_master_80,
  count(*) filter (where s.lifetime_points >= 150) as past_point_legend_150,
  count(*)                                          as active_students
from public.students s
where s.archived_at is null;

-- ── 5. Award sizes: what one tap is actually worth ──────────────────────────
-- The distribution of single-award magnitudes. A curve step should feel like
-- "a good week", i.e. a handful of typical awards — not a semester of them.
select
  pe.points,
  pe.category,
  count(*) as times_given
from public.point_events pe
where pe.semester_id = public.cp_active_semester_id()
  and pe.category in ('recitation', 'activity')
group by 1, 2
order by 3 desc
limit 20;
