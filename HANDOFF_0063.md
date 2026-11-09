# Handoff — points assist / Absent mark / attendance Recitation (migration 0063)

Work in progress, paused 2026-11-09. Say "continue" and pick up at **Still to do**.

## Decisions (instructor, 2026-11-09)

- **Wording:** "boost" → **"points assist"** in everything a person reads (app + server). Identifiers
  (`request_grade_boost`, `grade_boosts`, `'grade_boost'` audit action, `grade-boost.ts`) keep their names.
  Server wording is changed in 0063 (not applied yet).
- **Opening is automatic by part.** Subject-wide terms per part (Performance Tasks / Quizzes / Exam) in
  `grade_assist_defaults`; every column of that part is open for a student as soon as THEIR mark is in. A column
  can follow the part, carry its own terms (`points_cost/_bonus`), or be switched off (`assist_off`).
  **Fixed marks per part** (not a percent).
- **Absent mark.** A cell can read **A**: typed by hand (`grade_absences`), or derived from attendance when a
  column is tied to a class (`grade_items.session_id`; **absent AND excused** both count). Arithmetically a
  blank (out of "so far", zero in Official). **Blocks a points assist even if a mark is typed** (a 0 for an
  absentee cannot be assisted). Typed A and a mark are mutually exclusive (DB triggers).
- **Recitation = attendance rate, as-is** (97% → 97, no 60 floor; 0% → 0). Subject-scoped, per term, late counts
  as present, excused/irregular leave the denominator. Typed Recitation columns are retired (hidden, rows kept).
  No counted classes yet → reads the 60 floor and does not make a term "started".

## Done (uncommitted work is in the commit "WIP: points assist…")

- `supabase/migrations/0063_points_assist.sql` — built from extracted/patched bodies, diffed, parses clean
  (43 statements, 12 function bodies). **NOT PASTED.** Build script + skeleton are in the old scratchpad only;
  the .sql file is the artifact.
- `grading.ts` (attendance Recitation, `attendanceSums`, `recitationScore`, `sumsFromScores(…, attendance?)`,
  `hasAnyItems`/`completionByTerm` ignore recitation) + tests.
- `types.ts`, `database.types.ts`, `api/grades.ts` (new fetches: `getGradeAbsences`, `saveGradeAbsences`,
  `clearGradeAbsences`, `getGradeAttendance`, `listGradeAssistDefaults`, `saveGradeAssistDefaults`; items
  query falls back one migration at a time and excludes recitation).
- `grade-boost.ts` (`'absent'` state), `student-grades.ts` (attendance into summaries, absent reason).
- `grade-entry.ts` parses `A`; new `grade-cell.ts` (+tests) = the one definition of what a committed cell means.

## Still to do (in order)

1. **Wire the grid** (`GradeGrid.tsx`, `GradeSheet.tsx`, `GradeItemEntry.tsx`): `CellEdit` gets `absent`;
   `onCommit(edit, previous: CellState)`; use `resolveCommit`/`cellDisplay`/`writeFor`; `absencesRef` + snapshot;
   fetch attendance + absences in `load` each in their own catch; flush → `saveGradeAbsences` / `clearGradeAbsences`;
   paste parses with `parseScoreInput`; Recitation visible in So-far when anyone has `counted > 0`; header label
   "Recitation · attendance"; pass `attendance.get(student.id)` to every `sumsFromScores`.
2. **Other `sumsFromScores` callers need attendance:** `export-grades.ts`, `StudentGradeBreakdown.tsx` (record + print).
   Importer: note that Recitation now comes from attendance.
3. **ColumnsPanel:** no Recitation component for new columns; per column "Follow the part / Own terms / Off";
   "Held in class" picker (`listSessions(sectionId)`, filter to the subject) → `session_id`.
4. **Set up → new "Points assist" tab:** per-part cost + marks (`listGradeAssistDefaults` / `saveGradeAssistDefaults`),
   a sentence per part, reach stated (every section taking the subject).
5. **Rename user-facing "boost" → "points assist"** (≈227 hits / 17 files; strings only): StudentGrades, GradeColumns,
   UsePoints, Dashboard GradesCard, Redemptions (inbox, "Boosts applied", Reverse), Ops card, ColumnsPanel, GradeGrid
   tooltips, `boostReason`, PointEventRow, changelog draft, REAL_DEVICE_PASS, CLAUDE.md. Student UI: show the absent state.
6. `applied_state.sql`: add 0063 objects to BLOCK 1/1b and a BLOCK 6 body probe (`decide_point_redemption` no longer
   says "Grade boost"). CLAUDE.md note for 0063; `REAL_DEVICE_PASS.md` additions.
7. `npm run verify` (cap `--max-warnings 95`), probe-route check of the grid at 1440 + 375, then commit.

## Caveats

- Until 0063 is pasted the committed client works but Recitation reads the floor (no attendance counts yet) —
  this is a WIP branch state, do not deploy it on its own.
- Paste order: 0063 after 0062. Run its verify block (foot of the file) twice-paste first.
- Never verified against a database: absent/assist rules, attendance counts, the triggers.
