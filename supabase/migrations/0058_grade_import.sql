-- ============================================================================
-- 0058 · Importing a term from the instructor's spreadsheet
--
-- WHAT THIS ADDS
--   One function, import_grade_term(), which creates the score columns and
--   writes every mark IN ONE TRANSACTION.
--
-- WHY IT IS A FUNCTION AND NOT A HANDFUL OF CLIENT CALLS
--   An import is four column inserts and ~160 marks. Done from the client that
--   is five round trips with no transaction around them, so a dropped
--   connection at the wrong moment leaves two components imported and two not
--   — real columns, real marks, and no way to tell from the screen which half
--   is missing. Here the whole thing commits or none of it does, and a refusal
--   can truthfully say nothing was changed. Same reason
--   apply_peer_group_plan (0054) is one call.
--
-- IMPORTED TERMS STORE ONE COLUMN PER COMPONENT
--   The source sheet records a single total per component ("Performance Tasks,
--   out of 50") and never a maximum per quiz, so per-item detail cannot be
--   recovered without inventing it. The import therefore creates ONE column per
--   component holding each student's row total, and a re-import of a corrected
--   file finds the same column by name and overwrites it rather than stacking
--   a second one beside it.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   It never creates a student. A name in the sheet with nobody to match is
--   the client's problem to surface, and inventing a roster row from a
--   spreadsheet cell is how a typo becomes a person.
--
-- NOT TOUCHED
--   cp_nightly_backup (0057 owns it; the grade tables are already in it),
--   audit_log_action_check (grades write no audit rows), and every policy.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run. Run after 0057. Safe to re-run.
-- ============================================================================

drop function if exists public.import_grade_term(uuid, uuid, text, jsonb, jsonb);
create function public.import_grade_term(
  p_section_id uuid,
  p_subject_id uuid,
  p_term       text,
  -- [{ "component": "quiz", "name": "Quizzes (imported)", "max_score": 100 }, …]
  p_components jsonb,
  -- [{ "component": "quiz", "student_id": "…", "score": 97 }, …]
  p_scores     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry       jsonb;
  v_component   text;
  v_name        text;
  v_max         numeric;
  v_item_id     uuid;
  v_item_ids    jsonb := '{}'::jsonb;
  v_created     integer := 0;
  v_written     integer := 0;
  v_overwritten integer := 0;
  v_student     uuid;
  v_score       numeric;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can import grades.';
  end if;

  if p_term is null or p_term not in ('prelim', 'midterm', 'finals') then
    raise exception 'Unknown term.';
  end if;

  if not exists (
    select 1 from public.sections s where s.id = p_section_id
  ) then
    raise exception 'That section no longer exists.';
  end if;

  if jsonb_typeof(p_components) <> 'array' or jsonb_array_length(p_components) = 0 then
    raise exception 'Nothing to import — no columns were mapped.';
  end if;

  -- ------------------------------------------------------------------------
  -- 1. The columns. Found by name so a re-import updates rather than stacks.
  -- ------------------------------------------------------------------------
  for v_entry in select * from jsonb_array_elements(p_components) loop
    v_component := v_entry ->> 'component';
    v_name      := btrim(coalesce(v_entry ->> 'name', ''));
    v_max       := nullif(v_entry ->> 'max_score', '')::numeric;

    if v_component is null
       or v_component not in ('performance_task', 'quiz', 'recitation', 'exam') then
      raise exception 'Unknown component "%".', coalesce(v_component, '');
    end if;
    if v_name = '' then
      raise exception 'Every imported column needs a name.';
    end if;
    -- A wrong maximum rescales the whole class, so it is checked here as well
    -- as on the screen that typed it.
    if v_max is null or v_max <= 0 then
      raise exception 'Every imported column needs a maximum above 0.';
    end if;
    if v_item_ids ? v_component then
      raise exception 'Two columns were mapped to %.', v_component;
    end if;

    select gi.id into v_item_id
      from public.grade_items gi
     where gi.section_id = p_section_id
       and gi.subject_id = p_subject_id
       and gi.term       = p_term
       and gi.component  = v_component
       and lower(btrim(gi.name)) = lower(v_name)
       and gi.archived_at is null;

    if v_item_id is null then
      insert into public.grade_items (section_id, subject_id, term, component, name, max_score)
      values (p_section_id, p_subject_id, p_term, v_component, v_name, v_max)
      returning id into v_item_id;
      v_created := v_created + 1;
    else
      update public.grade_items set max_score = v_max where id = v_item_id;
    end if;

    v_item_ids := jsonb_set(v_item_ids, array[v_component], to_jsonb(v_item_id));
  end loop;

  -- ------------------------------------------------------------------------
  -- 2. The marks.
  --
  --    The section guard on grade_scores (0057) still fires on every row, so a
  --    mis-matched name pointing at a student in another section aborts the
  --    WHOLE import rather than quietly attaching one mark to a stranger.
  -- ------------------------------------------------------------------------
  if jsonb_typeof(p_scores) = 'array' then
    for v_entry in select * from jsonb_array_elements(p_scores) loop
      v_component := v_entry ->> 'component';
      v_student   := nullif(v_entry ->> 'student_id', '')::uuid;
      v_score     := nullif(v_entry ->> 'score', '')::numeric;

      v_item_id := nullif(v_item_ids ->> v_component, '')::uuid;
      if v_item_id is null then
        raise exception 'A mark was sent for "%" with no column mapped.', coalesce(v_component, '');
      end if;
      if v_student is null then
        raise exception 'A mark was sent with no student.';
      end if;
      -- Null is "not marked" and must simply not be sent; 0 is a real mark.
      if v_score is null or v_score < 0 then
        raise exception 'A mark must be 0 or more.';
      end if;

      if exists (
        select 1 from public.grade_scores gs
         where gs.item_id = v_item_id and gs.student_id = v_student
      ) then
        v_overwritten := v_overwritten + 1;
      end if;

      insert into public.grade_scores (item_id, student_id, score)
      values (v_item_id, v_student, v_score)
      on conflict (item_id, student_id) do update set score = excluded.score;

      v_written := v_written + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'items_created', v_created,
    'scores_written', v_written,
    'scores_overwritten', v_overwritten
  );
end;
$$;

grant execute on function public.import_grade_term(uuid, uuid, text, jsonb, jsonb) to authenticated;

-- ============================================================================
-- Verify (run the whole file twice — every statement is idempotent):
--
--   1. A clean import creates the columns and the marks:
--        select public.import_grade_term(
--          '<section>', '<subject>', 'finals',
--          '[{"component":"quiz","name":"Quizzes (imported)","max_score":100}]'::jsonb,
--          format('[{"component":"quiz","student_id":"%s","score":97}]', '<student>')::jsonb);
--        -- {"items_created": 1, "scores_written": 1, "scores_overwritten": 0}
--
--   2. RE-IMPORTING THE SAME FILE REUSES THE COLUMN — it does not stack a
--      second one beside it, and it reports what it replaced:
--        -- run exactly the same call again:
--        -- {"items_created": 0, "scores_written": 1, "scores_overwritten": 1}
--        select count(*) from public.grade_items
--         where section_id = '<section>' and term = 'finals'
--           and component = 'quiz' and archived_at is null;   -- still 1
--
--   3. THE ONE THAT MATTERS — nothing lands when any row is bad. With a VALID
--      first mark and a student from ANOTHER section second:
--        -- ERROR:  That student is not in this section.
--        select count(*) from public.grade_scores gs
--          join public.grade_items gi on gi.id = gs.item_id
--         where gi.section_id = '<section>' and gi.term = 'finals';
--      The count is unchanged: the valid row rolled back with the bad one.
--
--   4. Refusals, each leaving nothing behind:
--        -- max_score 0            → 'needs a maximum above 0'
--        -- component 'homework'   → 'Unknown component'
--        -- two quiz columns       → 'Two columns were mapped to quiz'
--        -- empty p_components     → 'no columns were mapped'
--
--   5. A student cannot call it at all:
--        -- signed in as any student:
--        select public.import_grade_term('<section>','<subject>','finals','[]'::jsonb,'[]'::jsonb);
--        -- ERROR:  Only the instructor can import grades.
-- ============================================================================
