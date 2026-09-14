-- ============================================================================
-- ClassPoint · 0053 · Hard-delete a peer evaluation
-- Run after 0052. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   One function, `delete_peer_evaluation`, that removes an evaluation and
--   everything under it: sections, picked groups, criteria, submissions,
--   ratings, comments, and the notifications it sent. Every one of those tables
--   already cascades from `peer_evaluations`, so the removal itself is a single
--   DELETE. Everything else in this file is the validation around it.
--
--   No new tables, no ownership moves, no constraint widening: the
--   `audit_log_action_check` has accepted 'hard_delete' since 0023.
--
-- ── WHAT CAN BE DELETED (the instructor's call, 2026-09-14) ─────────────────
--   CLOSED and NOT RELEASED, and nothing else.
--     • Open → refused. Deleting an evaluation someone has half-filled would
--       pull the form out from under them mid-sentence.
--     • Released → refused, permanently. Students have already read that
--       feedback; deleting it would make something they saw vanish, with the
--       notification that pointed at it now pointing at nothing.
--   A released evaluation therefore can never be deleted. That trade was
--   stated when the rule was chosen.
--
-- ── THE TYPED TITLE IS CHECKED HERE, NOT ONLY ON THE BUTTON ─────────────────
--   The client's ConfirmDialog will not enable Delete until the title is typed.
--   That is a speed bump for a person; it is nothing to a direct RPC call or a
--   stale tab. So the function takes what was TYPED and compares it itself,
--   using the dialog's exact rule (trimmed, case-insensitive) so the two can
--   never disagree about whether a match happened.
--
--   The stale tab is the case this actually catches: rename the evaluation in
--   one tab, then confirm a delete in another that still shows the old title,
--   and the server refuses instead of deleting something you did not name.
--
-- ── EVERY CHECK RUNS AFTER THE ROW LOCK ─────────────────────────────────────
--   `release_peer_results` also takes `for update` on the evaluation. Reading
--   status and release state BEFORE locking would let a release commit in the
--   gap and the delete then destroy feedback students had just been sent. In
--   READ COMMITTED a `select … for update` that waited re-reads the row, so
--   the checks below see whatever the other transaction committed.
--
-- ── A FULL SNAPSHOT SURVIVES (the instructor's call) ────────────────────────
--   The audit row carries everything: the evaluation, its subject, sections,
--   picked groups, criteria with their scales, every submission, every rating
--   and every comment WITH its author. `cp_nightly_backup` prunes audit rows
--   after 365 days, so it is recoverable by hand for a year.
--
--   RATINGS ARE STORED AS INDEXED TUPLES, and the reason is the Ops screen:
--   `listAuditLog` downloads `row_data` for every row it lists. A section-wide
--   evaluation of 40 students with 4 criteria is 6,240 ratings; as objects
--   carrying three UUIDs each that is roughly 800 KB in one row, fetched on
--   every Ops open. As `[evaluator, ratee, criterion, score]` indexes into the
--   `people` and `criteria` arrays beside them it is closer to 100 KB, and
--   still fully recoverable — the arrays map every index back to its UUID.
--   Comments stay objects: there are at most one per rater per peer, and a
--   comment is exactly the thing someone will want to read back.
--
--   The audit row is written BEFORE the delete, in the same transaction. If the
--   delete fails the audit row rolls back with it, so the log never records a
--   deletion that did not happen.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

drop function if exists public.delete_peer_evaluation(uuid, text);
create function public.delete_peer_evaluation(p_eval uuid, p_confirm_title text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval       public.peer_evaluations;
  v_snapshot   jsonb;
  v_subs       integer;
  v_ratings    integer;
  v_comments   integer;
  v_notified   integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can delete an evaluation.';
  end if;

  -- Lock FIRST, then validate. See the header.
  select * into v_eval
    from public.peer_evaluations
   where id = p_eval
     for update;

  if v_eval.id is null then
    raise exception 'That evaluation does not exist.';
  end if;

  if v_eval.status <> 'closed' then
    raise exception 'Close the evaluation before deleting it.';
  end if;

  if v_eval.results_released_at is not null then
    raise exception
      'Results have been released to students, so this evaluation can no longer be deleted.';
  end if;

  -- The dialog's exact rule: trimmed and case-insensitive. Stricter here would
  -- refuse a match the screen had just accepted; looser would accept one it had
  -- refused.
  if p_confirm_title is null
     or length(btrim(p_confirm_title)) = 0
     or lower(btrim(p_confirm_title)) <> lower(btrim(v_eval.title)) then
    raise exception 'The title you typed does not match. Nothing was deleted.';
  end if;

  select count(*)::integer into v_subs
    from public.peer_submissions where evaluation_id = p_eval;
  select count(*)::integer into v_ratings
    from public.peer_ratings where evaluation_id = p_eval;
  select count(*)::integer into v_comments
    from public.peer_comments where evaluation_id = p_eval;

  -- ── The snapshot ───────────────────────────────────────────────────────
  with ppl as (
    -- Everyone who appears as a rater or as the subject of a rating or
    -- comment. Ratings index into this list.
    select u.sid,
           s.full_name,
           s.display_name,
           (row_number() over (order by u.sid) - 1)::integer as ix
      from (
        select sm.evaluator_id as sid from public.peer_submissions sm where sm.evaluation_id = p_eval
        union
        select r.ratee_id from public.peer_ratings r where r.evaluation_id = p_eval
        union
        select pc.ratee_id from public.peer_comments pc where pc.evaluation_id = p_eval
      ) u
      left join public.students s on s.id = u.sid
  ),
  crit as (
    select c.id as cid,
           c.label as clabel,
           c.scale as cscale,
           (row_number() over (order by c.sort_order, c.created_at, c.id) - 1)::integer as ix
      from public.peer_criteria c
     where c.evaluation_id = p_eval
  )
  select jsonb_build_object(
    'version',     1,
    'evaluation',  to_jsonb(v_eval),
    'subject',     (select jsonb_build_object('id', sub.id, 'code', sub.code, 'name', sub.name)
                      from public.subjects sub where sub.id = v_eval.subject_id),
    'sections',    coalesce((
                     select jsonb_agg(jsonb_build_object('id', sec.id, 'name', sec.name) order by sec.name)
                       from public.peer_evaluation_sections t
                       join public.sections sec on sec.id = t.section_id
                      where t.evaluation_id = p_eval
                   ), '[]'::jsonb),
    -- Empty means "all groups in those sections" (0052's rule), not "none".
    'groups',      coalesce((
                     select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name)
                       from public.peer_evaluation_groups pg
                       join public.peer_groups g on g.id = pg.group_id
                      where pg.evaluation_id = p_eval
                   ), '[]'::jsonb),
    'criteria',    coalesce((
                     select jsonb_agg(jsonb_build_object('id', cr.cid, 'label', cr.clabel, 'scale', cr.cscale)
                                      order by cr.ix)
                       from crit cr
                   ), '[]'::jsonb),
    'people',      coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'id', p.sid, 'fullName', p.full_name, 'displayName', p.display_name
                            ) order by p.ix)
                       from ppl p
                   ), '[]'::jsonb),
    'submissions', coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'id',          sm.id,
                              'evaluator',   pe.ix,
                              'sectionId',   sm.section_id,
                              'groupId',     sm.group_id,
                              'submittedAt', sm.submitted_at
                            ) order by sm.submitted_at)
                       from public.peer_submissions sm
                       join ppl pe on pe.sid = sm.evaluator_id
                      where sm.evaluation_id = p_eval
                   ), '[]'::jsonb),
    -- Tuples, not objects — see the header for why. The format key makes the
    -- row self-describing, so nobody has to find this file to read it back.
    'ratingsFormat', jsonb_build_array('evaluator', 'ratee', 'criterion', 'score'),
    'ratings',     coalesce((
                     select jsonb_agg(jsonb_build_array(pe.ix, pr.ix, cr.ix, r.score)
                                      order by pe.ix, pr.ix, cr.ix)
                       from public.peer_ratings r
                       join ppl  pe on pe.sid = r.evaluator_id
                       join ppl  pr on pr.sid = r.ratee_id
                       join crit cr on cr.cid = r.criterion_id
                      where r.evaluation_id = p_eval
                   ), '[]'::jsonb),
    'comments',    coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'evaluator', pe.ix,
                              'ratee',     pr.ix,
                              'body',      pc.body,
                              'hiddenAt',  pc.hidden_at,
                              'createdAt', pc.created_at
                            ) order by pc.created_at)
                       from public.peer_comments pc
                       join ppl pe on pe.sid = pc.evaluator_id
                       join ppl pr on pr.sid = pc.ratee_id
                      where pc.evaluation_id = p_eval
                   ), '[]'::jsonb)
  ) into v_snapshot;

  -- The notifications it sent would otherwise deep-link to an evaluation that
  -- no longer exists. Released evaluations cannot reach this line, but the
  -- results URL is matched too so the rule does not depend on that.
  delete from public.notifications
   where url in (format('/app/peer/%s', p_eval), format('/app/peer/%s/results', p_eval));
  get diagnostics v_notified = row_count;

  -- BEFORE the delete, same transaction. See the header.
  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
  values (
    auth.uid(), 'hard_delete', 'peer_evaluations', p_eval,
    format('Deleted peer evaluation "%s" (%s submission%s)',
           v_eval.title, v_subs, case when v_subs = 1 then '' else 's' end),
    v_snapshot || jsonb_build_object('counts', jsonb_build_object(
      'submissions',          v_subs,
      'ratings',              v_ratings,
      'comments',             v_comments,
      'notificationsRemoved', v_notified
    ))
  );

  -- Sections, groups, criteria, submissions, ratings and comments all cascade.
  delete from public.peer_evaluations where id = p_eval;

  return v_subs;
end;
$$;

grant execute on function public.delete_peer_evaluation(uuid, text) to authenticated;

-- ============================================================================
-- VERIFY (as the instructor unless a step says otherwise)
--
--   Setup: one evaluation that is CLOSED with a few submissions, one still
--   OPEN, and one closed AND released.
--
--   1. THE RULES, each refused by the database:
--        select public.delete_peer_evaluation('<open id>', '<its title>');
--        -- 'Close the evaluation before deleting it.'
--        select public.delete_peer_evaluation('<released id>', '<its title>');
--        -- 'Results have been released …'
--        select public.delete_peer_evaluation('<closed id>', 'wrong title');
--        -- 'The title you typed does not match. Nothing was deleted.'
--        select public.delete_peer_evaluation('<closed id>', '');
--        -- same message
--      After each, the evaluation is still there.
--
--   2. The typed title matches the dialog's rule — trimmed, any case:
--        select public.delete_peer_evaluation('<closed id>', '  GROUP PROJECT 1  ');
--      Returns the submission count and the evaluation is gone.
--
--   3. EVERYTHING WENT WITH IT:
--        select count(*) from public.peer_criteria    where evaluation_id = '<id>'; -- 0
--        select count(*) from public.peer_submissions where evaluation_id = '<id>'; -- 0
--        select count(*) from public.peer_ratings     where evaluation_id = '<id>'; -- 0
--        select count(*) from public.peer_comments    where evaluation_id = '<id>'; -- 0
--        select count(*) from public.notifications    where url like '/app/peer/<id>%'; -- 0
--
--   4. THE SNAPSHOT IS COMPLETE AND READABLE:
--        select summary, row_data -> 'counts',
--               jsonb_array_length(row_data -> 'ratings'),
--               row_data -> 'ratingsFormat'
--          from public.audit_log
--         where action = 'hard_delete' and table_name = 'peer_evaluations'
--         order by at desc limit 1;
--      The ratings length equals counts.ratings. Pick one tuple and map its
--      indexes through row_data->'people' and row_data->'criteria' — it names a
--      real rater, a real ratee and a real criterion.
--
--   5. As a STUDENT:
--        select public.delete_peer_evaluation('<any id>', '<title>');
--      Raises 'Only the instructor can delete an evaluation.'
--
--   6. A delete that fails leaves NO audit row: run step 1's wrong-title call
--      and confirm no new 'hard_delete' row appeared for that id.
--
--   7. Re-run this whole file. Nothing errors.
-- ============================================================================
