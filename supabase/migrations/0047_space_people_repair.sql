-- ============================================================================
-- ClassPoint · 0047 · Repair: get_space_people()
-- Run any time. Safe to re-run (idempotent). Independent of 0046.
--
-- WHY THIS FILE EXISTS
--   `get_space_people()` was introduced by RENAMING `list_lounge_classmates()`
--   inside migration 0042 — after 0042 had already been pasted. A database
--   applied before that edit therefore has the OLD function and not the new
--   one, and every client call fails with:
--
--     42883: function public.get_space_people() does not exist
--
--   The visible symptom is the room panel reporting "Nobody else is in here
--   yet" and no `Lv N` chip beside any name in a chat — both read this one
--   roster.
--
--   ── THE LESSON, WHICH IS THE POINT OF THIS FILE ──────────────────────────
--   RENAMING A FUNCTION INSIDE AN APPLIED MIGRATION IS A SILENT BREAKING
--   CHANGE. Re-running the edited file fixes it, but nothing tells you the file
--   changed, and `git log` on a migration is not something anyone checks before
--   a deploy. A rename belongs in a NEW numbered file — this one — or the old
--   name stays behind as a delegate.
--
--   The body below is byte-identical to 0042's. A database that already has the
--   function simply gets it recreated, which costs nothing.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- The old name, if this database still has it. Nothing calls it any more.
drop function if exists public.list_lounge_classmates();

-- Drop-first because the return type may differ from whatever is there.
drop function if exists public.get_space_people();

-- Everyone in Student Space, with the game facts the social surfaces draw
-- beside a name: the XP ring, the level, the rank medal, the section dot, the
-- People panel and @mention resolution all read THIS and nothing else.
--
-- INCLUDES the caller, deliberately: chat renders a level and a rank beside
-- your OWN name too, and `send_message` already ignores a self-mention.
--
-- `rank` comes from the twice-daily snapshot, so it is the same number the
-- leaderboard shows — not a live recount that would quietly disagree with it.
--
-- ⚠ `listStudents` must NEVER be called from the student app: it joins
-- `student_secrets` to merge claim tokens for the instructor's roster, so using
-- it to build a people list would ship every classmate's claim token over the
-- wire. That is what this function exists to make unnecessary.
create function public.get_space_people()
returns table (
  id              uuid,
  display_name    text,
  avatar_url      text,
  semester_points int,
  section_id      uuid,
  rank            int
)
language sql
stable
security definer
set search_path = public
as $$
  select stu.id, stu.display_name, stu.avatar_url,
         stu.semester_points, stu.section_id, snap.rank
    from public.students stu
    join public.sections sec on sec.id = stu.section_id
    left join public.leaderboard_snapshot snap on snap.student_id = stu.id
   where sec.space_enabled
     and sec.semester_id = public.cp_active_semester_id()
     and stu.archived_at is null
     and (public.is_instructor() or public.cp_space_state() = 'open')
   order by stu.display_name;
$$;

grant execute on function public.get_space_people() to authenticated;

-- ============================================================================
-- VERIFY
--
--   1. select * from public.get_space_people();
--      As the INSTRUCTOR: every student in a space-enabled section of the
--      active semester, with display_name, semester_points, section_id, rank.
--      As a STUDENT: the same list while Student Space is open; zero rows when
--      it is paused or locked, which is the gate doing its job.
--
--   2. In the app, open a chat room and the ⋯ / room panel:
--      • "Everyone · N" lists the room, not "Nobody else is in here yet"
--      • every name in the thread carries a "Lv N" chip
--      • typing "@" in the composer opens the mention picker
--
--   3. Re-run this whole file. Nothing errors.
-- ============================================================================
