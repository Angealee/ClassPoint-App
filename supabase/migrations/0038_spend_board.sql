-- ============================================================================
-- ClassPoint · 0038 · The spend board ("climb or cash out")
-- Run after 0037. Safe to re-run.
--
-- Spending is currently PURE LOSS. `decide_point_redemption` (0029) writes a
-- negative `point_events` row, so an approved redemption drops the student's
-- XP, their level and their leaderboard rank — and nothing anywhere shows an
-- upside. A student who reasons about it never spends, which is why the rewards
-- catalog added in 0032 sees so little use.
--
-- This adds the counterweight: a second ranking where spending is what WINS.
-- Two boards, two ways to be top of the class, one decision to make.
--
-- ── WHY THE SNAPSHOT AND NOT A NEW RPC ──────────────────────────────────────
-- A student cannot compute anyone else's spending: `point_events` (0003) and
-- `point_redemptions` (0019) are both "own rows or instructor". The points
-- board already solves this by reading `leaderboard_snapshot`, a table the cron
-- writes and every authenticated user may select. Putting spend in the SAME
-- table means both boards settle at the same moment, obey the same RLS, and
-- arrive in ONE request. A separate RPC would settle on its own schedule and
-- the two boards would visibly disagree about the same students.
--
-- ── WHY THE LEDGER AND NOT point_redemptions ────────────────────────────────
-- `point_events` is authoritative, and its rows are semester-stamped by the
-- 0029 trigger — so the same `semester_id = cp_active_semester_id()` filter
-- that `cp_recompute_points` uses gives per-semester spend for free. Summing
-- `point_redemptions` instead would be a second definition of one quantity,
-- which is the bug this project has already fixed twice.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The two new columns
--
--    `spend_rank` is NULLABLE and null means "has not spent anything". It is
--    deliberately not a rank at the bottom: on current data (median 22 points a
--    semester, catalog items 1-50) the large majority will have spent nothing,
--    and a ~170-way tie at zero ordered by name would read as a ranking while
--    meaning nothing. "Not on this board yet" is both truer and a better
--    prompt.
-- ----------------------------------------------------------------------------
alter table public.leaderboard_snapshot
  add column if not exists spent_points integer not null default 0;

alter table public.leaderboard_snapshot
  add column if not exists spend_rank integer;

create index if not exists leaderboard_snapshot_spend_rank_idx
  on public.leaderboard_snapshot (spend_rank);

-- ----------------------------------------------------------------------------
-- 2. Ownership move: refresh_leaderboard_snapshot 0037 → 0038
--
--    Same signature, so a plain `create or replace` (no drop, and existing
--    grants survive). 0037's body is carried forward VERBATIM — the upsert
--    shape, the old-row reads in ON CONFLICT, the sweep and the meta stamp are
--    all unchanged — with only the spend CTE and the two new columns added.
--
--    The `display_name asc` tiebreaker on the spend ordering MATCHES the one on
--    the points ordering on purpose. `row_number()` gives a strict order where
--    `rank()` would give ties, and a student's remembered placing must not
--    change under them between refreshes (the 0035 lesson).
--
--    NO `previous_spend_rank`. 0037 deliberately left `previous_rank` null
--    rather than invent movement from history that was never recorded; the
--    spend board has no history at all yet, so the same rule applies.
-- ----------------------------------------------------------------------------
create or replace function public.refresh_leaderboard_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leaderboard_snapshot
    (student_id, display_name, section_id, lifetime_points, semester_points, rank,
     previous_rank, rank_since, spent_points, spend_rank)
  select r.id,
         r.display_name,
         r.section_id,
         r.lifetime_points,
         r.semester_points,
         r.rn,
         null,      -- first time on the board: no previous rank to report
         now(),
         r.spent,
         -- Zeros sort last, so spenders take 1..k and everyone else is nulled.
         case when r.spent > 0 then r.spend_rn end
    from (
      select s.id, s.display_name, s.section_id, s.lifetime_points, s.semester_points,
             (row_number() over (order by s.semester_points desc, s.display_name asc))::integer as rn,
             coalesce(sp.spent, 0)::integer as spent,
             (row_number() over (
                order by coalesce(sp.spent, 0) desc, s.display_name asc
              ))::integer as spend_rn
        from public.students s
        left join (
          select pe.student_id, (-sum(pe.points))::integer as spent
            from public.point_events pe
           where pe.category = 'redeem'
             and pe.semester_id = public.cp_active_semester_id()
           group by pe.student_id
        ) sp on sp.student_id = s.id
       where s.archived_at is null
    ) r
  on conflict (student_id) do update set
    display_name    = excluded.display_name,
    section_id      = excluded.section_id,
    lifetime_points = excluded.lifetime_points,
    semester_points = excluded.semester_points,
    -- Old values on the right-hand side; see the note above. Referenced by the
    -- bare table name — ON CONFLICT does not accept a schema qualifier here.
    previous_rank   = leaderboard_snapshot.rank,
    rank_since      = case
                        when excluded.rank <= leaderboard_snapshot.rank
                          then leaderboard_snapshot.rank_since  -- held or climbed
                        else now()                              -- dropped: reset
                      end,
    rank            = excluded.rank,
    spent_points    = excluded.spent_points,
    spend_rank      = excluded.spend_rank;

  -- Students who left the board (archived, or deleted outright) are swept here.
  -- The old function got this for free by truncating; an upsert has to say it.
  delete from public.leaderboard_snapshot ls
   where not exists (
     select 1 from public.students s
      where s.id = ls.student_id and s.archived_at is null
   );

  insert into public.leaderboard_meta (id, captured_at)
       values (true, now())
  on conflict (id) do update set captured_at = excluded.captured_at;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Fill the new columns immediately
--
--    The ALTERs above default every existing row to 0 / null, which would leave
--    the spend board empty until the next cron refresh (12:30 / 19:30 Manila).
--    One call fills it now — the 0029 precedent.
-- ----------------------------------------------------------------------------
select public.refresh_leaderboard_snapshot();

-- ============================================================================
-- Verify (run this file twice — it is idempotent):
--
--   -- Columns exist:
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'leaderboard_snapshot'
--      and column_name in ('spent_points', 'spend_rank');
--
--   -- THE REGRESSION TO CHECK FIRST. This migration rewrites the function that
--   -- owns the POINTS board, so prove that board did not move. Capture before
--   -- pasting, compare after:
--   --   select student_id, rank, previous_rank, rank_since
--   --     from public.leaderboard_snapshot order by rank;
--   -- `rank` must be identical. (`previous_rank` legitimately advances by one
--   -- refresh, and `rank_since` only changes for students who dropped.)
--
--   -- The board itself:
--   select spend_rank, display_name, spent_points, semester_points,
--          (semester_points + spent_points) as would_have_had
--     from public.leaderboard_snapshot
--    where spend_rank is not null
--    order by spend_rank;
--
--   -- Non-spenders are unranked, and the ranks are gapless 1..k:
--   select count(*) filter (where spend_rank is null and spent_points > 0) as bad_null,
--          count(*) filter (where spend_rank is not null and spent_points = 0) as bad_ranked,
--          count(*) filter (where spend_rank is not null) as ranked,
--          max(spend_rank) as top_rank
--     from public.leaderboard_snapshot;   -- expect bad_null = 0, bad_ranked = 0,
--                                         -- and ranked = top_rank
--
--   -- Spot-check one student against the ledger (replace the id):
--   select -sum(points) from public.point_events
--    where student_id = '00000000-0000-0000-0000-000000000000'
--      and category = 'redeem'
--      and semester_id = public.cp_active_semester_id();
--   -- must equal that student's spent_points above.
-- ============================================================================
