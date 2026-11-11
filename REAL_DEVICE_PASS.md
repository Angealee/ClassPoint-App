# Real-device pass

Everything below is something that **could not be checked from a code session**: it needs
your instructor login, a real database, a camera, or a phone. Each era so far has ended with
"verified by typecheck, tests, build and probe routes only" — this is the list that turns
that into "verified".

Work top to bottom; later steps assume earlier ones. Tick as you go. If a step does not
behave as written, stop there and tell me the step number and what you saw.

## 0. What you need

- [ ] Your instructor login, on a laptop **and** a phone.
- [ ] Two **scratch students** in a scratch section (call them `Scratch A` and `Scratch B`),
      each with a PIN you know. Do not use real students for anything below.
- [ ] The installed PWA on one phone, ideally an iPhone (iOS is the strictest about sound
      and push), and a second phone if you can (Android).
- [ ] A few real points on `Scratch A` (award ~60) so there is something to spend.

## 1. Database — paste in this order

Open the Supabase SQL editor. Paste each file **whole**, then paste it **a second time**
(the second run must print no error — that is the idempotency test).

Every migration (0001–0064) and both query files have already been run through a real
PostgreSQL parser and are syntactically valid, so a paste will not fail on a typo or a
stray `$`. What the parser **cannot** see is a column or type that only your database knows
about — that is what the verify blocks below catch. (It flags 0025 on one line; that is a
parser limitation and 0025 is long applied.)

1. [ ] Run `supabase/queries/applied_state.sql` **BLOCK 2** and keep the output. It is the
       live `audit_log_action_check`. Every value in it must also appear in 0062 §8
       (18 values). If one is missing, **stop** and tell me — pasting would fail or narrow it.
2. [ ] Run `applied_state.sql` BLOCK 1b. Note which of 0042–0059 say `PARTIAL` or `MISSING`;
       those need pasting first, in numeric order, and CLAUDE.md's old "not applied" list
       is unreliable — trust this.
3. [ ] Paste `0061_active_semester_where.sql` (twice).
4. [ ] Paste `0060_semester_close.sql` (twice).
5. [ ] Paste `0062_grade_boosts.sql` (twice).
       0060 and 0062 can go in **either** order: both now list all 18 audit actions. (They
       did not before — 0060 pasted after 0062 would have silently removed two of them.)
5b. [ ] Paste `0063_points_assist.sql` (twice) AFTER 0062, then `0064_points_assist_automatic.sql` (twice) AFTER 0063 — and run the verify block at the foot of each.
6. [ ] Run `applied_state.sql` BLOCK 6. All four rows must read `true`: 0056, 0061,
       "0062 · decide_point_redemption has the grade branch",
       "0062 · point_events accepts a refund".
7. [ ] Run `applied_state.sql` **BLOCK 7**. It must return **zero rows**. Any row names a
       value the app writes that the live audit constraint would reject.
8. [ ] Run the **verify block at the foot of each file** (they are comments — copy the
       statements). Items 2, 5, 6, 7, 9 and 15 of 0062's are the ones that matter most.

## 2. The semester fix (0061)

- [ ] `/teach/semesters` → create a throwaway semester → **Activate** it.
      Expected: it switches. Before 0061 this failed with "UPDATE requires a WHERE clause".
- [ ] Activate your real semester again afterwards.

## 3. Closing a semester and the archived student (0060)

Do this on a **scratch semester**, never the live one.

- [ ] Semesters → the scratch semester → write a farewell message → **Preview** (the fade).
- [ ] **Close this semester** → type its name to confirm. The count should match the preview.
- [ ] Sign in as an archived scratch student on the phone.
      Expected: the message fades in and out, then a recap and the live board. Nothing else
      reachable, no level-up or "What's new" on top of it.
- [ ] Tap during the first half-second: it must **not** dismiss (the tap guard).
- [ ] Back on the laptop: **Restore into…** a section. The student gets a normal app again
      and can scan a class.

## 4. The first-run tour

- [ ] Create a brand-new scratch student and claim it on the phone.
      Open 1: the tour plays, **no Skip**, Escape does nothing.
- [ ] Close the app fully (swipe it away), open again: tour plays **again**, now with Skip.
- [ ] Third open: plays with Skip. Fourth open: does **not** play.
- [ ] On open 1, you should **not** also get "What's new" stacked behind it.
- [ ] Sign in as an *existing* student: the tour must not appear (by decision).

## 5. Grades and points assist — the big one

Use `Scratch A`. Section needs one subject with weights set.

**Setup (laptop)**
- [ ] `/teach/grades` → **Set up → Columns**: add `Quiz 1` out of 20.
- [ ] Nothing to set up for points (0064): Quiz 1 is open to a student automatically once their
      mark is in — 1 point = 1 mark, they choose how many, never past 20.
- [ ] Enter `Scratch A` = 17 on Quiz 1.
- [ ] Reorder: add `Quiz 2`, edit it, **Move up** → it sits before Quiz 1 in the list *and*
      in the grid.
- [ ] **Set up → Weights**: change a share so the three terms no longer add to 100 → Save is
      blocked with a sentence. Restore, save → "Weights saved."

**Visibility**
- [ ] Phone, as `Scratch A` (with 0065 applied): Grades shows the **scores** ("17 / 20") and each row's
      **use points** link, but **no** term figure, no part scores and no "How is this worked out?" — a card
      says your instructor hasn't opened grades yet. The Home card is absent.
- [ ] Still switched off: use points on a column with a mark (as in section 11). It must work.
- [ ] Laptop: **Ops → Student grades** → turn on → confirm.
      Expected toast: "Students can now see their grades — N notified." (N = students in a
      class that has at least one column.) Turning it off and on again is a *new* opening,
      so another push is expected. The "never pushes twice while already on" guard cannot be
      reached from this screen; it is checked by 0062's verify item 3 (run the function twice
      in SQL — the second result must say `"notified": 0`).
- [ ] Phone: the "Your grades are open" notification arrives, and tapping it opens Grades.
- [ ] Phone: Grades shows 17 / 20, a term figure, **How is this worked out?** lists the
      shares. Home shows the Grades card.

**The trade**
- [ ] Phone: Quiz 1 shows **up to +3 · use points**. Open it and choose **3** points.
      Expected confirm: "3 points … 17 becomes 20 out of 20", plus the rank warning.
- [ ] Send it. Row shows **Waiting**. A second tap on a column already waiting is not possible.
- [ ] Laptop: Requests → Points → the card shows the column and `17 → 20 (+3)`.
- [ ] **Approve.** Check all of: mark is now 20 in the grid, with a gold dot in the cell;
      `Scratch A`'s points dropped by 3; phone shows **+3 from 3 pts** and "was 17";
      a push arrived ("Points assist approved"); the points ledger has a `−3` row.
- [ ] Spend board (Ranks → Spent): `Scratch A` counts 3.

**Undo**
- [ ] Laptop: Requests → **Points assists applied** → Show → **Reverse** on it → confirm.
      Expected: points +3 back, mark returns to 17, dot gone, column requestable again,
      a push ("Points assist reversed"), the ledger shows a `+3 refund` row, and the spend board
      goes back to 0.
- [ ] Do it all again, but this time **retype the mark** (say 19) before reversing.
      Expected: points return, mark stays 19, toast says it was left as typed.
- [ ] Do it a third time, **clear** the mark before approving: approval must refuse with
      "Their mark … was cleared".
- [ ] Do it once more and **Decline**: points stay, column requestable.

**Hidden figures**
- [ ] Phone: nowhere on the Grades screen or Home card is there a number labelled official
      or final.

## 6. Scanning

- [ ] Phone: start a class on the laptop, open Attend → scan. The camera is **centred on
      screen**, not parked by the button. Torch button works (Android).
- [ ] Event scan screen: same framing.
- [ ] Everywhere the app says **"Attendance recorded"** — never "checked in" — on both the
      student and instructor side.

## 7. Leaderboard

- [ ] Podium widths do not change between a short and a long name (compare two refreshes).
- [ ] Section picker sits on its own row, full width.
- [ ] Post a comment: it **rises** in a single column, the counter shows `n/120`, and the
      board underneath stays tappable.
- [ ] After closing a semester and activating a new one: the board shows the **silent board**
      ("still silent"), not a list of zeroes. Award one point and it wakes up.

## 8. Sound

- [ ] iPhone, fresh app launch, tap anything: check the network inspector / data usage —
      `levelup.mp3` must **not** download yet.
- [ ] Trigger a level-up (award enough points). The sound plays. On a slow connection the
      **first** one may be a moment late — that is expected and was accepted.
- [ ] Trigger a second level-up: instant.

## 9. Authenticated screens at phone width

On a phone (or the browser at 320, 360, 390, 414 wide) open each of these and look for
anything cut off, overlapping or sideways-scrolling. This is the sweep that could only be
done on probe routes so far.

- [ ] Student: Home, Ranks, Spend board, Attend, Attendance stats, Grades, Use points,
      Points history, Profile (own and someone else's), Settings, Student Space, a chat room.
- [ ] Instructor: Students, a student record, Attendance (live), History, Grades (grid +
      mobile entry — check the **Term …** line under each name), Requests, Ops, Semesters.

**The Grades redesign and the instructor phone header** (both were verified only on probe
routes, with fixture data):

- [ ] Laptop, `/teach/grades`: the toolbar is **one row** (Section, Subject, term tabs,
      So far / Official, "What do these mean?"); the title does **not** overlap the left rail;
      the grid **fills the width**, edge to edge with the toolbar; the rail shows only the logo, with the theme switch and the four
      buttons stacked at the bottom, none cut off.
- [ ] In **So far**, only computed parts that have marks are columns, the band says
      "Computed · N hidden", and **Official** shows all five.
- [ ] A term grade built from some of the parts shows dimmed with "partial".
- [ ] The footer shows each column's average and "marked n/N", and stays pinned while you
      scroll a long roster; type a mark and the footer updates when you leave the cell.
- [ ] **Phone, instructor login:** the top bar fits, with all four buttons on screen
      (Requests, Peer, Ops, Sign out). Before this fix the right-hand ones were off the edge.

## 10. Things that are **expected**, not bugs

- A term with only a quiz marked reads **low** on the student Grades screen (e.g. 64.50).
  Unmarked parts count at the 60 minimum, and the caption says so. It is your sheet's So-far
  figure, on purpose.
- A refund that lifts a student back over a level threshold can fire the normal level-up
  celebration.
- The Home hero can show a four-digit points figure close to its label at 320px; they do not
  overlap visually.
- The first level-up on a slow connection plays a beat late (section 8).

## When you are done

Tell me which steps failed, with the step number. If everything passed, the next thing worth
doing is opening grades to the real class (**Ops → Student grades**) — after glancing at the
marks once more, because a student who has seen a mark has seen it.

## 11. Use points as the spending hub

- [ ] Student, `/app/grades`: a **Use your points** banner is always under the term figure. It
      says how many columns are open for points assist, or "no column is open for points assist yet".
- [ ] An open row shows **up to +3 · use points ›**. Tapping it opens `/app/points` with **that
      column ringed and in view**; the back arrow returns to Grades.
- [ ] `/app/points` lists open columns as cards first, each with a points picker (`17 → 20 / 20`), with **Not
      available yet (N)** collapsed below and **Something else** (catalog and free-form request)
      underneath.
- [ ] Tap **Use 3 points** → the confirm states the real gain and the rank warning → send → the
      card moves to "Waiting on your instructor" and the banner count drops. This is the first
      time this request path runs from the new screen — do it with a scratch student.
- [ ] With **Ops → Student grades** switched off, `/app/points` STILL lists the columns and lets you
      use points (0065). Only the grade figures are hidden, on Grades and Home.

## 12. Points assist, the Absent mark, Recitation from attendance (0063)

Use `Scratch A` and `Scratch B`. Needs 0063 applied (section 1) and at least two classes of attendance
for the subject in the term, with Scratch B recorded absent in one of them.

**Setup (laptop)** — there is NOTHING to set up for points assist (0064).
- [ ] Set up → Columns shows **no** Points assist tab and no cost/marks fields. Editing a column shows one
      switch, "Students can use points on this column", on by default.
- [ ] Edit a quiz: **Held in class** → pick the class Scratch B was absent in → Save.

**The A mark**
- [ ] Grid: Scratch B's cell on that quiz shows **A** in amber without anyone typing it; hovering says why.
- [ ] Type **a** in another student's cell and tab away → it reads **A**; type a number over it → the A is gone.
- [ ] Tab through Scratch B's derived A without typing: nothing saves (no "1 unsaved change").
- [ ] Erase Scratch B's derived A: it comes back.
- [ ] Phone, instructor login: each row has an **A** button; tapping it toggles a typed A; Scratch B's is disabled.
- [ ] Export the term: the A cells are the letter A, not 0 and not blank.

**Recitation**
- [ ] Grid, So far: a **Recitation · attendance** column with each student's rate (9 of 10 classes = 90.00).
- [ ] Compare one student with the Attendance rate on their own screen — same number.
- [ ] Overall tab and the printed sheet show the same Recitation for that student.
- [ ] A term with no classes counted reads the 60 minimum for Recitation and still shows no term grade
      until a quiz or exam exists.
- [ ] **Imported terms:** open one you imported earlier — its Recitation now comes from attendance. If that
      is wrong for that term, tell me before relying on its grades.

**The student side (phone, Scratch A with a mark in the quiz, Scratch B absent)**
- [ ] Scratch A (quiz mark 17 / 20): the quiz is open for points with no instructor action. Use points → the
      card shows a picker defaulting to **3** ("You can use up to 3 points here — that reaches full marks"),
      and **+** is disabled at 3.
- [ ] Choose 2 → the confirm says "2 points … 17 becomes 19 out of 20" → send → approve (as section 5). The
      push and the ledger line say **Points assist**, not "Boost".
- [ ] Give Scratch A a mark of **17.5** on another /20 quiz: the picker allows up to 3 and the confirm says
      the gain is **2.5** and the result **20** — never 20.5.
- [ ] A column at full marks: no picker, listed as "Already at full marks".
- [ ] Scratch B: the quiz shows **Absent**, sits under "Not available yet" with "You were absent for this
      one", and a direct call is refused ("You were marked absent for …").
- [ ] Give Scratch B a typed **0** on the quiz: still Absent, still refused.
- [ ] Switch a column off (the Columns switch): it moves to "Not available yet — Not offered for points".
- [ ] Grades shows an **Attendance** row under Recitation: "9 of 10 classes attended".
- [ ] Reverse the points assist from Requests → **Points assists applied**: the push reads "Points assist reversed".
