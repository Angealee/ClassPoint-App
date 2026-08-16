-- ============================================================================
-- ClassPoint · 0037 · Rank movement + rank tenure
-- Run after 0036. Safe to re-run.
--
-- The leaderboard could tell a student WHERE they are and nothing else. It
-- couldn't say whether they'd climbed or slipped, or how long they'd held their
-- place — because `leaderboard_snapshot` was wiped and rebuilt on every refresh,
-- so no previous state survived. The one rank arrow that existed lived in the
-- viewer's own localStorage: their row only, one device only, gone on a clear.
--
-- Two columns fix both, with no new table and no history to prune.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The two new columns
--
--    `rank_since` is when the student's CURRENT RUN began, where a run means
--    "held this rank or better". Climbing does not reset it — only dropping
--    does. On a 208-student board an exact-rank tenure would read 0 or 1 for
--    almost everyone and mean nothing; this way the number rewards holding a
--    position and, deliberately, rewards improving it too.
-- ----------------------------------------------------------------------------
alter table public.leaderboard_snapshot
  add column if not exists previous_rank integer;

alter table public.leaderboard_snapshot
  add column if not exists rank_since timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- 2. Ownership move: refresh_leaderboard_snapshot 0029 → 0037
--
--    Rewritten from DELETE-then-INSERT to an UPSERT plus a sweep, because the
--    old shape destroyed the very rows the new columns need to read.
--
--    The trick that makes this clean: in an ON CONFLICT DO UPDATE, every SET
--    expression is evaluated against the OLD row. So `previous_rank` can be set
--    from `leaderboard_snapshot.rank` in the same statement that overwrites
--    `rank`, and both land correctly. No temp table, no second pass, no
--    read-before-delete ordering to get wrong.
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
     previous_rank, rank_since)
  select r.id,
         r.display_name,
         r.section_id,
         r.lifetime_points,
         r.semester_points,
         r.rn,
         null,      -- first time on the board: no previous rank to report
         now()
    from (
      select s.id, s.display_name, s.section_id, s.lifetime_points, s.semester_points,
             (row_number() over (order by s.semester_points desc, s.display_name asc))::integer as rn
        from public.students s
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
    rank            = excluded.rank;

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
-- 3. No seeding step is needed
--
--    `rank_since` was added NOT NULL DEFAULT now(), so the ALTER above already
--    stamped every existing row — everyone's run starts the moment this
--    migration lands. `previous_rank` is intentionally left NULL: the first
--    refresh after this fills it with a real comparison, and until then the UI
--    shows no arrow at all. Inventing movement from history we never recorded
--    would put a wrong number on all 208 rows.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- Columns exist:
--   select column_name from information_schema.columns
--    where table_name = 'leaderboard_snapshot'
--      and column_name in ('previous_rank', 'rank_since');
--
--   -- Refresh once: previous_rank fills in, ranks unchanged.
--   select public.refresh_leaderboard_snapshot();
--   select display_name, rank, previous_rank,
--          (previous_rank - rank) as moved,
--          date_trunc('minute', rank_since) as holding_since
--     from public.leaderboard_snapshot order by rank limit 10;
--
--   -- ACID TEST — movement must be recorded, and tenure must survive a climb:
--   --   1. Note a mid-table student's rank and rank_since.
--   --   2. Award them enough points to climb, then refresh.
--   --   3. previous_rank = their old rank, and rank_since is UNCHANGED
--   --      (climbing keeps the run alive).
--   --   4. Deduct to push them back down, then refresh.
--   --   5. rank_since is NOW (a drop resets the run).
--
--   -- Nobody archived should remain on the board:
--   select count(*) from public.leaderboard_snapshot ls
--     join public.students s on s.id = ls.student_id
--    where s.archived_at is not null;   -- expect 0
-- ============================================================================
