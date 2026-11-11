-- ============================================================================
-- 0057 · Grades (Prelim / Midterm / Finals, per subject per section)
--
-- WHAT THIS ADDS
--   The instructor's spreadsheet, as data:
--     * grade_policies — the weights, per subject per term. 50/25/25 inside
--                        Class Standing, 60/40 against the Exam, and this
--                        term's share of the final grade (30/30/40). Plus the
--                        transmutation (base 0.6, span 0.4) as COLUMNS, so a
--                        policy change is an edit and not a migration.
--     * grade_items    — one score column: "Quiz 1", max 20. Per SECTION, so a
--                        section that skipped a quiz needs no special case.
--     * grade_scores   — one student's mark on one item. NO ROW MEANS NOT YET
--                        MARKED; a real zero is stored as 0.
--
-- ⚠ THERE IS DELIBERATELY NO WEIGHTING ARITHMETIC IN THIS FILE.
--   SQL's whole job is sum(score) and sum(max_score) — numbers that cannot
--   drift. Every weight, the transmutation and all rounding live in exactly one
--   place, src/lib/grading.ts. That is the OPPOSITE of peer-scale.ts /
--   lounge-answers.ts, which mirror SQL because the server ACTS on their value
--   (it pays points, it validates a rating). Nothing server-side ever acts on a
--   grade: no RLS branch reads one, no trigger, no notification. A mirror here
--   would be a second definition with nothing requiring it — the pattern that
--   grew five copies of the show-up rate and four of the points row.
--   If you are about to add a weighting expression below, stop.
--
-- POINTS ARE NEVER TURNED INTO A GRADE
--   Nothing here references point_events, in any direction. That is structural,
--   like Peer Evaluation, not a convention to be remembered. Points reach a
--   grade only through an individually-approved redemption, decided by hand.
--
-- NOT HERE, ON PURPOSE
--   No student-facing read: all three tables are instructor-only in RLS, with
--   no student branch at all. No audit_log rows, so audit_log_action_check is
--   untouched. No realtime.
--
-- OWNERSHIP MOVES
--   cp_nightly_backup  0052 → 0057. Body carried forward verbatim; the `tables`
--     array gains the three grade tables AND 0055's event_sessions /
--     event_attendance, which were never added. Two behaviours change, and both
--     exist because decision 13 (no audit log) makes this mirror the ONLY
--     history a grade has:
--       · grade tables keep 365 daily snapshots, not 14.
--       · on schema drift their mirror is PARKED under a dated name instead of
--         dropped, so migration 0058 adding one column cannot silently destroy
--         every grade snapshot.
--     0052 must not be edited.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run. Run after 0056. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

-- Weights, per subject per term.
--
-- Each weight is a PROPORTION (0.5000, never 50). Only per-row CHECKs are
-- possible here: "pt + quiz + recit = 1" is a row rule and is checked, but "the
-- three terms' final_weight sums to 1" is CROSS-ROW. A deferred constraint
-- trigger would make inserting the FIRST term's row fail (0.30 is not 1), which
-- breaks every row-by-row seed below — so that one is validated in
-- grading.ts (subjectPolicyError) and surfaces as a message on the weights
-- screen instead.
create table if not exists public.grade_policies (
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  term           text not null check (term in ('prelim','midterm','finals')),

  -- Class Standing split.
  pt_weight      numeric(5,4) not null default 0.5000 check (pt_weight    between 0 and 1),
  quiz_weight    numeric(5,4) not null default 0.2500 check (quiz_weight  between 0 and 1),
  recit_weight   numeric(5,4) not null default 0.2500 check (recit_weight between 0 and 1),
  constraint grade_policies_cs_split_check
    check (pt_weight + quiz_weight + recit_weight = 1),

  -- Term split (the "60-40" column header on the instructor's sheet).
  cs_weight      numeric(5,4) not null default 0.6000 check (cs_weight   between 0 and 1),
  exam_weight    numeric(5,4) not null default 0.4000 check (exam_weight between 0 and 1),
  constraint grade_policies_term_split_check
    check (cs_weight + exam_weight = 1),

  -- THIS term's share of the final computed grade. The row's own share, never a
  -- stored triple — "30/30/40" reads like a tuple and invites one.
  final_weight   numeric(5,4) not null check (final_weight between 0 and 1),

  -- (raw/total * span + base) * 100. Base 0.6 gives the 60.00 floor the
  -- instructor's sheet already has.
  transmute_base numeric(5,4) not null default 0.6000 check (transmute_base between 0 and 1),
  transmute_span numeric(5,4) not null default 0.4000 check (transmute_span > 0 and transmute_span <= 1),

  updated_at     timestamptz not null default now(),
  primary key (subject_id, term)
);

-- One score column. Scoped to a SECTION: two sections taking the same subject
-- keep their own items, which is what the one-sheet-per-section workflow means
-- and what makes "2A skipped that quiz" ordinary rather than a special case.
--
-- No semester_id: section and subject have both been semester-scoped since
-- 0027, and a second copy of that fact is a second thing that can drift.
create table if not exists public.grade_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.sections(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  term        text not null check (term in ('prelim','midterm','finals')),
  component   text not null check (component in ('performance_task','quiz','recitation','exam')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  -- numeric, never float: the sheet already carries 48.25 and 35.58, and the
  -- app must reproduce hand-checked values exactly.
  max_score   numeric(6,2) not null check (max_score > 0),
  position    integer not null default 0,
  -- Soft delete. An archived item leaves the denominator (so archiving rescales
  -- the class, which the UI gates behind a confirm) but keeps its scores.
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- PARTIAL, so retiring "Quiz 2" and creating a new one still works. Without it
-- two identical columns give you an unmatchable re-import, two identical export
-- headers, and no way to tell which one you are typing into.
create unique index if not exists grade_items_unique_name_idx
  on public.grade_items (section_id, subject_id, term, component, lower(btrim(name)))
  where archived_at is null;

create index if not exists grade_items_scope_idx
  on public.grade_items (section_id, subject_id, term);

-- One mark. The ABSENCE of a row is meaningful: it means "not marked yet", and
-- is what lets the app show an honest in-progress figure beside the official
-- blanks-count-as-zero one. A student who sat the quiz and scored nothing gets
-- a row with score 0.
create table if not exists public.grade_scores (
  item_id    uuid not null references public.grade_items(id) on delete cascade,
  student_id uuid not null references public.students(id)    on delete cascade,
  score      numeric(6,2) not null check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, student_id)
);

create index if not exists grade_scores_student_idx on public.grade_scores (student_id);

-- ----------------------------------------------------------------------------
-- 2. Guard: a score belongs to a student in the item's own section
--
--     grade_scores(item_id, student_id) cannot express "same section" as a
--     constraint, and the thing it protects against is real: a mis-matched
--     import attaching a grade to a student in another section is the worst
--     outcome this feature can produce.
--
--     The `exists` escape matters. A student who moves section mid-semester
--     keeps the grades they earned here, so correcting one of those marks later
--     must still work — an upsert fires this trigger on its INSERT path even
--     when the row already exists. So: a NEW pair must match sections; an
--     existing pair is already proven legitimate.
-- ----------------------------------------------------------------------------
create or replace function public.cp_grade_score_section_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_section    uuid;
  v_student_section uuid;
begin
  select gi.section_id into v_item_section
    from public.grade_items gi where gi.id = NEW.item_id;
  if v_item_section is null then
    raise exception 'That score column no longer exists.';
  end if;

  select s.section_id into v_student_section
    from public.students s where s.id = NEW.student_id;

  if v_student_section is distinct from v_item_section
     and not exists (
       select 1 from public.grade_scores gs
        where gs.item_id = NEW.item_id and gs.student_id = NEW.student_id
     )
  then
    raise exception 'That student is not in this section.';
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_grade_score_section on public.grade_scores;
create trigger trg_grade_score_section
  before insert or update on public.grade_scores
  for each row execute function public.cp_grade_score_section_guard();

-- ----------------------------------------------------------------------------
-- 3. RLS — instructor only, with NO student branch at all
--
--     Grades have no student-facing surface by decision, so there is deliberately
--     no "own rows" policy to widen later by accident. If a student view is ever
--     built it gets its own aggregating RPC, the way released peer results do.
-- ----------------------------------------------------------------------------
alter table public.grade_policies enable row level security;
alter table public.grade_items    enable row level security;
alter table public.grade_scores   enable row level security;

drop policy if exists grade_policies_all on public.grade_policies;
create policy grade_policies_all on public.grade_policies
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

drop policy if exists grade_items_all on public.grade_items;
create policy grade_items_all on public.grade_items
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

drop policy if exists grade_scores_all on public.grade_scores;
create policy grade_scores_all on public.grade_scores
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

grant select, insert, update, delete on public.grade_policies to authenticated;
grant select, insert, update, delete on public.grade_items    to authenticated;
grant select, insert, update, delete on public.grade_scores   to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Every subject gets all three policy rows
--
--     A MISSING ROW IS AMBIGUOUS — it could mean "components unset" or "term
--     share unset" — and defaulting the share to 0 would silently compute a
--     final grade out of 70%. So a subject is gradeable only once all three
--     rows exist (grading.ts refuses otherwise and names the missing term), and
--     nothing in the app has to cope with a half-configured subject.
-- ----------------------------------------------------------------------------
insert into public.grade_policies (subject_id, term, final_weight)
select s.id, t.term, t.w
  from public.subjects s
  cross join (values ('prelim', 0.3000), ('midterm', 0.3000), ('finals', 0.4000)) as t(term, w)
on conflict (subject_id, term) do nothing;

-- …and keeps getting them, including after a rollover creates next semester's
-- subjects. Weights are COPIED from the most recent subject sharing this code,
-- so a rollover does not hand the instructor three blank weight forms and a
-- screen full of dashes.
create or replace function public.cp_seed_grade_policies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.grade_policies (
    subject_id, term,
    pt_weight, quiz_weight, recit_weight, cs_weight, exam_weight, final_weight,
    transmute_base, transmute_span
  )
  select NEW.id, t.term,
         coalesce(p.pt_weight,      0.5000),
         coalesce(p.quiz_weight,    0.2500),
         coalesce(p.recit_weight,   0.2500),
         coalesce(p.cs_weight,      0.6000),
         coalesce(p.exam_weight,    0.4000),
         coalesce(p.final_weight,   t.w),
         coalesce(p.transmute_base, 0.6000),
         coalesce(p.transmute_span, 0.4000)
    from (values ('prelim', 0.3000), ('midterm', 0.3000), ('finals', 0.4000)) as t(term, w)
    left join lateral (
      select gp.*
        from public.grade_policies gp
        join public.subjects  s2  on s2.id  = gp.subject_id
        join public.semesters sem on sem.id = s2.semester_id
       where lower(btrim(s2.code)) = lower(btrim(NEW.code))
         and s2.id <> NEW.id
         and gp.term = t.term
       order by sem.starts_on desc
       limit 1
    ) p on true
  on conflict (subject_id, term) do nothing;

  return NEW;
end;
$$;

drop trigger if exists trg_seed_grade_policies on public.subjects;
create trigger trg_seed_grade_policies
  after insert on public.subjects
  for each row execute function public.cp_seed_grade_policies();

-- ----------------------------------------------------------------------------
-- 5. The one read RPC: raw sums, never a grade
--
--     Returns ONE ROW PER (student, term) carrying twelve numbers. The row
--     shape is load-bearing: per (student, term, component) across a whole
--     subject is 208 × 3 × 4 = 2,496 rows, past PostgREST's silent 1000-row
--     cap (the 0031 lesson). Per (student, term) is ~624 for the whole subject
--     and ~120 for one section — and the client pages it anyway.
--
--     Three totals per component, because two of them answer different
--     questions:
--       *_score  — this student's entered marks.
--       *_max    — max_score over EVERY non-archived item. Dividing by this is
--                  the official grade: an unmarked item counts as a zero, which
--                  is what the spreadsheet does.
--       *_marked — max_score over only the items this student has a score for.
--                  Dividing by this is the honest in-progress figure.
--
--     ⚠ `archived_at is null` is the one filter that must match grading.ts's
--     sumsFromScores exactly. It is the only remaining way server and client
--     can disagree about a grade.
-- ----------------------------------------------------------------------------
drop function if exists public.get_section_grade_sums(uuid, uuid, text);
create function public.get_section_grade_sums(
  p_section_id uuid,
  p_subject_id uuid,
  p_term       text default null
)
returns table (
  student_id   uuid,
  full_name    text,
  term         text,
  pt_score     numeric, pt_max     numeric, pt_marked     numeric,
  quiz_score   numeric, quiz_max   numeric, quiz_marked   numeric,
  recit_score  numeric, recit_max  numeric, recit_marked  numeric,
  exam_score   numeric, exam_max   numeric, exam_marked   numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read grades.';
  end if;

  return query
  with roster as (
    -- Active students in the section, PLUS anyone who already has a score
    -- against this section's items. The second half is not decoration: items
    -- are keyed to a section, so a student moved mid-semester would otherwise
    -- vanish from the grid that holds the marks they actually earned, with
    -- nothing on screen saying so. Same rule getSectionRegister follows.
    select s.id, s.full_name
      from public.students s
     where s.section_id = p_section_id
       and s.archived_at is null
    union
    select s.id, s.full_name
      from public.students s
     where exists (
       select 1
         from public.grade_scores gs
         join public.grade_items  gi on gi.id = gs.item_id
        where gs.student_id = s.id
          and gi.section_id = p_section_id
          and gi.subject_id = p_subject_id
     )
  ),
  wanted_terms as (
    select t.term::text as term
      from (values ('prelim'), ('midterm'), ('finals')) as t(term)
     where p_term is null or t.term::text = p_term
  ),
  cells as (
    select gi.term, gi.component, r.id as sid, gi.max_score, gs.score
      from roster r
      cross join public.grade_items gi
      left join public.grade_scores gs
             on gs.item_id = gi.id and gs.student_id = r.id
     where gi.section_id  = p_section_id
       and gi.subject_id  = p_subject_id
       and gi.archived_at is null
       and (p_term is null or gi.term = p_term)
  )
  select r.id,
         r.full_name,
         wt.term::text,
         coalesce(sum(c.score)     filter (where c.component = 'performance_task'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'performance_task'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'performance_task'
                                             and c.score is not null), 0),
         coalesce(sum(c.score)     filter (where c.component = 'quiz'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'quiz'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'quiz'
                                             and c.score is not null), 0),
         coalesce(sum(c.score)     filter (where c.component = 'recitation'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'recitation'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'recitation'
                                             and c.score is not null), 0),
         coalesce(sum(c.score)     filter (where c.component = 'exam'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'exam'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'exam'
                                             and c.score is not null), 0)
    from roster r
    cross join wanted_terms wt
    left join cells c on c.sid = r.id and c.term = wt.term
   group by r.id, r.full_name, wt.term
   order by r.full_name, wt.term;
end;
$$;

grant execute on function public.get_section_grade_sums(uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Ownership move: cp_nightly_backup 0052 → 0057
--
--     Body carried forward verbatim. Three changes, all deliberate:
--
--     (a) The three grade tables join the mirror — and so do 0055's
--         event_sessions / event_attendance, which were never added. The points
--         an event awarded survive via point_events; the record of who actually
--         checked in did not survive at all.
--
--     (b) GRADE TABLES KEEP 365 SNAPSHOTS, NOT 14. Grades write no audit_log
--         rows (decision 13), so this mirror is the only history they have, and
--         a grade questioned after the semester ends is exactly the case 14 days
--         cannot answer.
--
--     (c) ON SCHEMA DRIFT, A GRADE MIRROR IS PARKED, NOT DROPPED. The generic
--         handler recreates the mirror from scratch, explicitly sacrificing old
--         snapshots for a working backup — fine when an audit log exists, a
--         data-loss event when this is the only record. So migration 0058
--         adding one column to grade_scores renames the old mirror aside with a
--         dated name and leaves it for a human, instead of deleting it.
-- ----------------------------------------------------------------------------
create or replace function public.cp_nightly_backup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t      text;
  tables constant text[] := array[
    'students', 'point_events', 'attendance_records', 'class_sessions',
    'sections', 'point_redemptions', 'student_achievements', 'student_secrets',
    'semesters', 'semester_terms', 'subjects', 'section_subjects',
    'reward_catalog_items',
    'peer_groups', 'peer_group_members',
    'peer_evaluations', 'peer_evaluation_sections', 'peer_criteria',
    'peer_submissions', 'peer_ratings', 'peer_comments',
    'peer_evaluation_groups',
    'event_sessions', 'event_attendance',
    'grade_policies', 'grade_items', 'grade_scores'
  ];
  -- The tables whose history is the ONLY history (see (b) and (c) above).
  kept   constant text[] := array['grade_policies', 'grade_items', 'grade_scores'];
begin
  foreach t in array tables loop
    begin
      -- Idempotent per day: re-running replaces today's snapshot.
      execute format('delete from backup.%I where snapshot_date = current_date', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    exception when others then
      -- Schema drift (or a brand-new table): rebuild the mirror and retry once.
      if t = any (kept) then
        -- Park the old mirror under a dated name rather than destroying it.
        -- Recoverable by hand; costs disk, which is the cheap half of the trade.
        execute format(
          'alter table if exists backup.%I rename to %I',
          t, t || '_pre_' || to_char(current_date, 'YYYYMMDD'));
      else
        -- Old snapshots for this one table are sacrificed for a working backup
        -- going forward — the other tables' history is untouched.
        execute format('drop table if exists backup.%I', t);
      end if;
      execute format('create table backup.%I (snapshot_date date not null, like public.%I)', t, t);
      execute format('create index on backup.%I (snapshot_date)', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    end;
  end loop;

  -- Retention: 14 daily snapshots, a full year for grades and the audit trail.
  foreach t in array tables loop
    if t = any (kept) then
      execute format('delete from backup.%I where snapshot_date < current_date - 365', t);
    else
      execute format('delete from backup.%I where snapshot_date < current_date - 14', t);
    end if;
  end loop;
  delete from public.audit_log where at < now() - interval '365 days';
end;
$$;

revoke execute on function public.cp_nightly_backup() from public, anon, authenticated;

-- ============================================================================
-- Verify (run the whole file twice — every statement is idempotent):
--
--   1. Every subject has exactly three policy rows, summing to 1:
--        select s.code, count(*) as rows, sum(gp.final_weight) as final_share
--          from public.subjects s
--          join public.grade_policies gp on gp.subject_id = s.id
--         group by s.code;                      -- rows = 3, final_share = 1.0000
--
--   2. The seed trigger fires on a NEW subject, copying an existing code:
--        insert into public.subjects (semester_id, code, name)
--        values ('<semester>', 'IT 32', 'Platform Technologies (test)');
--        select term, pt_weight, final_weight from public.grade_policies
--         where subject_id = (select id from public.subjects
--                              where name like '%(test)%');   -- three rows
--        delete from public.subjects where name like '%(test)%';
--
--   3. THE ONE THAT MATTERS — a score cannot be attached across sections:
--        -- as the instructor, with an item in section A and a student in B:
--        insert into public.grade_scores (item_id, student_id, score)
--        values ('<item in A>', '<student in B>', 10);
--        -- ERROR:  That student is not in this section.
--
--   4. A student is NOT read as a student:
--        -- signed in as any student:
--        select * from public.grade_items;                  -- 0 rows
--        select * from public.get_section_grade_sums('<section>','<subject>');
--        -- ERROR:  Only the instructor can read grades.
--
--   5. Sums match what the grid computes. With one 20-mark quiz scored 20 and a
--      second 20-mark quiz unmarked:
--        select quiz_score, quiz_max, quiz_marked
--          from public.get_section_grade_sums('<section>','<subject>','finals');
--        -- 20 | 40 | 20   (official divides by 40, "so far" by 20)
--
--   6. Archiving an item removes it from BOTH denominators:
--        update public.grade_items set archived_at = now() where id = '<item>';
--        -- quiz_max drops by that item's max_score.
--
--   7. Duplicate column names are refused while live, allowed after retiring:
--        -- two live "Quiz 2" in one section/subject/term/component → unique
--        -- violation; archive the first and it inserts.
--
--   8. The backup covers everything, including the tables 0055 never added:
--        select pg_get_functiondef('public.cp_nightly_backup'::regproc)
--          like '%event_attendance%';            -- t
--        select pg_get_functiondef('public.cp_nightly_backup'::regproc)
--          like '%grade_scores%';                -- t
--        select public.cp_nightly_backup();
--        select table_name from information_schema.tables
--         where table_schema = 'backup' order by table_name;   -- 27 mirrors
--
--   9. Exactly ONE of each new function (no accidental overload):
--        select proname, count(*) from pg_proc
--         where proname in ('get_section_grade_sums','cp_seed_grade_policies',
--                           'cp_grade_score_section_guard')
--         group by proname;                      -- all 1
-- ============================================================================
