# ClassPoint — Project Context

Mobile-first gamified classroom PWA. An instructor awards points; students level up,
climb a leaderboard, check in to class via rotating HMAC QR codes, and collect
achievements. Single instructor (the user), students at DCT.

**Academic structure (since 0027).** Data is organised
**semester → term (prelim/midterm/finals) → subject → section**. A semester is 18 weeks,
six per term, but term dates are STORED and editable rather than computed — holidays
move them. The first semester is "1st Sem AY 2026–2027", starting **June 15 2026** (a
Monday; week 1 anchors there). Two subjects run in it: "IT 32 · Platform Technologies"
and "Elective 1 · Event-driven Programming". The same roster takes both, so **attendance
is per subject** while **points are one shared pool** spendable anywhere. Points, level
and the leaderboard **reset each semester**; achievements and the all-time total never do.

## Stack

- **Frontend:** React 19 SPA (no SSR) · TypeScript · Vite 8 · react-router-dom 7
  (`createBrowserRouter`, every screen lazy-loaded in `src/router.tsx`) ·
  Tailwind CSS v4 (CSS-first config — NO tailwind.config.js; tokens live in
  `src/styles/index.css`: `--canvas/--card/--card-2/--ink/--muted/--line`, brand red
  `#e11d2a`, gold scale) · framer-motion 12 · custom UI primitives (NOT shadcn).
  Heavy/optional libs are dynamic-import only: `xlsx` (exports),
  `modern-screenshot` (leaderboard share image).
- **Backend:** Supabase only (project ref `cxfxstazlwjijozkglgx`) — Postgres + RLS +
  Realtime + Edge Functions (Deno) + pg_cron + pg_net + Vault + Storage (`avatars` bucket).
- **PWA:** vite-plugin-pwa (Workbox, `registerType: 'prompt'`). Custom push logic in
  `public/push-sw.js`, pulled into the generated SW via `workbox.importScripts`.
- **Deploy:** Vercel (SPA rewrite in `vercel.json`). Migrations are pasted manually
  into the Supabase SQL editor; edge functions deployed via `supabase functions deploy`.

## Conventions (follow these exactly)

- **Data layer:** ALL Supabase calls live under **`src/lib/api/`** — one module per
  domain (`core` · `attendance` · `backup` · `excuses` · `comments` · `redemptions` ·
  `notifications`), with shared plumbing (`rpc`, `withAuthRetry`, `oneEmbed`,
  `fetchAllRows`, `fetchAllPages`) in `api/_internal.ts`. **`src/lib/api.ts` is a barrel**
  that re-exports them, so every screen still imports from `@/lib/api` and no call site
  changed. Add a query to the domain module it belongs to, never to the barrel; import
  `_internal` only from within `api/*`. Calls throw on error and map snake_case rows →
  camelCase app types. Domain types in `src/lib/types.ts`; DB row types in
  `src/lib/database.types.ts` (hand-written — see its header for what it does and
  doesn't catch). Components never call `.from()` directly — except Realtime
  subscriptions.
- **State:** no react-query/zustand. Plain Context + async functions. Student-side
  state is centralized in `src/features/student/StudentData.tsx` (realtime channel
  `student-self-${studentId}`, optimistic updates, celebration queues). Instructor
  screens fetch ad-hoc in the component.
- **UI primitives live in `src/components/ui/` and are the vocabulary — reach for one
  before hand-rolling.** Surfaces: `Card` (pad none/tight/default/roomy, `interactive`) ·
  `Rows` (divided row list) · `StickyBar`. Controls: `Button` (variants incl. `danger`,
  `loading`, `icon`) · `IconButton` (`label` REQUIRED; see the adjacency rule) ·
  `SegmentedControl` · `Input` / `Textarea` / `Select`. Content: `EmptyState` ·
  `ErrorState` · `Chip` (takes a `tone`) · `SectionLabel` · `Stat` · `Meter` · `PersonRow`.
  Modals = `src/components/ui/Sheet.tsx` (bottom sheet). Toasts = `useToast()`.
  Confirmations = `src/components/ui/ConfirmDialog.tsx` — **every destructive or
  hard-to-undo action must go through it** (deletes, bulk marks, end session, commit
  penalties). The one exception: single-student taps during a LIVE attendance session
  stay one-tap for speed.
- **Components:** function components, named exports, PascalCase files. Lazy imports
  destructure the named export: `.then(m => ({ default: m.Foo }))`.
- **Verify: `npm run verify`** — typecheck (`tsc -b --noEmit`) → ESLint → 129 unit tests →
  `vite build`, in that order. That one command is the gate before every commit.
  Individually: `npm run lint` · `npm run lint:eslint` · `npm test` (`test:watch` for
  TDD) · `npm run build`. Heavy libs (`xlsx`, capture libs) only via dynamic `import()`.
- **Tests (Era 5.0 Phase C):** Vitest, colocated `*.test.ts` beside the five PURE libs —
  `qr` (HMAC pinned against an independently-computed value; a drift here would reject
  every scan), `term` (local-vs-UTC date parsing, week/term boundaries), `leveling`
  (the ladder is pinned and changes in the SAME commit as any `cp_level` migration),
  `offline-scans` (the state machine; the load-bearing test is "a transport failure
  KEEPS the queued proof"), `changelog` (version compare + the draft stays out of the
  live array). No React/Supabase mocking — that's why these five came first.
- **ESLint** runs for the first time (`eslint.config.js`, flat config). Deliberately all
  WARNINGS for now, dominated by react-hooks v7's `set-state-in-effect` and `purity`
  performance opinions (the purity hits are all `Math.random()` in decorative
  confetti). It already earned its place by catching a real ordering smell in
  `Students.tsx`. **The count is 95 and `lint:eslint` is CAPPED at it
  (`--max-warnings 95`)** so `verify` fails if it grows — see the Era 8.0 Phase 6 and
  follow-up notes under 0062. (Earlier figures in this file — 47, 105, 107, 109 — were true
  when written.)
- **Env validation:** missing `VITE_SUPABASE_*` now THROWS in production
  (`lib/supabase.ts`) instead of falling through to placeholder credentials — a typo'd
  Vercel env used to boot fine and fail every request with an opaque network error.
  Dev keeps the soft warning path.
- **Realtime channel discipline:** one durable channel per student
  (`student-self-*`); page-scoped channels subscribe on mount and are removed on
  unmount; NEVER key channel effects on object identity (use the stable id — see the
  comment in StudentData.tsx).
  **Page-scoped channels MUST use `uniqueChannel()` from `lib/supabase.ts`, not
  `supabase.channel()`.** `channel(topic)` returns an EXISTING channel for a
  repeated topic, and `.on()` on an already-subscribed channel throws
  ("cannot add `postgres_changes` callbacks … after `subscribe()`"). This bites
  whenever a component mounts twice — notably anything passed to Shell's
  `actions`, which renders in BOTH the desktop sidebar and the mobile header.
  For that reason, **a component in `actions` must never own a subscription**:
  hoist state to the layout (mounts once) and pass it down as a prop.

## Changelog workflow

Every user-facing change is announced via `src/lib/changelog.ts` (drives the
"What's new" sheet; version-gated by localStorage). During overhaul phases,
accumulate sections into an exported draft entry (NOT in the `CHANGELOG` array —
`LATEST_VERSION` reads `CHANGELOG[0]`, so a draft is invisible to users) and only move
it into the array when the user says the era is ready to announce.

**4.0.0 "A whole new semester" SHIPPED 2026-08-25.** `DRAFT_4_0_0` is gone — the entry
lives in `CHANGELOG[0]` now. It was CUT DOWN from 19 sections / 72 bullets to **6 / 19**
before shipping: nobody reads a 72-bullet release note, and roughly half of it was
instructor-only work that has no business in a student's "What's new". `changelog.test.ts`
no longer guards a draft; it now asserts the live entry stays under 8 sections and 24
bullets, so the next era gets trimmed rather than allowed to sprawl.

## Migration workflow

- One idempotent file per feature, numbered `supabase/migrations/00NN_*.sql`:
  `create table if not exists`, `drop policy if exists` + recreate,
  `create or replace function`, publication adds guarded by `pg_publication_tables`
  checks, `cron.schedule` upserts by job name.
- **Return-type changes require `drop function if exists` first** (the 0014 lesson),
  then re-`grant execute`.
- Keep existing constraint names when widening CHECKs (`point_events_points_check`,
  `point_events_category_check` — see 0007/0011 precedent).
- Manual dashboard steps go in a `── ONE-TIME SETUP ──` header comment (0010 pattern).
  Current manual state: Vault secret `edge_service_key` exists; VAPID keys are set as
  edge function secrets; pg_cron + pg_net enabled. **RESOLVED 2026-09-01, the hard way:** the `ALLOWED_ORIGINS` edge-function secret was set to the LITERAL PLACEHOLDER `https://<your-vercel-domain>`. A non-empty allowlist made `corsHeaders` take the configured branch and echo that string back as `Access-Control-Allow-Origin` — not a legal header value — so every browser failed the preflight and **claim-token and reset-pin were unreachable for every student**. The 0026 fail-safe only covered an UNSET secret; an unusable one was worse than none. `_shared/security.ts` now runs every entry through `parseOrigin()` (rejects `<>`/whitespace, requires http/https, normalises to `u.origin`) and falls back to `*` when nothing parses, so a bad value can only fail to TIGHTEN CORS. The real value is `https://ccs-classpoint.vercel.app`; redeploy `claim-token`, `reset-pin`, `send-push` after changing it.
- The user pastes migrations whole into the SQL editor — test idempotency by running twice.
- **NEVER build a migration body with `String.replace()`.** In a replacement STRING, `$$`
  means "one literal `$`" — so a `create function … as $$ … $$;` inserted that way lands in
  the file as `as $ … $;` and Postgres fails with `42601: syntax error at or near "$"`.
  This shipped once in 0041 and was only caught when the file was pasted. Write SQL with
  the Write tool, or pass a replacer FUNCTION (`() => 'as $$'`), which is not scanned for
  `$` escapes. **$$ IN A GENERATED MIGRATION IS THE THING TO CHECK FIRST** when a pasted
  file errors on a dollar sign: `grep -n '^as $*$' file | awk -F: '{print $2}' | sort | uniq -c`
  should show only `as $$`, in equal number to `$$;`.
- ⚠ **AN UNQUALIFIED `UPDATE` OR `DELETE` INSIDE A RUNTIME-CALLABLE FUNCTION IS A
  BUG, EVEN THOUGH THE MIGRATION PASTES CLEANLY.** Supabase runs **pg_safeupdate**
  for the API roles (`authenticated`, `anon`), which refuses a statement with no
  WHERE clause: `UPDATE requires a WHERE clause`. The SQL editor runs as
  `postgres`, which is **exempt** — so the two paths disagree:
    * a top-level one-time backfill in a migration always works (0029's and
      0048's unqualified backfills are fine and 0029's has already run);
    * the same statement inside a `security definer` function called through
      PostgREST **always fails**, because SECURITY DEFINER changes the privilege,
      not the session settings the guard reads.
  This is how 0035's `set_active_semester` shipped broken for months: it pasted,
  the ACID TEST in its own footer passed (run in the editor, as `postgres`), and
  it only failed the first time the instructor actually pressed Activate. **0061
  fixes it; it was the only runtime-reachable case in the project.**
  **Audit the right way:** strip parenthesised subqueries BEFORE testing for a
  `where`, or a correlated subquery's own `where` masks the outer statement's
  missing one — that false negative is exactly why a naive grep never found this.
  When a statement genuinely must touch every row, say so with a real predicate
  rather than a tautology: compute the new value in a `from (…) v` subquery once
  and join on `where v.id = s.id`. That satisfies the guard, keeps ONE copy of the
  expression, and still updates every row exactly once.
- **Migration before client, always.** A migration adding a column the client selects
  must land in the database BEFORE the build that selects it, or every read 400s.
  **ALL migrations 0001–0041 are APPLIED as of 2026-09-02** (confirmed by the user; 0041 was pasted twice to prove idempotency). **0042, 0043, 0044 and 0045 are WRITTEN AND NOT YET APPLIED** — until they are, every Student Space screen past the hub shows its error state. Paste them IN ORDER, and order matters: 0043 and 0044 each widen `audit_log_action_check`, and 0045 widens `point_events_category_check`.
  The long "0033–0040 are unapplied / this one is LOUD" warning that used to live here
  is gone because it was describing a state that no longer exists — and a stale warning
  is worse than none, since the next reader cannot tell which half is still true.
  **0046 is WRITTEN AND NOT YET APPLIED** — until it is, `get_room_pins` throws and the
  room panel's Pinned tab is simply empty (the 0034 SectionGrid precedent: a separate
  try/catch, so a missing RPC never takes the screen down with it).
  **0047 is WRITTEN AND NOT YET APPLIED** — it re-creates `get_space_people()`, which
  0042 renamed AFTER 0042 had been pasted. Confirmed missing in the live database on
  2026-09-03 (`42883: function public.get_space_people() does not exist`), which is why
  the room panel showed nobody and no name in chat carried a level. It is independent of
  0046 and can be pasted in either order.
  **0048 is WRITTEN AND NOT YET APPLIED** — per-room notification level. It must go AFTER
  0046 only because of numbering; its real dependency is 0043. Until it lands,
  `getRoomLevel` throws, the "Notify me" control stays hidden, and the header's Mute pill
  falls back to 0043's `set_room_muted` — so nothing breaks, there is just no three-way
  setting yet.
  **0049 is WRITTEN AND NOT YET APPLIED** — peer groups. It depends on nothing after
  0041 and can be pasted before or after 0046–0048. Until it lands, `/teach/peer` shows
  its ErrorState and the rest of the app is untouched — the screen is new, so there is no
  working surface for it to take down.
  **0050 is WRITTEN AND NOT YET APPLIED** — peer evaluations. It MUST go after 0049,
  which widened `audit_log_action_check` with the `peer_eval` value 0050 writes, and it
  needs 0041 for `app_flags` and `cp_my_student_id`. Until it lands, `/app/peer` and the
  Evaluations tab of `/teach/peer` show their error states; the Groups tab beside it needs
  only 0049.
  **0051 is WRITTEN AND NOT YET APPLIED** — peer results. It MUST go after 0050, and it
  takes ownership of `cp_nightly_backup` from 0032, so 0032 must not be edited. Until it
  lands, the Results tab and the release control on `/teach/peer/:id` are missing (a
  separate try/catch, so the completion view is unaffected) and `/app/peer/:id/results`
  shows its error state.
  **0052 is WRITTEN AND NOT YET APPLIED** — target an evaluation at specific groups. It
  MUST go after 0051 (it takes `get_peer_results` and `cp_nightly_backup` from it). Until
  it lands, an evaluation opened with every group ticked works exactly as before, while
  one with any group unticked fails to create with a readable error rather than opening
  for the whole section.
  **0053 is WRITTEN AND NOT YET APPLIED** — hard-delete a peer evaluation. It MUST go
  after 0052, because its audit snapshot reads `peer_evaluation_groups`. Until it lands,
  the Danger zone button shows and the delete fails with a readable error; nothing is
  removed. Live results need no migration beyond 0051.
  **0054 is WRITTEN AND NOT YET APPLIED** — flagged comments and group shuffles. It MUST go
  after 0053, and takes `submit_peer_evaluation` from 0050 and `get_peer_results` from 0052.
  Until it lands, the board shows no flags (defaulted to false client-side) and saving a
  shuffle fails with a readable error. Duplicate and every UI change need no migration.
  **0055 is APPLIED (confirmed by the user 2026-09-21)** — global event attendance (its own
  isolated tables, so it depends only on 0001–0041 machinery + 0045's `event` category, which
  it re-lists when it widens `point_events_category_check`). It also makes an ownership move of
  `cp_notify_point_event` (0025 → 0055).
  **0056 is APPLIED (applied_state.sql BLOCK 6 read `true`, confirmed by the user) — the rest of this paragraph is the history of why it exists.** The event-award guard bypass. 0055 shipped with a
  latent bug: `scan_event_attendance` runs under the STUDENT's JWT (SECURITY DEFINER does not
  change `auth.uid()`), its `point_events` insert fires `cp_recompute_points`, whose
  `students` UPDATE trips `cp_guard_student_update` (0009) — so a real student scan died with
  "You can only update your display name, photo, bio and interests." and nothing recorded.
  Event check-in is the FIRST student-initiated self-award in the app, so nothing hit this
  before. 0056 ownership-moves `cp_guard_student_update` (0009 → 0056), `scan_event_attendance`
  and `mark_event_attendance` (both 0055 → 0056): the two RPCs raise a transaction-local GUC
  `cp.event_award = 'on'` (via `set_config(..., true)`) right before their `point_events`
  insert, and the guard early-returns when it sees the flag. `cp_recompute_points` is NOT
  touched. Until 0056 lands, every event scan that awards >0 points fails with that guard
  error and records no check-in; a 0-point event works (no ledger row, no recompute).
  **0058 is WRITTEN AND NOT YET APPLIED** — the grade importer's transactional
  write. It MUST go after 0057 (it writes `grade_items` and `grade_scores`, and
  relies on 0057's section guard to abort a mis-matched import). Until it lands,
  the Import button opens and every stage works up to the final confirm, which
  then fails with a readable error and writes nothing — which is also what the
  whole function is designed to guarantee.
  **0057 is WRITTEN AND NOT YET APPLIED** — grades. It depends on nothing after
  0027 (semesters/subjects/sections) and takes `cp_nightly_backup` from 0052, so
  0052 must not be edited. Until it lands, `src/lib/grading.ts` and its 31 tests
  are fully exercised (they are pure), but every call in `api/grades.ts` 400s —
  so every grades fetch gets its OWN try/catch and `ErrorState` (the 0034
  SectionGrid precedent), and nothing else in the instructor area is affected.
  **0061 is APPLIED (BLOCK 6 read `true`, confirmed by the user) — activating a semester should now work; try it.** The `set_active_semester` WHERE-clause
  fix. See the pg_safeupdate bullet above; activating a semester fails with
  "UPDATE requires a WHERE clause" until this is pasted, and nothing is switched.
  It depends on nothing after 0035 and can be pasted on its own, ahead of 0042–0060.
  **0060, 0061 and 0062 are ALL APPLIED AND CONFIRMED (user, 2026-11-09): BLOCK 6 true for 0056/0061/0062's two body probes; a five-column existence query true for `grade_boosts`, `get_my_grades`, `save_subject_policy`, `farewell_message` and `archive_semester_students`; BLOCK 7 returned zero rows (the audit constraint holds all 18); and activating a new semester worked, so the 0061 fix is proven in use.** What has NOT been run is 0062's verify block (request, approve, reverse) — that is `REAL_DEVICE_PASS.md` section 5. Student grades and grade boosts. It MUST
  go after 0057 and 0058 (it writes `grade_items` / `grade_scores`), and it takes
  `decide_point_redemption` from 0029 and `cp_nightly_backup` from 0057. Run
  `applied_state.sql` BLOCK 2 first: it re-lists `audit_log_action_check`. Until it
  lands, the client degrades rather than breaks — `listGradeItems` and the
  instructor inbox fall back to column lists without the new fields, the grid's
  corner dots and the Home card render nothing, and `/app/grades` shows its error
  state; boost requests and the Ops switch fail with a readable message.
  0062 also carries `save_subject_policy` (the atomic weights save) — until it lands the
  weights editor works as before, at the old non-atomic risk.
  **0066 is WRITTEN AND NOT YET APPLIED** — `get_event_attendees()`, a definer RPC for
  the event monitor's checked-in list (renumbered from 0057 at the PC↔laptop merge; the
  file and the client comments say 0066 now). The live monitor showed "2 checked in" but
  listed only 1: the count came from `get_event_stats` (definer, bypasses RLS) while the
  list was a direct embed select through the caller's RLS, and the two read paths
  disagreed. 0066 reads the list the same way the count is read, so it can never show
  fewer than the number. The client (`getEventAttendees`) calls the RPC and FALLS BACK to
  the old embed if 0066 isn't applied yet, so the list keeps working during the paste
  window (it just carries the old discrepancy until 0066 lands). Depends only on 0055;
  independent of everything laptop-side, paste in any order. **If the PC's 0057 was ever
  pasted under its old name, nothing breaks** — it is `create or replace` and idempotent.
  **0067 is WRITTEN AND NOT YET APPLIED** — the 2026-11-11 security review. Paste it AFTER
  everything else, twice, then run its footer VERIFY block. It (1) rewrites
  `cp_guard_student_update` from a denylist to an ALLOWLIST — the denylist never gained
  0029's `semester_points` or 0023's `archived_at`, so any student could set their own
  spendable balance from the console and spend it on points-assist grade requests, or
  un-archive themselves; (2) hides `lounge_events.answer_key` with a column-level grant;
  (3) revokes PUBLIC/anon EXECUTE on every public function except `cp_level` and
  `replace_push_subscription`, and authenticated on `refresh_leaderboard_snapshot` /
  `cp_achievement_metrics`. ⚠ **Supabase's schema DEFAULT PRIVILEGES grant every new table
  and function to anon AND authenticated** (confirmed by live probe) — a migration comment
  saying "not granted" is FALSE unless the file says `revoke`. ⚠ **Any new `students` column
  a student must edit has to be added to `c_allowed` in that guard**, or profile saves fail
  with "You can only update your photo…". Dashboard step: turn OFF "Allow new users to sign
  up" (it was ON; claim-token uses the admin API and is unaffected). Redeploy `claim-token`
  (atomic token reservation, display name 2–40, PIN ≤72).
  **0068 is WRITTEN AND NOT YET APPLIED** — Lounge threads + the W list (2026-11-13). Paste it
  (twice) BEFORE deploying the client, though the client degrades: `getLoungeReplies` defaults the
  new fields, and `replyToPost` OMITS `p_parent_id` when there is none, so a plain reply still works
  against the old function. Replies thread ONE LEVEL (instructor's call): `parent_reply_id` is the
  thread ROOT (always a top-level comment, so answering a reply joins its thread) and `reply_to_id`
  is the comment actually answered, shown as "@Name" inside a thread. `reply_to_post`'s signature
  grew, so the exact old `(uuid, text)` is dropped first (the 0028 overload lesson);
  `get_lounge_replies` grew its return type (drop-first); `delete_lounge_reply` soft-deletes a root's
  answers with it. Answering a comment pushes its author (`space_reply`, never yourself).
  `get_post_ws(post)` is the W list — visible to EVERYONE in Space; `PostWsSheet` owns its own
  profile preview and closes the list before opening it (no Sheet inside a Sheet).
  **People** (`/app/space/people`, ONE route, also a sidebar/menu entry and a hub card) reuses
  `get_space_people()`; "My class" is exactly the viewer's section and is EMPTY, never everyone, when
  the section is unknown (`lib/people.ts`, 7 tests). `NavLinkItem.exclude` stops Space and People
  both lighting up. **Grades eye:** grade FIGURES (term figure, part scores, "how it is worked out",
  Home card) are hidden on every visit and revealed with an eye; plain component state, so it
  resets by design. Per-column scores stay visible. NOT verified on a real login.
  **0069 is WRITTEN AND NOT YET APPLIED** — repairs found in use (2026-11-14). (1) Closing a Random
  Event with winners failed on `lounge_posts_pulse_kind_check`: 0042 was EDITED after being pasted to
  list `'event'`, so the live constraint was still `('level','podium')` and the whole close rolled
  back — the 0047 rename lesson again. (2) `get_event_answers` and (3) `read_dm_thread` both used a bare
  `where id = …` while `id` is an OUT column (42702 "column reference is ambiguous"); the second is the
  DM break-glass path, never yet exercised. **In a plpgsql function with RETURNS TABLE, EVERY column
  reference in its body must be alias-qualified.** (4) The **reward catalog was REMOVED** by the
  instructor: `0032_rewards_catalog.sql`, `api/rewards.ts`, `RewardsCatalog.tsx`, the Requests "Rewards"
  tab and the student shop grid are deleted (0032 was never applied); 0069 drops the table if it exists.
  `cp_nightly_backup`'s lists in 0051–0063 still name `reward_catalog_items` — harmless, it tolerates a
  missing source. ESLint cap is now **94**.
  **0070 is WRITTEN AND NOT YET APPLIED** — give a classmate a W (2026-11-14). `person_ws`
  (giver, receiver, Manila `given_on`) is the PK: one W per classmate per DAY, taken back by setting
  `revoked_at` (never deleted) so a same-day re-give reuses the row and does NOT push twice. The
  table has RLS on, no policy and no grant — `give_person_w` (toggle, gated by `cp_lounge_author`,
  pushes `space_person_w` on the first W of the day), `get_people_ws` (public COUNT + "you gave today")
  and `list_my_person_ws` (who gave — RECEIVER ONLY) are the only doors. Social only, never points.
  People fails soft without it: no W buttons, no "Your W's" card.
  **Next number: 0071.** (0063 is pasted; 0064 and 0065 are written — see their sections below.)
  ⚠ **EVERY "WRITTEN AND NOT YET APPLIED" CLAIM IN THE BLOCK ABOVE IS NOW
  UNVERIFIED PROSE — ASK THE DATABASE INSTEAD.** It was written file by file
  over months, nobody could check it without reading every migration and
  guessing, and a stale warning is worse than none because the next reader
  cannot tell which half is still true. **`supabase/queries/applied_state.sql`
  is the answer**: BLOCK 1 reports, per migration, whether its tables,
  functions and columns exist; BLOCK 1b collapses that to one line each; and
  BLOCK 6 covers the files that add no new object (0056 only changes a function
  body, so nothing else can see it). Run it and replace the prose above with
  the result. Two things it will NOT tell you, and both have bitten: a
  `PARTIAL` row can mean a **rename inside an already-pasted file** rather than
  a missing paste (the 0047 lesson), and **BLOCK 2 must be run before writing
  any migration that widens `audit_log_action_check`** — copy the live
  definition rather than the list in any comment, which is how that constraint
  has already been silently narrowed twice.
  **0059 is WRITTEN AND NOT YET APPLIED** — structured student names. It adds
  `last_name` / `first_name` / `middle_name` / `suffix` columns to `students`,
  backfills `display_name` for old comma-format names (idempotent: `WHERE last_name
  IS NULL`), ownership-moves `cp_guard_student_update` 0056→0059 (adds the four new
  columns + `display_name` to the denylist), drops the exact `create_student(uuid,
  text)` signature and recreates with structured params, updates `create_students`
  to parse "Last, First MI" strings into the columns, adds `update_student_name` RPC
  (instructor-only, writes audit log + re-runs `refresh_leaderboard_snapshot`),
  widens `audit_log_action_check` with `'edit_name'` (all 15 values re-listed), and
  calls `SELECT refresh_leaderboard_snapshot()` to update snapshot's `display_name`
  copies. Until it lands, adding a student uses the new 4-field form but the RPC
  falls back to constructing `full_name`/`display_name` from the old single-text
  path — nothing breaks; structured columns stay NULL for all existing students.
  Client mirror: `src/lib/student-name.ts` (`officialName`/`socialName`/`initialsOf`,
  pinned by `student-name.test.ts`). **Change one side, change the other, same
  commit** (the `lounge-answers.ts` rule).

Since 0033 (Student presence — Phase F): **`class_sessions` joined the realtime
publication** (guarded 0004 pattern). Safe because the table is already
`select using (true)` to authenticated and the rotating QR secret lives in the separate,
unpublished `class_session_secrets`. That subscription is what powers the live-class
banner. Plus `cp_excuse_nudge()` + daily cron `classpoint-excuse-nudge` at 10:00 UTC
(18:00 Manila): one push per absence on day 5–6 of 0025's 7-day window, deduped by
`notifications.url` as an ANTI-JOIN in the driving query (not a per-row check in the
loop). **The copy states the real deadline DATE, never "2 days left"** — the window
spans 5–6 days old, so an evening class caught at 5d22h has barely one day, and a
relative count would be a lie at the edge. A `cancelled` excuse deliberately does NOT
suppress the nudge (the student withdrew it and can still refile).
Client: `getActiveSessionForStudent` (skips the secret read that RLS hides from students
anyway) and `getMySessionStatus` feed `liveSession`/`liveStatus` on StudentData, kept
current by a `class_sessions` subscription on the durable channel — keyed on the stable
`me.section_id`, and re-reading rather than patching from the payload (the raw row has no
`subjects` join, and an `ended_at` UPDATE must CLEAR the banner). `LiveClassBanner`
mounts on Dashboard (routes to `/app/attendance?scan=1`, which auto-opens the sheet and
strips the param) and Attendance (opens the sheet in place).
**`listStudentEvents` gained KEYSET paging** — `before: {created_at, id}`, compound
because a timestamp alone is not a total order, and quoted in the PostgREST filter
because a timestamptz renders with a `+`. New student screens: `/app/history`
(`PointsHistory` — per-week bars, category split, load-older) and `StreakFlame`
(Dashboard compact + Attendance full). The streak number comes from
`achievementProgress.streak`, i.e. the DB's `greatest(combined, best-per-subject)` —
**never recompute it client-side**, a naive local count is combined-only and would
disagree with every badge. There is no "longest ever" figure because the schema has no
such metric. `changePin` on AuthContext requires the current PIN (re-auth via
`signInWithPassword`, which leaves the session intact on failure) so an unlocked phone
can't lock the owner out. **Scanner manual entry was dropped on purpose:** the QR encodes
a ~100-char URL + HMAC, so there is nothing on the projector a student could transcribe —
it needs a short-code feature first.

**The student area now configures the term calendar** (`configureTermCalendar` in
StudentData's `load()`, from the semester it already fetches). Only InstructorLayout did
this before, so every student-side week number and term label silently used term.ts's
hardcoded FALLBACK dates — which happen to match this semester, which is exactly why it
would have gone unnoticed until the instructor moved a term date around a holiday.
Student attendance history is grouped by term off the back of it.

Since 0034 (Instructor ops — Phase G): five instructor-gated RPCs, all drop-first +
granted. `get_backup_health()` reads `pg_class` for schema `backup` rather than a
hardcoded list, so it can never drift from what `cp_nightly_backup` actually writes.
`get_section_overview()` (last session, active flag, `unfinalized` = ended sessions with
`apply_penalties` and no commit). `get_term_attendance(section, term)` — **ATTENDANCE
ONLY and no computed score, by the instructor's explicit rule: POINTS ARE NEVER TURNED
INTO A GRADE** (they reach one solely via an individually-approved redemption). Its term
window is compared in **Manila time** (`at time zone 'Asia/Manila'`), because
`started_at` is timestamptz against plain `semester_terms` dates and a naive compare
casts at UTC — which would push a 7am class out of its own term. Its term filter lives
INSIDE the joined subquery, not the WHERE clause, so a student with no classes that term
still returns a zero row instead of vanishing. `get_absence_risk()` — cross-section
unexcused absences with `actionable` = those still inside 0025's 7-day window; the list
is ordered by what can still be DONE, not by show-up rate. `send_broadcast(title, body,
url, section_id?)` — one bulk INSERT (not 208 `cp_queue_notification` calls), audit row
written BEFORE dispatch, then **chunked dispatch at 50** because `cp_push_dispatch` puts
every id in a single HTTP body and was written for one-or-two-id calls; refuses an empty
target rather than reporting a cheerful zero. `audit_log_action_check` widened with
`'broadcast'` (name preserved — Phase I adds `'promote'`/`'semester_activate'`).
New notification type `'broadcast'`. **There is no trigger on `notifications` inserts** —
dispatch is always explicit, which is why the chunked call can't double-send.
Client: `src/lib/api/ops.ts` + `/teach/ops` (`Ops.tsx`, lazy) with RiskOverview,
Broadcast, AttendanceWorkbook, backup health, leaderboard rebuild, auth events, audit
log. `OpsButton` sits in Shell's `actions` beside Requests and is **stateless by
requirement** (that slot mounts twice). `getSectionHeadcounts()` is deliberately NOT
`getSectionStats` — the latter also chunks through every student's claim token, and a
recipient count should not pull secrets over the wire. The composer sums headcounts over
**the instructor's semester-scoped `sections`**, never over every key in the map, or it
would promise a number `send_broadcast` won't reach.

Since 0035 (Rollover — Phase I): `promote_students(uuid[], section)` (one audit row each),
`archive_students(uuid[])` (bulk; ONE snapshot refresh at the end, not one per student),
`get_rollover_preflight(semester)`, `set_active_semester(semester)`,
`get_semester_leaderboard(semester)`. `audit_log_action_check` widened again with
`'promote'`/`'semester_activate'` — **it re-lists 0034's `'broadcast'`, since dropping
and recreating the constraint silently narrows it otherwise.**

**`set_active_semester` discharges the contract written at the foot of 0029:** it BULK
RECOMPUTES `semester_points` for every student. `cp_recompute_points` is
active-semester-relative and only fires when a point row changes, so nothing else in the
system can rebuild that cache for a semester CHANGE — without those lines every student
keeps last semester's balance as their new spendable points. It also does the **two-step
is_active flip** (clear, then set), because the partial unique index
`(is_active) where is_active` would be violated mid-statement by a single UPDATE. The
blocking pre-flight is re-run INSIDE the function, so a stale UI can't slip a rollover
past a live class or a pending redemption. `unplaced` is a WARN, not a block (user's
call — leaving someone behind is often deliberate).

**Ownership move: `scan_attendance` 0023 → 0035** (same signature, plain
`create or replace`). Body copied forward verbatim plus the **active-semester guard
deferred from 0028** — it belongs here because a past-semester section could not exist
until rollover made one possible.

`get_semester_leaderboard` recomputes from `point_events` (the snapshot only ever holds
the CURRENT board), INCLUDES archived students (they were on that board when it counted),
and uses **`row_number()` with the same `display_name` tiebreaker as
`refresh_leaderboard_snapshot`** — `rank()` would produce ties where the live board
produced a strict order, so a student's remembered "I finished 7th" would disagree with
their own history. Two plpgsql traps this file documents: a RETURNS TABLE column named
`count` shadows the aggregate (hence `item_count`), and a loop variable named `id`
collides with the column (hence `v_id`).

Client: `src/lib/api/rollover.ts`; `SemesterRollover.tsx` (4-step, hosted by a
`RolloverPanel` in ManageSemesters). **The wizard COMMITS at every step** — sections,
subjects and promotions are real rows immediately — so it is resumable by construction
rather than by saving draft state. Section names **start blank** (user's choice: a
carried-forward or year-bumped suggestion is right for one rollover and wrong for the
other, and a wrong suggestion here CREATES a section rather than failing). Activation is
behind the typed-name ConfirmDialog challenge. Student side: `semesterEnded` on
StudentData — derived, no extra query, from `me.section_id` not being in the
active-semester `sections` list (guarded on `sections.length > 0`, or it flashes during
load); `SemesterEndedBanner` on Dashboard + Attendance; the scan button is hidden when
ended (the RPC refuses anyway); `PastSemesterBoard` is a SHEET, not another option in
the leaderboard's section picker — that picker chooses sections, and folding a second
axis into it makes both harder to read.

Since 0036 (Per-term badges): **Ownership move `cp_achievement_metrics` 0030 → 0036**
(return type GROWS by four columns, so drop-first; `get_achievement_progress` also
drop-first since its type grows too; `sync_achievements` recreated; all re-granted).
Four new metrics, each the student's **BEST SINGLE TERM** across every term of every
semester — which is what lets the badges read as "do it in any one term" while still
unlocking once, ever (`student_achievements` is `unique (student_id, achievement_code)`,
and achievements stay lifetime per 0029): `term_points` (≥18 — instructor picked the
hard bar knowingly; on current data that's the top few students), `term_recitations`
(≥8), `term_early_streak` (≥6), `perfect_terms` (≥1). Badges: `term_ace`,
`flawless_term`, `term_talker`, `six_sharp`. Term windows read `semester_terms`'
editable dates and compare in **Manila time** (the 0034 lesson); `term_early_streak`
uses **gaps-and-islands**, not the trailing-run trick the all-time streaks use, because
a finished term's best run can sit anywhere inside it. `perfect_terms` requires ≥6
counted classes so a one-session term can't grant "perfect attendance".

**0036 ships NO BACKFILL, deliberately** — and the reason is worth keeping: a loop
calling `sync_achievements()` FAILS SILENTLY. That function gates on `is_instructor()`,
which reads `auth.jwt() ->> 'email'`, and the SQL editor has no JWT — so it raises for
every student, and the exception handler such a loop needs swallows it into a notice
while inserting nothing. Inlining the rules instead would duplicate the threshold list.
Badges already sync lazily (StudentData calls `syncAchievements()` on every app open,
idempotent, insert-only), which is how 0016 and 0021 worked too.
Client: `getAchievementProgress` defaults the four new fields with `?? null` so a client
running ahead of the database degrades to an empty progress bar rather than leaking
`undefined` through `Record<AchievementMetric, number | null>`. `badgeMotifs.tsx` gained
art for the four new codes **plus `big_spender` / `high_roller` / `town_crier` /
`window_shopper`**, which 0021 seeded without motifs and which had been rendering as
blank gradient frames ever since.

Since 0037 (Rank movement + tenure): `leaderboard_snapshot` gains `previous_rank`
(null until the first refresh after this lands — inventing movement we never recorded
would put a wrong number on all 208 rows) and `rank_since`. **Ownership move
`refresh_leaderboard_snapshot` 0029 → 0037, rewritten DELETE+INSERT → UPSERT + sweep**,
because the old shape destroyed the very rows the new columns must read. The trick that
makes it one statement: in `on conflict do update`, every SET expression sees the OLD
row, so `previous_rank = leaderboard_snapshot.rank` works in the same statement that
overwrites `rank`. Reference it by BARE table name — a schema qualifier is a syntax
error there. The sweep (`delete … where not exists … archived_at is null`) replaces what
truncation used to give for free.
**`rank_since` is "held this rank OR BETTER"** — climbing keeps the run, only dropping
resets it. Exact-rank tenure was considered and rejected: on a 208-student board settling
twice daily it reads 0–1 for nearly everyone.
Client: `RankSignals.tsx` exports `RankDelta` (▲/▼ + places moved) and `RankTenure`
(🔥 Nd), both rendering NOTHING when there's nothing to say — no arrow on an unchanged
rank, no flame under a day — so the board doesn't fill with dashes and zeroes.
**Both are gated behind PodiumBoard's `rankSignals` prop, which callers set only on the
UNFILTERED view:** a section view renumbers rows by position within the section while
these columns describe the whole board, so a row would otherwise read "#4 ▲3" without
having moved on screen. The pinned "your standing" row passes it unconditionally — that
row is numbered by real global rank.

**The home flame reads `present_streak` (0036), not `streak`.** They answer different
questions and both are correct: `streak` breaks only on an absence (forgiving, because
it backs a permanent badge), `present_streak` also breaks on a LATE (strict, because
it's a live display and "6 in a row" must mean six). It is combined-across-subjects only,
NOT `greatest(combined, per-subject)` like the badge streaks — those use greatest() so
badge progress can never regress, which is the wrong trade for a live number.
**`StreakFlame` now renders at zero** with an unlit flame and a prompt; returning null
below 1 hid it from exactly the students it was meant to motivate.

Student attendance surfaces (no migration): **`StudentData` now owns the attendance
history** — loaded OFF the critical path exactly like achievements (`void
loadAttendance(...)`, never awaited in `load()`), and re-read on `attendanceTick` so an
instructor's correction reaches every surface from the one subscription. The Dashboard
`AttendanceTeaser` and `/app/attendance/stats` (`AttendanceStats`, lazy) both read it and
fire NO query of their own. **`Attendance.tsx` deliberately keeps its own fetch** — it
owns a loadError/retry state the provider has no business carrying, so it is the one
screen that queries twice.
`AttendanceStats` splits from the Attendance TAB by intent: the tab is for DOING (scan,
resolve an absence, check a recent mark), the stats screen answers "how am I going?" —
per-term rates, a week-by-week bar chart, punctuality. **Punctuality only counts rows
with a `scannedAt`**: a record the instructor marked by hand has no check-in moment, and
averaging it in as "0 minutes" would invent a punctuality the student never showed.
Per-subject rates stay on the tab only — that cut already exists there.

Instructor workflow QoL (no migration): **`get_section_overview()` is finally wired** —
SectionGrid cards show a Live pill, an "N to finalise" pill (ended sessions with
`apply_penalties` and no commit), and "Last class Nd ago". It is fetched in a **separate
try/catch from `getSectionStats`** on purpose: the RPC ships in 0034, so until that is
applied the call throws and the signals simply do not render — folding it into the same
try would take the whole grid down with it.
`listRecentAwards(limit, filters)` gained section/category filters and offset paging.
**The embed becomes `students!inner(...)` when filtering by section** — a plain embed
applies the filter but keeps every parent row with the students object nulled, so the
list would fill with rows reading "Unknown". Filters re-run the query rather than
filtering in memory, because the list is paged and a client-side filter would only ever
search the rows already downloaded.
`src/lib/session-presets.ts` — saved threshold/penalty sets in localStorage
(`cp_session_presets_v1`, max 6, save-by-name upserts). localStorage not a table: one
instructor, personal convenience, and a lost preset costs seconds. **Presets deliberately
exclude subject and topic** (those change every class). `loadPresets` validates every
field rather than trusting the store — a hand-edited entry would otherwise put NaN into a
live session's config. PullToRefresh now wraps SectionGrid and the roster view.

Dashboard rebuild (no migration): the home screen was TEN stacked full-width blocks,
four of them near-identical row cards in sequence (streak → attendance → use points →
achievements), with points and rank sitting seventh. Now: greeting → banners → **hero
carrying level AND points together** (points ARE the XP — showing them in separate cards
split one idea in half; the hero is tappable to `/app/history`) → a one-line **next
milestone** → a 3-up **stat strip** (rank / streak / attended, each tappable to the
screen it summarises) → a 3-up **quick-action tile row** → **five** feed rows + "See
all". Measured 1054px ≈ 1.3 screens at 375×812, no clipping, no horizontal overflow.
`NextMilestone` compares points-to-next-level against points-to-overtake-the-rank-above
and names the SMALLER — always showing the level would hide that one recitation
sometimes gains a place, which is the more motivating of the two. The rank cell reuses
`RankDelta` from RankSignals, so it degrades to no arrow until 0037 lands.
The feed is FLAT, not grouped by day: across five rows the Today/Yesterday headers cost
a line each and say less than the per-row relative time. **`StreakFlame` and the old
`AttendanceTeaser` are gone from the Dashboard** — their numbers live in the strip now;
StreakFlame still renders on the Attendance screen.

UI chrome uses ICONS, not emoji (user's call — emoji chrome reads as generic). `FlameIcon`
and `TargetIcon` in `components/ui/icons.tsx` replaced 🔥 and 🎯 across StreakFlame,
RankSignals and the Dashboard. **FlameIcon is FILLED, not stroked like every other icon
in that file**: at the 14–16px these render at, a 1.75px outline leaves no interior and
the shape reads as a blob. Emoji in student-authored content (comment quick-chips) and
notification copy is untouched — the objection was to chrome.
The flicker is a **CSS keyframe (`.cp-flame` / `@keyframes cp-flicker` in index.css),
not framer-motion**: the leaderboard can render a flame on every visible row, and forty
JS springs for a decorative wobble is a real cost. `transform-origin: 50% 95%` so it
stretches upward like a real flame. **Only a HOT streak animates** (≥5 days / ≥5
classes) — every row moving at once is a wall of motion that stops meaning anything.
The global reduced-motion block switches it off with everything else.

**The danmaku pill was being clipped**: `LANE_HEIGHT` was 30 but the pill measures 34,
and the deck is `overflow-hidden` — so every comment lost its top and bottom. Lane is
now 40 with the pill centred in it (`height: LANE_HEIGHT` + flex centring) rather than
pinned at `top + 2`, which is what let it ride out of the clip region. Also made more
legible per the user: 13px text, `bg-card/95`, `shadow-lg`, a 20px avatar, and
`max-w-[85cqw]` with a truncating body so one long comment cannot stretch the pill past
a readable width. **The Dashboard hero is no longer a button** — a whole tappable card
with no obvious affordance was the wrong target; the feed's "See all" is the way in.

**The tab-switch refresh bug (fixed 2026-08-25).** Every return to the tab flashed the
full-screen skeleton and re-issued nine queries. Cause: `load` was `useCallback`'d on the
`user` OBJECT. Supabase fires TOKEN_REFRESHED when a backgrounded tab comes back,
AuthProvider sets a fresh session for it, `user` became a new reference, `load` rebuilt,
and the mount effect (`setLoading(true)`) re-ran. **Keyed on `user.id` now — the same
stable-id rule the realtime channels already follow, for exactly the same reason.**
Also: the visibility handler only refetches after the tab has been hidden longer than
`STALE_AFTER_MS` (2 min). Realtime keeps the data current for a short glance away, so
the old unconditional refetch was pure waste. And **the StudentData context value is now
memoized** (deferred from Phase H): it previously handed every consumer a new object each
render, so one realtime point event re-rendered every student screen.

Motion vocabulary lives in `src/lib/motion.ts` — `spring`, `ease`, `pageVariants`,
`listVariants`, `rowVariants`, `pressable`. Instructor picked **"noticeable, with
character"**: ~300ms, springy, visible movement. `<MotionConfig reducedMotion="user">`
in App.tsx switches all of it off for motion-sensitive users, so nothing here needs its
own guard. **The route transition stays a CSS animation (`.cp-route-in`), NOT
framer-motion** — a lingering transform makes the element a containing block and
misplaces every `position: fixed` Sheet backdrop. It was retuned 0.18s → 0.3s with a
slight scale, not replaced.

Era 6.0 Phase 1 — navigation (2026-08-28): **`components/ui/PageHeader.tsx`** replaces
five near-identical private header/back implementations. Its back is HISTORY-AWARE, not
`navigate(-1)`: this is an installed PWA entered from push notifications, `/scan` deep
links and cold launches, where there is often no in-app history to return to. It reads
react-router's own `history.state.idx` and falls back to a per-screen route when that is
0. That is the fix for Achievements, which hard-coded `/app/profile` and so sent you to a
screen you had never visited when you arrived from Home.

**Two screens were orphaned in production** — `/app/history` and `/app/attendance/stats`
lost their only links when the Dashboard was reverted, and `/teach/semesters` had never
been linked at all (hiding term dates, subjects and the whole rollover wizard behind a
typed URL). Links now live where they PERMANENTLY belong, not on the Dashboard: the
stats screen hangs off the Attendance summary card's show-up-rate row (that row is the
summary it expands on), the ledger off the Use-points header, and Semesters off a card
in Ops (it is admin work, beside backup health and the audit log). Putting them back on
the Dashboard would have thrown them away in the coming home-screen rebuild — and given
them a second chance to be orphaned.

**`src/lib/routes.test.ts` (7 tests) guards this.** Pure source-text parsing, no mocking,
in the spirit of the other five pure-lib suites. The screen list is EXPLICIT rather than
derived from the router: a derived version has to model nested paths, `Navigate`
redirects and `:param` segments, and gets them wrong in both directions — the first
attempt invented `/app/semesters` and `/app/ops`. It is verified to actually bite:
removing the `/app/history` link fails it.

**A tinted `<Card>` USED to silently do nothing — fixed in Era 6.0 Phase 2.**
Tailwind v4 emits utilities ALPHABETICALLY, and `cn()` was a plain join, so Card’s own
`bg-card`/`border-line` (later in the sheet) beat a caller’s tint. Measured before the
fix: `.border-brand-500/30` @24245 < `.border-line` @25819; `.bg-brand-500/8` @28533 <
`.bg-card` @30742. Four call sites rendered plain (`StudentRecord.tsx:218`,
`OfflineScanCards.tsx:90`, `SessionHistory.tsx:333`, `SemesterEndedBanner.tsx:23`) —
including the "unsynced offline check-ins" card, which exists to stand out.

**`src/lib/cn.ts` now uses `tailwind-merge`** (v3; no `clsx` — nothing passes arrays or
objects, so the signature is unchanged and one dependency does the job). Later classes
win, which is what every call site already assumed. The census found only ~10 colliding
sites BECAUSE the naive join had eaten overrides for months, so nobody attempted them.
`cn.test.ts` pins the behaviour, with the four tint cases as regression tests.

**Known limitation, pinned in that test:** twMerge does NOT recognise Tailwind v4’s
TRAILING `!` suffix, so `h-9!` is not merged against `h-10` and both survive. Harmless —
`h-9!` compiles to `height:…!important` and wins regardless of order. Two files use it,
both for Avatar sizing on the podium. If it ever matters, drop the `!` at those call
sites rather than configuring twMerge; the `!` only existed to beat the old join.

**`Card` can now own defaults** (padding, elevation). That was blocked before: a `p-4`
default would have overridden every `p-3` (38 sites) and `p-3.5` (21) caller while
leaving `p-8` alone. Adding those variants is the next primitive phase.

Era 6.0 Phase 3 — token layer (additive CSS only). **Semantic role colours are TWO
tokens per role**, and the split is empirical rather than stylistic: of the 95 `dark:`
overrides in the app, 87 were five FOREGROUND pairs (`text-gold-600 dark:text-gold-400`
×39, emerald ×19, brand ×13, gold-700/300 ×11, sky ×5) while `bg-emerald-500` (×24) and
`bg-sky-500` (×5) carried NO dark variant at all. So `--success` (foreground) is defined
in BOTH `:root` and `.dark`; `--success-solid` (fill, used as `bg-success-solid/10`) is
defined ONCE and never flips. Verified in the built CSS: every foreground has 2
definitions, every solid has 1.

**`--danger` is deliberately NOT brand red.** Brand red is demoted to an accent for nav
and identity; if danger shared the hue then a "−5 penalty" chip and an active tab would
look identical and red would stop meaning "bad". **Phase 3's first attempt at this was
WRONG and Phase 4 fixed it** — see the danger-by-hue note below.

**The custom size step MUST be named `2xs`** (or `3xs`) — never `tiny`/`xxs`/`micro`.
tailwind-merge reads `text-<Nxs>` as a FONT SIZE but any other bare word after `text-` as
a COLOUR, so `cn("text-tiny","text-muted")` silently DROPS the size while
`cn("text-2xs","text-muted")` keeps both. Measured, and pinned in `cn.test.ts` with the
`text-tiny` counter-example. Because of that naming, NO `extendTailwindMerge` config is
needed.

**Never write a Tailwind glob like `zinc-<star>` inside a CSS comment.** The star-slash
closes the comment early and silently eats the surrounding declarations. Doing exactly
that in `index.css` gutted the entire `:root` block down to a single token — which would
have left `--canvas`, `--card`, `--ink`, `--muted` and `--line` UNDEFINED in light mode,
i.e. light mode completely broken. `npm run verify` passed the whole time; only reading
the built CSS caught it.

Contrast measured after the change (role foreground on `--card`): light 3.56–7.80, dark
6.23–12.09. Nothing below 3:1. Light-mode `success` (3.77) and `streak` (3.56) clear the
bar for the bold/chip text they are used in, but are under 4.5:1 — do not use them for
body copy in light mode. `reward` (3.11 light) is the same value the app already used as
`text-gold-600` in 41 places, so it is not a regression — same rule applies.

Era 6.0 Phase 4 — mechanical migrations. Decisions (user, 2026-08-29): **full brand-red
demotion** · sub-12px band collapses to **two EXISTING steps** · **13→14, forms→16,
rest→14** · **radius strays now, the rule applied later**.

**`--danger` now differs from brand by HUE, not lightness — and Phase 3 shipped it
wrong.** `#a3161f` vs `#e11d2a` is the same 356° hue at different lightness. That reads
as "deeper red" on a white card and collapses completely in dark mode, where a foreground
must be LIGHTER than the surface: the dark value shipped as `#f76a72`, which **is
`--color-brand-400` exactly — measured CIE76 ΔE 0.0**. Danger and brand were the same
colour in dark mode, so the demotion was impossible until this was fixed. The pair is now
crimson ~344° (`#9f1239` / `#f1748f`): ΔE 29.6 from brand-600 light, 15.2 from brand-400
dark (>10 = clearly different at a glance), contrast 8.02 / 6.56. **Pick role colours by
measuring ΔE and contrast, not by eye** — the eye cannot tell 356° from 356°.

**`src/lib/tone.ts` is the ONE definition of what a role looks like** — four facets per
role (`chip` soft tinted pill · `dot` · `solid` filled selected-control · `text` bare
foreground). Four files had grown their own copy of the same recipe and two were
byte-identical. Every value must be a **complete literal string**: Tailwind's scanner
cannot see `bg-${role}-solid/10`, so an interpolated class generates no CSS and the
element renders with no background — which looks like a layout bug, not a colour one.
`tone.test.ts` pins that.

**Two roles the census added:** `--reward` (the `gold-600/400` pair — XP, points, levels;
**41 uses, the largest colour pair in the app**) and `--accent` (`brand-600/400`, the
readable brand foreground). They are NOT the same as `--warn` and `--danger`: reward vs
warn are both gold but ΔE 17.3/13.4 apart, and warn is darker because it sits on a gold
tint. `--accent` exists so Phase 6's "demote brand red" is a one-line token edit rather
than another 15-site sweep.

**Role assignment is by MEANING, and brand red used to mean both things at once.**
`bg-brand-500/10` was simultaneously the `absent` chip, the rank-climb notification, and
the "Activities" points category. Now: **danger** = loss/rejection/error only (absent,
rejected, declined, deduct, penalties, failed check-in, sub-70% show-up, destructive
buttons); **accent** = identity and positive brand (rank climb, broadcast, the "Rare"
rarity tier, the instructor's own comment pill). Two sites are arguably `warn` instead and
are flagged in the Phase 4 report: the "Archived" banner on StudentRecord and the
"Spending points lowers your XP" caution on UsePoints.

**`--silver` / `--bronze` were REMOVED — they were dead tokens I added in Phase 3** on
the theory they backed "14 raw zinc and amber uses". They do not: PodiumBoard's medal
ramps are two-stop gradients (`from-zinc-200 to-zinc-500`) plus the ink that sits on them,
which a flat token cannot express, and the only other consumer is ShareCard, a deliberate
token-free island. Zero possible consumers.

**Three deliberate token-free art islands, listed in `tone.test.ts` and not to be
"fixed":** `ShareCard` (inline styles + hard-coded palette, because `var(--x)` does not
resolve inside modern-screenshot's cloned capture context — tokenising it exports a black
or transparent image), `PodiumBoard` (medal ramps), `BadgeArt` (rarity gradients).

**Type scale: 104 arbitrary sizes → 5 named steps, zero remaining.** 11.2px rounds UP to
`text-xs` rather than down to `text-2xs`, so nothing shrinks meaningfully; the nine micro
values (8–10.56px, all inside 2.5px) collapse to `text-2xs`; 13px and 15px body text →
`text-sm`. **Every FORM CONTROL is `text-base` (16px) — that is a behaviour fix, not a
type choice:** below 16px iOS Safari zooms the viewport on focus and never zooms back.
The plan named four fields (the `text-[15px]` ones); there are **eight** — four were
already on `text-sm`, which is 14px and zooms identically, including the student-facing
excuse-reason textarea. Any new input/textarea/select must be `text-base`.

**Radius: the rule is written but only chrome was migrated.** `rounded-lg` inline chips /
`rounded-xl` cards, buttons, inputs / `rounded-2xl` sheets, hero / `rounded-full` pills.
**Chart geometry is deliberately outside the rule** — a bar 6–10px wide cannot carry an
8px corner without deforming, so SessionHistory's track and bars, AttendanceStats' and
PointsHistory's `rounded-t`/`-b`, and SemesterRollover's 18px checkbox keep small radii.
(One "stray" the census counted was `const rounded = useTransform(...)` — a JS variable.)

**`npm run lint` was a NO-OP and has been since it was written.** It ran `tsc --noEmit`
against the root `tsconfig.json`, which is `"files": []` plus project references — bare
`tsc --noEmit` resolves **zero files** and always exits 0. Only `npm run build`'s `tsc -b`
ever typechecked anything, so the first stage of `npm run verify` was theatre. It is now
`tsc -b --noEmit`, which immediately caught four files missing an import that the old
command passed clean. CLAUDE.md previously described this as "misses unused locals" —
that understated it completely.

Era 6.0 Phase 5 — primitives. Decisions (user, 2026-08-29): **Card `p-4` default + 3
variants** · **keep icon-button visual size, expand the hit area** · **spinner in slot +
optional `loadingLabel`** · **build every primitive**, including the two I recommended
deferring.

**`Card` finally owns a padding default, and the migration is narrower than it looks.**
Because `cn` is tailwind-merge, the 91 Cards with an explicit `p-*` still win and render
byte-identically — they are deliberately untouched, and moving them to the `pad` prop is
cosmetic work for the screen phases. **Only the 30 with NO padding class changed
behaviour**, and those got `pad="none"`: most are `divide-y` row lists whose rows pad
themselves, so a default would have stacked two paddings. Variants: `none` · `tight` (p-3)
· `default` (p-4) · `roomy` (p-5).

**`IconButton` keeps its visual size and grows an invisible 44×44 tap region** via a
`::before` pseudo-element — most icon buttons were 36px, under the 44px Apple and Google
both recommend, and scaling them up would have thickened every header and roster row.
Measured: md renders 36px with a 44×44 hit area, sm 32px with 44×44, lg is already 44 and
gets none.
**THE ADJACENCY RULE IS LOAD-BEARING.** Two expanded hit areas overlap when their centres
are under 44px apart, and in the overlap the later element in DOM order wins — for an
edit/delete pair that means a tap near the seam hits the wrong one. So a row of `md`
buttons needs at least `gap-2` (36 + 8 = 44, exactly touching); `sm` needs `gap-3`.
Tighter groups must pass `expandHitArea={false}`. Every existing group was checked.
`IconButton`'s `danger` variant rests MUTED and only reddens on hover, which is what the
call sites already did — a trash icon that shouts before you reach for it makes a roster
look alarming.

**`EmptyState` and `ErrorState` are separate on purpose.** All 23 `p-8` Cards were empty
states; 23 files separately hand-rolled a retry affordance. An empty list and a failed
fetch are NOT the same thing, and conflating them is how a student whose connection
dropped got told they had no attendance record at all. Both take the sentence as
`children` rather than a `title` prop, because most of those sentences interpolate
something and a string prop would need a fragment wrapper at every site.

**`Chip` takes a `tone`, never a colour class** — that is what stops "rejected" and "an
active nav item" drifting back into the same red. `StatusChip` now maps status → role and
renders no colour of its own.

**`SegmentedControl` is a real `radiogroup` with `aria-checked`**; the hand-rolled strips
announced three unrelated buttons with no indication of which view was active. The two
competing visual languages were unified on FILLED (Requests + ShareSheet), so **History's
tabs changed from outlined-tint to filled**.

**`Textarea` mirrors `Input`'s API exactly.** No primitive existed; all three sites
hand-rolled a border and focus ring and two had no error path. Both it and `Input` are
`text-base` — see the iOS zoom note in Phase 4. **Any new input/textarea/select must be
`text-base`.**

**Built but NOT adopted, deliberately: `PersonRow` (26 candidate rows), `Stat` (14),
`Meter` (3).** Their call sites differ in LAYOUT, not just styling, and two UI changes in
this project have already been reverted for exactly that reason. They land per screen in
Phases 7–8 where each screen is reviewed. `Stat` is built to COMPOSE — a figure and a
label, no card, no border, no width — so Phase 6's hero can arrange it rather than
replace it. `Meter` is not a replacement for `XpBar`: that one is the animated gold hero
bar and earns its weight as a focal point; `Meter` is a hairline track for proportions
read at a glance in a list.

Two things left alone that a future sweep should not "fix": **PinnedBadges' 20px Unpin and
ProfileBanner's 24px Remove-photo** stay bespoke — both are overlay affordances on image
tiles and both are DESTRUCTIVE, so a 44px tap region invites exactly the accidental taps
their small size prevents.

Era 6.0 Phase 6 — student visual direction. Decisions (user, 2026-08-29): **ink
scoreboard hero** · **gold-tint avatars** · **dark ramp widened to ΔL\* ~6.3** · **all
four blocks under the hero**.

**The dark ramp was measurably why elevation read flat.** canvas→card was ΔL\* 3.7 — a
contrast ratio of **1.08**, i.e. a card barely separated from the page it sat on. Now
`#08080b` → `#18181f` → `#24242e` (ΔL\* 6.3 then 6.1). **`--line` had to move with it**
(`#2a2a32` → `#2e2e39`): against the new `card-2` the old value sat only ΔL\* 2.8 away,
close to invisible for a border. Every role foreground stays above 6.1:1 on the new card.

**`--color-plate` / `--color-plate-2` live in the FIXED `@theme` block, not as semantic
tokens** — the scoreboard is the one element in the app that does NOT flip with the
theme, and that is precisely what makes it read as an object rather than as another
card. Anything that reads `plate` must never be given a `.dark` override.

**`HomeHero` replaces the biggest brand-red surface in the app.** The old hero was a
`from-brand-500 to-brand-700` gradient carrying only the level, while points — the same
quantity, since **points ARE the XP** — sat in a separate tile below it. Splitting one
idea across two blocks is what made the old home screen feel like a list of widgets.
Order inside the hero is deliberate: level is the headline (changes rarely, means most),
points sit beside it (same number, checked constantly), the XP rail is the bridge showing
how one becomes the other, and rank + streak are the footer. **It is deliberately NOT a
button** — a previous version made the whole card tappable, which is a large target with
no affordance.

**`Avatar`'s initials fallback is gold, not brand red.** It renders on every roster row,
leaderboard row and comment pill, so with 208 students — most without a photo — the brand
gradient turned the leaderboard into a column of ~40 identical red circles. That was the
single largest concentration of brand red left, and it was decoration.

**Contrast on the plate must be measured, not eyeballed.** `text-white/40` on
`--color-plate` is **3.83:1**, under the 4.5 those `text-2xs` labels need. All translucent
text on the plate is now `/55` or higher (6.14:1 minimum); only the unlit flame icon stays
at `/35`, where the 3:1 non-text threshold applies. Blend the alpha over the plate before
computing — reading the `oklab(… / α)` computed value straight into a contrast formula
gives nonsense.

Dashboard composition: greeting → banners → scoreboard → next milestone → attendance →
use points → achievements → **five FLAT feed rows** + "See all". The feed is no longer
grouped by day: across five rows the Today/Yesterday headers cost a line each and say less
than the per-row relative time. `NextMilestone` names the SMALLER of points-to-next-level
and points-to-overtake-the-rank-above — always showing the level would hide that one
recitation sometimes gains a place.
**Measured at 375×812: hero 222px and STABLE across 0 / 142 / 1284 points (no layout
jump); page total 1092px = 1.34 screens; no horizontal overflow.** The rejected rebuild
measured 1054px, so this is 38px longer but built from seven larger blocks instead of a
3-up stat strip plus a 3-up tile grid — the complaint then was density, not length.

**`LiveClassBanner` and `SemesterEndedBanner` are back on Home.** They had been mounted
only on Attendance, so a student on Home during a live class got no signal to go scan —
`LiveBadge` is realtime CONNECTION status, an entirely different thing. Both render
nothing when they don't apply.

**Verification note for this environment:** the Browser pane does not composite while
hidden, so CSS transitions never advance and `getComputedStyle` returns the value from
BEFORE a theme toggle. A `body` background that appears not to follow `--canvas` is
almost certainly this. Inject `*{transition:none!important}` before measuring a theme
flip, or read the custom properties off `documentElement` instead, which are immune.
Console messages are also buffered PER TAB and survive navigation and a dev-server
restart — open a fresh tab for a clean read.

Era 6.0 Phase 7 — student screens (Attendance + Leaderboard). Decisions (user,
2026-08-29): **the Attendance tab is for DOING; analysis moves to the stats screen** ·
**fix all four duplications** · **Profile and UsePoints get their own phase** (at 673 and
542 lines they are redesigns, not restyles).

**`src/lib/attendance.ts` is the ONE definition of the show-up rate** — `counts` ·
`showedUp` · `tally` · `rateOf` · `countedOf` · `rateTone` · `bySubject`. It was computed
independently in THREE places (`AttendanceStats`, `Attendance`, and the Dashboard card
added in Phase 6), and it is the figure the instructor's risk screens flag students on.
It mirrors `get_section_attendance_stats` (0031) and `NEUTRAL_STATUSES` — **if the rule
changes, the SQL changes in the same commit**, or the student's screen and the
instructor's workbook disagree about the same class. `attendance.test.ts` (12 tests); the
load-bearing one is that **excused/irregular leave the DENOMINATOR**, so a medical excuse
can never lower a rate. `rateTone` bands on **70/85 — the instructor's at-risk line**, not
a friendlier student-side one.

**The Attendance tab dropped from 9 blocks to 7.** The per-subject split and the
neutral-statuses note were ANALYSIS on a tab meant for doing (scan, resolve an absence,
check a recent mark) and moved to `/app/attendance/stats`. The neutral note in particular
was a loose line under the summary with nothing to relate it to; on the stats screen it
sits inside the headline card, explaining the rate directly above it.

**`components/points/PointEventRow.tsx` replaces `FeedRow` + `LedgerRow`**, which were
the same component twice differing only in badge geometry. That cost something real: when
brand red was demoted, "activity" was fixed in one twin and missed in the other, so **the
same event rendered in two different colours depending on which screen you opened**. Only
prop is `compact`.

**Rank movement had two sources that could disagree on one screen.** The DB's
`previous_rank` (0037, server-computed, what the board rows show) vs `Leaderboard`'s own
localStorage tracker. **The DB now wins wherever it can answer** — the global view, where
`myPos` IS the snapshot rank. The local tracker survives ONLY for what the DB cannot
answer: a SECTION view (rows renumbered within the section; no per-section previous rank
exists) and a client running ahead of 0037. `RankSignals` exports `RankDeltaValue` for the
verbose "new" / "— same" form, which is right on one pinned card and would be forty rows
of noise on the board.

**Points labelling: the problem was never the words, it was two numbers.** The Dashboard
teaser quoted the full balance and then sent you to a screen showing a smaller one —
"your 142", then "Available to spend 137" a tap later. The teaser no longer quotes a
figure it cannot compute (it has no pending-redemption data), and UsePoints now shows the
subtraction (`142 this semester − 5 awaiting a decision`) so the smaller number reads as
the same quantity minus something you asked for.

**On the leaderboard every remaining brand red was IDENTITY** — the "you" tint, "(you)",
the ring on your own row, the Share chip, the wash behind your standing card — so all of
it is `accent` now. `brand-500` is still the value behind `--accent-solid`, so light mode
is unchanged and dark mode gains the readable foreground those sites never had.
**PodiumBoard's focus rings and pedestal ink stay brand deliberately** (a focus ring IS
the brand; the pedestal ink sits on gold), and **`PersonRow` is NOT adopted there** — those
rows carry medal ramps, an XP ring around the avatar and a place number, which is bespoke
art rather than the shared row.

Era 6.0 Phase 8 — Profile and UsePoints. Decisions (user, 2026-08-29): **settings get
their own screen** · **share the profile PIECES, not the screen** · **the spending
warning folds into the request form**.

**`/app/settings` splits configuration out of Profile.** Profile was doing two unrelated
jobs at 673 lines — identity (photo, bio, badges, who viewed you) and configuration
(sounds, vibration, push, test-push, Change PIN, What's new, Sign out) — so the everyday
question was answered below seven controls a student touches once. Profile is now 428
lines. Sign out sits alone at the bottom, below everything it could be mistaken for.
**`routes.test.ts` gained `/app/settings`**, so its single entry point is enforced — this
is exactly the class of screen that got orphaned twice before.

**Do not rewrite moved copy from memory.** Extracting settings, I retyped `pushHint`'s
five branches instead of carrying them across, and every one was wrong. The real
`unsupported` line names the iPhone fix specifically ("add the app to your Home Screen
first") — iOS only allows web push from an installed PWA, so a bare "not supported" reads
as "this will never work". Restored verbatim.

**The profile is rendered twice and that is CORRECT** — your own (editable) and someone
else's (read-only) are genuinely different screens, so Phase 8 shared the pieces rather
than collapsing them behind a flag. `components/profile/InterestTags.tsx` replaces
`interestTags` + `splitInterests` (byte-identical bodies under two names) **and the tag
markup, which was duplicated down to the same class string** — that was the half that
would have drifted. `StudentProfilePreview`'s private `Stat` became a `StatTile` that
COMPOSES the shared primitive, which is what `Stat` was built for.

**There was a THIRD copy of the points row**, inline in `StudentProfilePreview`, still
rendering "activity" in brand red — the exact drift predicted when the first two were
merged in Phase 7.2. `PointEventRow` now takes **`PublicPointEvent`**, the narrower shape
it actually reads: asking for `PointEvent` would have locked out the one call site
rendering someone else's record, which correctly has no `student_id`.

**UsePoints' spending warning moved into the request form**, where the choice is made,
rather than sitting above a shop the student is still browsing. Safe because the
`ConfirmDialog` already restates the cost ("your total drops to N — your level and
leaderboard rank drop with it") — verified before moving it, not assumed.

Role assignment on these screens: `(you)`, the new-badges dot, interest tags, the History
link and the selected-kind chip are IDENTITY → `accent`; "You only have N available" is a
validation ERROR → `danger`.

**The secondary student screens still carry brand red** (AbsenceExcuses, Achievements,
Onboarding, AwayRecap, OfflineScanCards, LiveClassBanner, ScanLanding, and the
PointsHistory / AttendanceStats chart fills). Only the three stray ERROR messages were
fixed in Phase 8; the rest is deliberately left for a secondary-screens phase.

Era 6.0 Phase 9 — secondary student screens. Decisions (user, 2026-08-29): **earned
points go gold** · **unify the rate bands on `rateTone`** · **the live banner is accent,
not red** · **do the structural work too**.

**Two of these were readability BUGS, not colour preferences.** In `PointsHistory`'s
weekly chart the EARNED bar was `bg-brand-500` sitting directly above the LOST bar in
`bg-danger-solid/70` — two near-identical reds, stacked, for opposite meanings. Earned is
now `reward` gold, which is what points already are in the hero, the XP rail and every
points figure in the app. And `AttendanceStats`' weekly bars banded at **75/50** with
green/gold/brand while every other rate bands at **85/70** via `rateTone` — so the same
student's week could be a different colour depending which screen they opened. One
function now, app-wide; more weeks read amber, which is accurate rather than harsh.

**`LiveClassBanner` is `accent`, not brand red.** Red beside its green checked-in state
read as bad/good, but "your class is live, go scan" is an opportunity, not a failure. The
pulsing ring already carries the urgency.

**A FOURTH copy of the points row lived in `AwayRecap`** — same structure, same stale
"activity" colour. All four call sites are `PointEventRow` now.

Role assignment on the rest: excuse guidance and its numbered steps are INFORMATIONAL
(`info` — an explainer, not a warning about the student); the failed offline check-in
card's frame and "!" badge are `danger` (its body text already was, so the card
contradicted itself); unread notifications, onboarding, achievement filters and the
"add photo" / "pin a badge" placeholders are IDENTITY (`accent`); badge progress bars are
`reward`; withdrawing your own request rests muted and reddens on hover, like every other
destructive control.

**`Achievements`' filter chips are deliberately NOT a `SegmentedControl`** — I listed
them as a candidate and was wrong. They wrap and vary in width (categories AND earned
titles), so an equal-column grid is the wrong shape. Only `AbsenceExcuses`' two-option
slip toggle actually fits, and that one was migrated.

**Three brand-red uses remain on the entire student side, all correct:** a loading
spinner's top border and two focus rings. Everything else is a role token.

`ScanLanding` routes an unauthenticated visitor to sign-in regardless of payload, so its
two button branches cannot be reached in a browser without a login — that migration is
verified by typecheck and build only.

Era 6.0 Phase 10 — the live-class flow. Decisions (user, 2026-08-30): **one status
picker with several densities** · **keep `?review=` in the URL AND warn before leaving
uncommitted** · **this phase is the four live-class screens only** (the other 18
instructor files are a separate phase).

**THE REVIEW TRAP WAS REAL.** `?review=<id>` deep-linked into the review view and was
then consumed and STRIPPED — the code called that "so a refresh behaves normally", but
normal there meant losing the review. A refresh, an accidental back, or a phone locking
mid-review dropped the instructor to home and left the session **ended-but-not-finalised
with penalties never applied**, the only marker being a pill on a card they might not
scroll to. The param now IS the view: written on entry, held for the duration, cleared
only in `afterReview()`.

**`AttendanceReview` had NO WAY OUT** — no back button, no header affordance. The only
exits were finalising or navigating away via the tab bar, which abandoned the review
silently. It now has a back button behind a ConfirmDialog that names what leaving costs
("the −N points of penalties are NOT applied") — the treatment every other destructive
action already gets.

**Making the param persist introduced a regression I then had to fix**, worth recording
because the same shape will recur: a review belongs to ONE section, but the
section-change effect skipped its reset whenever the param was present, so switching
sections mid-review kept showing the PREVIOUS section's session. The effect now
distinguishes a genuine section change (abandon the review, clear the param) from a cold
deep-link (keep it). **When a URL param starts persisting, audit every effect that reads
it as a one-shot.**

**`components/attendance/StatusPicker.tsx` replaces three implementations** of the
identical task, each with its own copy of the status ORDER and its own selected-state
rule: `grid` (labelled buttons 3-up + Reset — the live screen), `compact` (five letter
squares — the review roster), `list` (full rows with a points-effect line — the
session-detail sheet). **The densities stay different on purpose**: five labels beside a
name is too wide for the review roster, and the live screen is used under time pressure
where initials are the wrong thing to decode. Only the duplication went.

34 identity/selected sites on these screens moved to `accent` — the live-session banner,
the "Live" pill, chosen subject chips, the penalties switch, the QR rotation bar, inline
links. **Two brand-red uses remain and both are correct:** a focus ring, and
`accent-brand-500`, which is the CSS `accent-color` on a native checkbox (same category
as a focus ring — and renaming it would read as `accent-accent-solid`).

**Not verifiable in this environment:** the review-trap fix needs an instructor login and
a real ended session, so it is verified by typecheck, build and static reading only. It
is the highest-value change in the phase and the one most worth exercising on a real
class.

Era 6.0 Phase 11 — the remaining 18 instructor screens. Decisions (user, 2026-08-30):
**adopt `PageHeader`** · **leave `Students.tsx`'s structure alone, restyle only** · **all
22 files in one phase**.

**Two rate bugs, not colour preferences.** `StudentRecord` rendered the show-up RATE in
permanent brand red regardless of value — **a student at 100% showed red**. And
`SessionHistory` carried a FIFTH rate-banding implementation: the same 85/70 thresholds,
but taking a 0–1 rate, returning a class string, and using reward-gold in the middle band
where every other rate uses warn. Both now go through `rateTone`. **Any new rate display
must use `lib/attendance`'s `rateTone`** — that is now five separate copies caught.

**The three private `BackLink`s are gone.** They were byte-identical except the label word
and each hard-coded its destination, so arriving at a student record from History dumped
you on the roster. `PageHeader`'s back is history-aware. **Its doc comment already CLAIMED
it had replaced them** — that had never happened, which is a reminder that a comment
describing intent reads exactly like a comment describing fact.

Each of the three had an `<h1>` in a card directly below the back link, so the header
absorbs it — one heading per screen. `StudentRecord`'s header card became the avatar
beside its four figures; `SessionDetail` is titled by the DATE, leaving the card's
editable topic to be content rather than a second screen name.

**`ConfirmDialog`'s `danger` variant and `Toast`'s `error` tone were still brand red** —
and by convention *every* destructive action in this app routes through ConfirmDialog, so
its warning icon and detail box were the single most important "this is dangerous"
surface in the app, wearing the brand colour. Same for every error toast across ~130 call
sites. **`Toast`'s success tone stays GOLD deliberately**: gold is this app's colour for
good things (points, XP, badges), which is identity rather than an oversight.

Other role calls: `AwardBar`'s penalty mode is `danger` (the bar deliberately turns red
while deducting, and a deduction is a loss); `Ops`' rate-limit notice is `warn`, not
danger, because its own copy says the failures are "usually a shared wifi, not an attack";
`Ops`' `delete`/`hard_delete` audit chips are danger.

**`Students.tsx` (888 lines) keeps its structure on purpose.** Unlike Profile, everything
in it is genuinely about students — the six sheets are modal flows off the roster, not a
separate concern — and it carries the bulk-award flow, which is the worst place to take
structural risk for a code-organisation win.

**What is left is the shared chrome and auth layer** — handled in Phase 12 below.

Era 6.0 Phase 12 — chrome and auth. Decision (user, 2026-08-30): **everything through the
token, including the chrome.** This closes the era: **every screen in the app is on the
semantic layer.**

**`--accent-solid` IS `brand-500`, so this is a ZERO-PIXEL change** — verified in the
browser, the primary button still computes `rgb(225,29,42)`. What it buys is one knob:
retuning `--accent` now moves every brand-coloured surface including the nav and the
primary button, rather than most of them. **The `brand-*` scale is now the raw palette
that `--accent` and `--ring` are DEFINED from, and is referenced nowhere else.**

**All four auth error messages were in brand red** — sign-in failures, invalid claim
tokens, expired reset codes, rate-limit warnings. On the screens where an error matters
most, because the person reading it cannot get in. Now `danger`.

**Focus styling uses `--ring`, not `--accent`.** That token already drives the global
`:focus-visible` rule in index.css; component focus rings were duplicating the intent
with a raw scale value, so they now share it. `accent-brand-500` (the CSS `accent-color`
on a native checkbox) became `accent-[var(--color-accent-solid)]` — `accent-accent-solid`
is valid but unreadable.

**`tone.test.ts` now pins brand red to the token layer.** Nothing visibly breaks when
someone types `bg-brand-500` instead of `bg-accent-solid`; it just quietly opts that
element out of the accent. **The first version of the pattern enumerated utility prefixes
and silently missed `border-t-brand-500`** — found by injecting one and watching the test
pass, so it now matches the scale itself and catches every prefix. `brand-950` is exempt:
it is the near-black ink that sits ON gold, not a use of brand red.

`SegmentedControl`'s active tab moved to `accent` so every selected control agrees — the
primitive had been disagreeing with the call sites it replaced. Three hand-rolled primary
buttons (PWA install, update prompt, comment Send) adopted `Button`; Send gained a real
loading state.

**Era 6.0 is complete. Nothing in the app has been seen rendered on an authenticated
screen** — all twelve phases are verified by typecheck, build, tests and targeted
browser measurement of unauthenticated surfaces only. The agreed next step is a guided
verification pass on a real device before any feature work.

Leaderboard rework (2026-08-31, no migration). Decisions (user): **measured lanes,
no overlap** · **wrap to 3 lines** · **full-screen overlay** · **calm the podium, one
ranked list, gap on your row, standing on the plate, tighter header**.

**The podium ran SIX simultaneous effects** — arena spotlight, breathing champion glow,
bobbing crown, drifting sparkles, light sweep, tap flash — before a single comment flew
over it. What survives is what carries MEANING: the crown (who won) and the XP ring (how
far through the level). The champion now wears a steady gold edge instead of a pulsing
glow. **Confetti stays** because it fires once on arrival, and the tap scale stays because
it is feedback rather than ambience. `Sparkles` is deleted.

**Ranks 4–10 are one divided list, not seven Cards.** That is where most students actually
find themselves, and seven floating objects with gaps read as unresolved next to the
podium. Inside the row the RANK anchors it — it used to be muted and the same size as the
points on the far right, which is backwards for a leaderboard.

**The gap to the row above shows on YOUR row only.** On every row it is ten small numbers
competing with the points column, and for someone forty points back it reads as
discouraging rather than motivating.

**`YourRankCard` moved onto `--color-plate`**, the same fixed dark surface as the home
scoreboard, for the same reason: it is the one thing on the board that is about you, so it
should read as an object rather than another row.

Header: the scope chip ("Top 10" / the section name) said the same thing as the picker
beside it, so it is gone and Share moved up — reclaiming a row, which matters more now
comments fly in front of the board.

Share image + board extras (2026-08-31, no migration). Decisions (user): **a
Samsung-S22-shaped story card** · **biggest climber, settle countdown, section identity
colour, bigger podium photos**.

**The share card is now 1080×1920 and exports as JPEG, not PNG.** It was a squat
landscape-ish card sized for nothing in particular; a story is the only place a
leaderboard screenshot actually gets posted. JPEG at quality 0.92 because a 1080×1920 PNG
of a photo-bearing card is several megabytes and some share sheets silently refuse the
handoff. `modern-screenshot` is called with `scale: 1` — the card is already at device
resolution, so the old scale factor was multiplying an already-large image.
The podium faces went 232px (champion) / 176px, which is the point of a story format:
at 1080 wide the old sizes were postage stamps. 👑 became a **drawn `Crown()` SVG** —
an emoji renders in the capture context as whatever font the cloned document resolves,
which is not the font on screen.
**`RankRow` has two densities.** The list variant (ten rows, no podium) left a 448px void
at the bottom at story height, so `roomy` spends that height on the rows themselves
(face 76, 18px padding) rather than on a gap. The podium variant keeps `compact`, where
the three stands have already taken the height.
ShareCard remains a **token-free island** — see the Phase 4 note. Every value in it is a
literal.

**`biggestClimber(entries)` lives in `RankSignals.tsx`**, beside the other things that
read `previous_rank`, and feeds BOTH the share card and the board banner. On the board it
sits between the podium and the ranks 4–10 list, and is **gated on `rankSignals`** for
the same reason the per-row arrows are: `previous_rank` describes the whole board, so on
a section view it would report movement against a ranking that is not on screen.

**The settle countdown already existed** and was not rebuilt — `SnapshotChip` renders
"next 5h 12m" from `nextSnapshotAt`/`countdownTo` in `src/lib/time.ts`. It reads the
DEVICE clock, which is correct here because every student is in Manila; a UTC-derived
countdown would be the thing that broke if anyone travelled.

**`src/lib/sectionColor.ts` is a separate palette from the role tokens, on purpose.** A
role colour MEANS something — success, warn, danger, reward — and a section is not a
status; reusing `--success` for "BSIT 2A" would have the same green say "present" in one
place and "your class" in another. Six hues chosen to dodge every role (violet, cyan,
indigo, fuchsia, teal, slate-blue). It returns hex for an inline style rather than a
Tailwind class because a class would have to be a complete literal for the scanner, and a
raw-palette class would trip `tone.test.ts`'s guard — correctly, since it is not a role.
**FNV-1a alone was not enough and the test caught it:** its low bits are poorly
distributed and `% 6` reads exactly those, so every anagram pair tested landed in the SAME
slot despite different hashes. A xorshift-multiply finalizer mixes the high bits down.
Six slots still collide by pigeonhole — the dot is a scanning aid, not an identifier.
The dot only renders where `showSection` is on (the global board); on a section view every
row would wear the same colour. Both theme values ride as CSS variables with a `dark:`
utility rather than reading the theme once in JS, so it follows a theme switch.

Since 0038 (The spend board — "climb or cash out"): `leaderboard_snapshot` gains
`spent_points` and a NULLABLE `spend_rank`. **Ownership move
`refresh_leaderboard_snapshot` 0037 → 0038** (same signature, plain
`create or replace`; 0037's upsert body carried forward verbatim plus a spend CTE
and the two columns in the `on conflict` SET list).

**Why the snapshot and not an RPC.** Students cannot compute anyone else's
spending — `point_events` (0003) and `point_redemptions` (0019) are both "own rows
or instructor". The points board already solves that by reading
`leaderboard_snapshot`, so spend goes through the same door. Both boards then
settle at the same moment, obey the same RLS, and **arrive in ONE fetch** —
`SpendBoard` issues no query of its own, it re-reads StudentData's `leaderboard`.
A separate RPC would settle on its own schedule and the two boards would visibly
disagree about the same student.

**Spend is summed from the LEDGER** (`point_events where category = 'redeem' and
semester_id = cp_active_semester_id()`), not from `point_redemptions` — the ledger
is authoritative, its rows are semester-stamped by 0029's trigger, and the filter
is byte-identical to `cp_recompute_points`'s. **`listTopSpenders` was repointed at
the snapshot for the same reason**: it summed `point_redemptions` client-side at
`limit: 500` (a 0031-style truncation waiting to happen) and would have become a
SECOND definition of one quantity — the exact bug already fixed twice here. Its
`requests` count is GONE, because the authoritative source cannot provide it and
every request is listed in full directly above that card.

**`spend_rank` is NULL for anyone who hasn't spent — not a place at the bottom.**
Median earnings are 22 points a semester against items costing 1–50, so most
students will be null; ordering a ~170-way tie at zero by name would look like a
ranking while meaning nothing. The `display_name asc` tiebreaker MATCHES the points
rank's (the 0035 lesson). **No `previous_spend_rank`** — 0037 refused to invent
movement it never recorded, and the spend board has no history at all yet.

**`PodiumBoard` gained `metric: 'points' | 'spent'` rather than being duplicated.**
It derives a level from `entry.points` at two places for the XP ring and the "Lv N"
label; pointed at spend totals that renders a CONFIDENTLY WRONG level for every
student, so `'spent'` skips the level computation entirely (unfilled ring, no level
line, "used" not "pts"). Varying beats copying here on precedent: five copies of the
show-up-rate rule and four of the points row all drifted before being merged.
`confetti={false}` on the spend board — confetti belongs to the board you climb.

**The shadow rank is the whole feature in one line.** `YourRankCard` shows "You'd be
#9 if you hadn't spent", computed from `points + spent_points` re-placed against
**`ranked`, not the global snapshot**, so it shares a frame with `myPos` (on a
section view both count section rows). Ties break on `display_name` exactly as the
SQL does, so it cannot be off by one against the board it annotates. Renders nothing
when there's nothing to say — same discipline as `RankDelta`/`RankTenure`.

**`routes.test.ts`'s `hasInboundLink` only matched SINGLE quotes** and so could not
see a `<Link to="/app/spenders">`, reporting a properly-linked screen as orphaned.
It matches both quote styles now. Verified to bite by pointing both links elsewhere
and watching it fail. `changelog.test.ts` no longer hard-codes the leading version
(that forced an edit every release, which teaches people to edit it unread); it pins
`LATEST_VERSION === CHANGELOG[0].version` instead, which is the actual invariant the
"What's new" gate depends on.

Spend board — making the fork VISIBLE (2026-08-31, no migration). Decisions (user):
**filled segmented control** · **a different podium motif** · **share-of-earnings in the
ring** · **Past boards folds into the section picker**.

**`BoardSwitcher` NAVIGATES, it does not filter.** The two boards are two screens by
decision, so this is a router move wrapped in `SegmentedControl` — each board keeps its
own URL, back behaviour and deep link, while a screen CHANGE looks like a tab switch.
It reuses the primitive rather than hand-rolling tabs specifically because that is a real
`radiogroup` with `aria-checked`: a hand-rolled strip announces two unrelated buttons,
which is the "I don't know which board I'm on" problem restated in audio. Tapping the
active tab is a no-op — navigating would push a duplicate history entry and make Back
feel broken.

**The header did not grow.** It was two rows (title + picker + share, then a pill row of
snapshot chip / Past boards / Spend board). Both pills left: "Spend board" BECAME the
switcher, and **Past boards folded into the section picker** as an `optgroup` — reversing
the note recorded when `PastSemesterBoard` was built ("that picker chooses sections, and
folding a second axis into it makes both harder to read"). That was right while it was
the only other control; with a switcher needing the row, an archive is what should cost
least. The picker's archive entry is an ACTION, not a view: it opens the sheet and leaves
`view` alone, so the controlled `<select>` snaps back to the board actually on screen.
The snapshot chip became a caption under the title.

**Both screens are titled "Leaderboard"** — the switcher names which one. `SpendBoard`
keeps `PageHeader`'s back arrow because, unlike the points board, it is not a bottom tab
(you can arrive from UsePoints).

**`TIER_SPEND` is a second ramp, not a recolour of the first** — violet → indigo → slate,
descending so it still reads 1-2-3, and a crown becomes a `TicketIcon`. Raw palette
values like the medal ramps beside it; PodiumBoard is a declared token-free art island.
The pedestal's **ticket notches are two circles half-outside the stand**, clipped by its
own `overflow-hidden` so what shows is a bite from the edge rather than a dot on top.
Sized `h-3 w-3` for the SHORTEST stand (#3 is `h-7`) or they would meet in the middle
there. **Verified they add ZERO scrollable overflow** — a clipped box still reports a
bounding rect, so the honest test is `scrollWidth` on a 375px stage, and it is byte-equal
to the points board's.

**The podium glow follows the metric.** It was hardcoded gold, so the violet spend podium
sat under a gold halo — the one element still saying "points" on a screen that had
otherwise changed colour completely. Found by rendering, not by reading.

**The empty ring is filled with `spentSharePct`** — `spent / (spent + points)`, i.e. how
much of everything earned this semester has been cashed in (the same arithmetic UsePoints
already shows you about yourself). An unfilled ring read as something that had failed to
load. The meta line under the name reads the same figure out: **"Lv 3" on one board,
"60% cashed in" on the other**, which makes that one slot another tell for which board
you are on.

Verified by probe route at 375px (removed, residue-checked): switcher `aria-checked` and
fill flip correctly, rings render gold vs violet at correct percentages, notches clip on
all three stands, champion glyph and meta line differ per board. **Not verified on a real
authenticated screen.**

Mobile fit + the profile cover (2026-09-01). Decisions (user): **global clip AND fix the
glow** · **chip stays under the title, just stop it wrapping** · **rebuild the profile
sheet header, make the stat tiles safe, tighten the rhythm, add a header photo**.

**Nothing clipped horizontal overflow anywhere in this app, and one decoration was
enough to crop every screen.** `body` now carries **`overflow-x: clip`**. `clip`, NOT
`hidden`: `overflow-x: hidden` silently turns the element into a scroll container, which
breaks `position: sticky` — and the Shell header, AwardBar and the roster all depend on
it. `clip` also legally takes a per-axis value where `hidden` does not, so
`overflow-y` stays `visible` (verified in the browser: body computes
`overflow-x: clip / overflow-y: visible`, page still scrolls vertically).
**That is the backstop, not the fix.** The actual offender was PodiumBoard's glow, which
is `w-[130%]` by design and measured **414px of scroll width inside a 360px box**; its
wrapper now has `overflow-x-clip` (X only, so the champion's crown still floats above the
card at `-top-9`). Measured after: both boards report `scrollWidth === clientWidth === 375`.

**`SnapshotChip` needed `whitespace-nowrap`, and this was a self-inflicted regression.**
It had always sat alone on a full-width row; moving it under the leaderboard title put it
in a narrow flex column, "next 3h 1m" wrapped onto three lines, and a `rounded-full` pill
around three short lines renders as a **circle**. Measured: 110×24 single line after,
~54px tall before. Any pill-shaped chip that can land in a narrow flex parent needs
`whitespace-nowrap` + `shrink-0`.

**The profile sheet rendered the rank TWICE** — detached at the top-right of the header
AND as one of the three stat tiles. The top-right copy was also the first thing to be cut
off on a narrow phone. Deleting it fixes the crop and the duplication together; the tile
is the one that survives, because it sits with the two figures it belongs with.
**`StatTile` gained `min-w-0`**: a grid item defaults to `min-width: auto` and so refuses
to shrink below its content, which is what let a wide figure push the three-up row out of
the sheet instead of the row adapting. The XP line got `min-w-0 truncate` on the left and
`shrink-0` on the right — the right-hand figure ("62 to next") was the half being cut,
and it is the half a student actually wants. Rhythm is now one `space-y-4` on the
container instead of nine repeated `mt-4`s.

Since 0039 (Profile header photo): `students.header_url`, one nullable column and nothing
else. **Deliberately NOT `banner_urls[0]`** — that array is the up-to-three photo STRIP
(0015), and taking its first slot would silently change what the strip shows for every
student who already has photos. No RPC to touch: `getPublicProfile` selects from
`students` directly, so there is no return type to grow; RLS is row-level so a new column
needs no policy change; and `cp_nightly_backup` mirrors the table wholesale and self-heals
on schema drift. Uploads reuse `uploadHeaderPhoto` → the same `avatars` bucket,
`BANNER_MAX_PX` downscale and the **same `MAX_AVATAR_BYTES` 5 MB constant** as the avatar
and showcase photos — a second limit would only ever drift from the bucket's own
server-side 5 MB cap. The cover is tappable-to-change on your own profile with the remove
behind a ConfirmDialog; on someone else's it renders read-only with a scrim so the avatar
and name stay legible over any photo, and falls back to a plain gradient when unset.

Profile polish (2026-09-01). Decisions (user): **drag to reposition anytime** · **80px
avatar overlapping the cover** · **split into three cards** · **section labels, rhythm,
overlay Remove-cover, merge the photo buttons, and fix the cut-off preview**.

**The padding bug was structural, so the fix is structural.** Converting Profile's one
Card to `pad="none"` for the cover meant hand-padding each child, and everything after
the fields — Bio, Interests, Photos, Achievements — was missed and rendered flush to the
card edge (the `pb-5` also ended up on a block that was no longer last). It is now
**three cards — Identity / Details / Showcase** — each owning its own padding, so there
is no longer a way to add a block and forget to pad it. Measured after: 17px inset on
both sides where it was 0.

Since 0040 (Cover position): `students.header_pos smallint not null default 50`, CHECK
0–100, rendered as `object-position: 50% <n>%`. **A focal point, not a cropped upload** —
cropping in the browser needs no column but throws the original away, so changing your
mind later means finding the file again; storing a position keeps the full image and
makes the cover adjustable forever, which is what "adjustable" has to mean to be worth
building. **Horizontal position is deliberately not stored**: the cover is a wide short
strip, so there is vertical slack and no horizontal slack on nearly every photo.
`setHeaderUrl` resets the position on BOTH set and clear — a new cover is a different
picture, and inheriting the last one's angle drops it in framed for a photo that is gone.

**`components/profile/CoverPhoto.tsx` is the one definition**, used editable on Profile
and read-only in the preview sheet, so a cover cannot be framed differently depending on
who is looking. **The drag commits from a REF, not from state** — the first version read
`livePos` in the pointerup handler, which closes over its own render, so a move and a
release inside one React batch left it null and the reposition was silently dropped.
Normal use interleaves frames and works, which is the worst version of that bug: it would
have surfaced as "sometimes my cover doesn't save". Caught by simulating pointer events,
not by reading. `touch-none` is load-bearing — without it the browser claims the vertical
gesture as a page scroll and the drag never fires on a phone, the only place it matters.
A move under 4px is a TAP (opens the picker) rather than a 2% nudge that saves itself.

**The preview sheet's cover is INSET, not bled.** It used `-mx-5` to cancel the scroll
area's `px-5`, and that is what was cutting off the avatar ring and the right edge:
the Sheet body is `overflow-y-auto`, and **per spec when one overflow axis is not
`visible` the other computes to `auto`** — verified in the browser, a container declaring
only `overflow-y-auto` reports `overflow-x: auto` — so the bleed pushed content outside a
scroller that then clipped it. A rounded inset cover needs no bleed and cannot clip.

**The avatar's "Change photo" row is gone.** The avatar was already the affordance; the
row duplicated it. It is now 80px with an always-visible pencil badge — always-visible
because a hover overlay is invisible on the touch screens this is used on — and a small
`×` for removal, matching the deliberate small-and-destructive call already made for
PinnedBadges' Unpin and the photo strip's remove (a 44px target there invites the
accidental taps its size prevents). Removal still routes through ConfirmDialog.
Section headings use the `SectionLabel` primitive rather than four hand-written copies of
`text-sm text-muted`, and its `action` slot now carries the achievements "View all" link.

Celebrations + the Sheet focus bug (2026-09-01). Decisions (user): **keep the level-up
content minimal, rebuild the motion** · **all four motion layers** · **tap anywhere, no
auto-dismiss** · **match the achievement burst, stop them stacking, fix the overlap**.

**THE SHEET STOLE FOCUS ON EVERY KEYSTROKE — 21 sheets, reported as "typing in Bio goes
to Display name".** `Sheet`'s focus-trap effect depended on `[open, onClose]`. Most
callers pass an inline arrow (`onClose={() => setEditOpen(false)}`), a new identity every
render — so any state change inside a sheet re-ran the effect, and its `focusFirst()`
moved focus to the panel's FIRST focusable element. Type one character into Bio, the
parent re-renders, the next character lands in Display name. `onClose` now lives in a ref
and the effect depends on **`[open]` alone**. The same class of bug is worth watching for
anywhere an effect lists a callback prop: `PullToRefresh`, `SuccessTick` and
`AbsenceExcuses` all do, though their call sites currently pass stable callbacks
(`QrScanner`'s `onDetect` is `useCallback`'d at its only call site — not a bug today, but
one inline arrow away from restarting the camera on every render).

**Neither celebration auto-dismisses any more.** Both said "Tap to continue" and then
vanished anyway (3.6s / 4.2s) — copy promising control the screen did not give, and a
student with the phone in a pocket simply missed it. Both now wait for a tap, behind a
**700ms TAP_GUARD** that is NOT an auto-dismiss in reverse: these fire while a finger is
already on the glass, and without it the tap already in flight skips the moment before it
draws a frame. Verified: a tap inside the guard is ignored, the screen is still up 4.2s
after the old timer would have fired, and a real tap closes it.

**The two bursts could render on top of each other** — a single award can trip a level
AND a badge, both full-screen `z-50`, with the level-up's backdrop over the badge art.
`AchievementUnlockOverlay` is now gated on `levelUp === null`, so the badge waits its
turn. Safe only because neither auto-dismisses now; with timers this would have hidden
the badge entirely.

Level-up motion is layered and each layer is opt-out: confetti (the existing
`ConfettiBurst`), rotating light rays, an 18-star particle ring, a medallion that slams
with a squash and then takes a shine sweep, a number that counts from the previous level
(derivable — a level-up is always one step, so this needed no new data), an XP rail that
fills to full and empties into the new level, and an impact flash plus a short shake.
`<MotionConfig reducedMotion="user">` neutralises the framer-motion layers, and `reduced`
additionally drops the shake and flash **outright** — a shaking screen is the effect most
associated with motion sickness, so shortening it is not enough.

**The avatar/cover overlap was a number copied between two different containers.**
Profile's cover is full-bleed and square-cornered inside an `overflow-hidden` card, where
a 44px lift on an 80px avatar sits cleanly. The preview sheet's cover is inset and
`rounded-2xl`, so the same 44px put the avatar on the bottom-left corner radius and
squared it off. Measured the fix rather than eyeballing it: radius is **16px**, so `pl-3`
(12px) still painted over the curve and `pl-5` (20px) clears it — `clearsCorner: true`,
lift reduced to 32px.

**The profile name was painted UNDER the cover, and the cause was paint order, not
spacing (2026-09-01).** The header was a flex row lifted as a unit (`-mt-11`), which put
the name inside the cover's box — where `CoverPhoto` is `position: relative` and the row
was static, and **positioned elements paint above static ones regardless of DOM order**.
Confirmed with `elementFromPoint`: the top element at the name was the cover's `<img>`,
and `nameIsHitTestable` was false. The avatar survived only because it already sat in its
own `relative` wrapper.

**Bottom-aligning the text to a lifted avatar cannot fix this** — with `items-end` the
largest lift that keeps the text clear is `avatarHeight − textHeight`, about 31px, which
is barely an overlap at all. Measured: at `-mt-17` the name cleared but the avatar
overlapped by only 14px. **So the avatar is ABSOLUTELY positioned** — its overlap no
longer depends on how tall the text happens to be — and the text is indented past it, so
neither can collide with the other at any name length. Measured after: Profile 40px
overlap, sheet 36px, and on both the name clears the cover vertically AND the avatar
horizontally with a 12px gap.

The sheet additionally needs `left-5`, because its cover is `rounded-2xl`: 20px clears the
16px radius where 12px still painted over the curve. **Profile's cover is square-cornered
and needs no such inset, which is why that number is deliberately NOT shared between the
two — copying it between containers is what caused this bug in the first place.**

**`Select` swallowed its caller's layout, and all three sizing call sites were wrong
(2026-09-01).** The primitive's root is `<div className="w-full">` while `className`
lands on the inner `<select>`. So `className="max-w-34 shrink-0"` in a flex row capped
the visible control at 136px while the WRAPPER still spanned 291px — and because the
chevron is `absolute right-3` **of the wrapper**, it detached from the control and floated
143px past its right edge, on top of whatever sat there. Measured before/after: wrapper
291 → 136, chevron 143px outside → 12px inside.

Both leaderboards and the spend board passed sizing this way, so all three had it from the
day they were written; it only became visible when the student header got tight enough for
the stranded chevron to reach the settle-countdown chip. The fix is a **`wrapperClassName`
prop**: sizing (width, max-width, flex) goes to the wrapper, appearance (height, text size)
stays in `className`. A single `className` cannot serve both — `h-9!` belongs on the
control and `max-w-34` belongs on the box that lays out.

**This is the same shape as the `cn()` bug from Era 6.0 Phase 2**: a caller's intent
silently failing to reach the element that acts on it. Worth checking any primitive that
wraps its control in a layout div — the caller's `className` may not be landing where they
think it is.


Since 0042 (The Student Lounge — Student Space Phase 3): `lounge_posts` (one shared
feed, semester-scoped by the 0029 default), `lounge_ws`, `lounge_replies`. All three are
SELECT-only to authenticated; every write goes through a `security definer` RPC, so the
banned-word filter (reused from 0020, one word list), the rate limits and the 0041 timeout
cannot be skipped. Deletion is SOFT throughout.

**Only `lounge_posts` is published to realtime, and that is a design choice not an
omission.** `w_count` and `reply_count` are trigger-maintained columns ON the post, so a W
or a reply fires an UPDATE on the post — publishing the other two tables would triple the
traffic to learn the same fact. The client therefore subscribes to one table for three
kinds of change.

**New posts never splice into the list.** A realtime INSERT only increments a counter,
which surfaces as a "N new posts" pill; the list changes when the reader asks. Content
shifting mid-read is how you tap the wrong post’s W button on a phone. The UPDATE handler
patches ONLY `w_count`/`reply_count`/`hidden_at`/`pinned_at` from the payload — `i_gave_w`
and `can_delete` are computed PER VIEWER by the RPC and do not exist on the raw row, so
spreading the payload blind would wipe them (the same trap StudentData documents for
`lifetime_points`).

**Limits, mirrored in types.ts:** 600 chars · 5 text posts/24h · 3 shoutouts/7 days with
at most one per classmate · 3 Ws. The W allowance counts LIVE rows, so un-W-ing REFUNDS
it — three a day with no undo would make a mis-tap cost a third of the allowance. Read it
as "you can be backing three posts at a time". `post_to_lounge` also carries a DUPLICATE
GUARD (same body, same student, 5 minutes): a retry after a timeout that actually
succeeded would otherwise burn one of five with no edit available.

**A hidden post loses its BODY server-side** (`case when hidden_at is not null and not
is_instructor()`), in all four feed functions. Returning the text and trusting the client
not to draw it would make moderation a rendering preference. 0044 sets `hidden_at`.

**Class Pulse triggers hang off the TABLE, never the function.**
`refresh_leaderboard_snapshot` has changed owner three times (0023→0029→0037→0038), each
move re-copying a growing body; `trg_pulse_podium` on `leaderboard_snapshot` gets the same
signal with nothing to drift from. Its guard `OLD.rank is not distinct from 1` is
load-bearing: the 0038 upsert sets `rank = excluded.rank` on every refresh, so `update of
rank` fires twice a day for everyone and without that line the feed would fill with "X is
now #1" forever. Both triggers no-op entirely while no section has `space_enabled`, so
opening the beta later does not reveal months of backlog. Voice is NEUTRAL AND FACTUAL
(the user’s call).

**`list_lounge_classmates()` exists because `listStudents` must never be called from the
student app** — that one joins `student_secrets` to merge claim tokens for the
instructor’s roster, so using it to build a shoutout picker would ship every classmate’s
claim token over the wire. The RPC returns id/display_name/avatar_url and nothing else.

Client: `src/lib/api/lounge.ts`; `components/space/` (PostCard, PostComposer, WButton,
BetaBanner, AstronautArt); `/app/space/lounge` and `/app/space/post/:postId`. The post
detail is a ROUTE, not a sheet, because the shoutout notification needs somewhere to
point. Pinned posts come from their OWN function and are EXCLUDED from the chronological
query — folding them in means either a duplicate or a cursor that special-cases page one.


Since 0043 (Student Space messaging — Phase 4): `space_rooms` (one per beta section, one
`global` per semester, plus `dm`), `space_room_members` (DM rooms ONLY — section and global
membership is derived, so there are no rows to fall out of sync when a student is promoted),
`space_messages`, `space_message_reactions`, `space_mentions`, `space_room_prefs`.

**THE DM PROMISE IS THE SHAPE OF `cp_can_read_room()`.** Its `dm` branch resolves to
membership and the instructor branch deliberately does NOT cover it — so RLS gives the
instructor nothing in a DM they are not in. Their only path is `read_dm_thread()`, which
writes an `audit_log` row BEFORE returning a message. Widening that one `or` would silently
void the promise the DM screen makes to students, app-wide, with nothing failing. 0043’s
verify step 2 tests exactly this.

**There is no read-receipt column anywhere, and that is why "no seen" is true rather than
merely unimplemented** — a column that exists gets rendered eventually. Unread lives in
`src/lib/unread.ts` as a localStorage pointer compared against `space_rooms.last_message_at`.
Its two load-bearing rules, both pinned: the pointer NEVER moves backwards (two tabs would
otherwise resurrect a cleared badge), and `unreadDividerIndex` returns -1 when EVERY message
is unseen — a "New messages" line at index 0 has nothing above it and reads as a bug.

**Reactions are stored as CODES (‘like’, ‘fire’…), never as the emoji.** ❤️ is U+2764 plus a
variation selector, so a CHECK against the glyph fails the moment any layer normalises the
string and the reaction silently does not save. `CHAT_REACTIONS` in types.ts is the only
place a glyph appears, which also makes changing one a client edit rather than a migration.

**`space_message_reactions.room_id` is denormalized for realtime, not for reads.** A
`postgres_changes` filter is single-column equality, so without it every reaction anywhere
would be pushed to every open room. Two tables are published here where the Lounge
publishes one — the trade differs because a chat subscription is scoped to ONE room and
filtered, so its traffic is bounded.

**@mentions are resolved by the CLIENT and validated by the server.** `send_message` takes
`uuid[]`; parsing the body in SQL would mean the database guessing which "Maria" was meant.
`src/lib/mentions.ts` CONSUMES each match as it is found — sorting longest-first is not
enough on its own, and without consumption "@Maria Santos" resolves to both Maria Santos
AND Maria, pushing to the wrong person. Its own test caught that.

**The chat composer uses `StickyBar`, not a bounded flex column.** The plan called for
`h-[calc(100dvh-…)]`, which needs a number that must agree with Shell’s paddings on two
breakpoints. `StickyBar` (`sticky bottom-19 md:bottom-4`) already exists for exactly this
and keeps the tab-bar height in one place. Measured at 375×812: composer clears the last
message with no overlap and sits inside the viewport.

`cp_room_post_block()` returns the REASON a student cannot post (space state, timeout,
announce-only, slow mode) or null — one answer, so the composer’s disabled state and the
send itself can never disagree. **The timeout exception lives there**: a muted student may
still post in a DM whose members include the instructor, because otherwise their only way
to appeal a mute is in person.

Retention: `cp_purge_space_messages()` daily at 03:25 UTC, 90 days.


Since 0044 (Student Space moderation — Phase 5): `space_reports`, auto-hide, and the
instructor queue. **This is the file that has to be applied before Student Space is opened
to anyone but the instructor** — 0042 and 0043 give students places to write, and this is
the only thing that lets a bad afternoon be undone without the SQL editor.

**ONE QUEUE ITEM PER TARGET, NOT PER REPORT.** `unique (target_type, target_id, reporter)`
gives one report each; the queue GROUPS by target, so seven people reporting one post is one
item that says "7" and lists who. `count_open_reports()` counts distinct targets for the
same reason — a badge reading 7 for one post would be a lie about how much work is waiting.

**Auto-hide at 7 counts UNRESOLVED reports only.** After a restore the pile starts from
zero, so a group cannot re-bury a post by adding one more report to an old stack. 0044’s
verify step 4 tests exactly that, and it is the one that would fail silently.

**A reported DM shows its reason and reporters but NOT its text.** Reading it means
`read_dm_thread()`, which writes an audit row. If the queue printed the body, every DM
report would be a silent break-glass and the promise on the student’s DM screen would be
false in the one case it is most likely to be tested.

**`report_content` refuses a target the caller cannot SEE** (`cp_target_visible`). Without
that check a student could report by id alone and manufacture an auto-hide on content they
were never shown — including inside a DM they are not in.

**A bug 0043 shipped with, caught before it was applied:** `read_dm_thread` inserts
action = 'space_break_glass', which was NOT in 0041’s `audit_log_action_check`. The first
break-glass read — the most important safety path in the feature — would have died on a
check violation. 0043 now widens the constraint itself, re-listing every earlier value.
**Any migration that writes a NEW audit action must widen that constraint in the same
file**, and re-list the rest.

Client: report flow in `components/space/ReportSheet.tsx` (fixed reasons + optional note,
300 chars, `text-base` so iOS does not zoom); Report buttons on `PostCard` and `MessageRow`,
shown only when the row is NOT yours; `features/instructor/ReportsInbox.tsx` as a FOURTH tab
on /teach/redemptions, where the badge already lives. Timeouts are offered as 1 hour / 1 day
/ 7 days plus a custom box, and go through 0041’s `timeout_student`, which caps at 90 days.
Resolving notifies every reporter that it was reviewed, WITHOUT the outcome — what happened
to another student is between them and the instructor.


Since 0045 (Random Events — Student Space Phase 6, the last): `lounge_events` +
`lounge_event_answers`. Two modes, one column apart: `answer_key` SET means correct answers
are paid automatically on close; NULL means open-ended and the instructor awards by hand at
the event’s own point value (one tap, no picker).

**ANSWERS ARE SEALED UNTIL CLOSE, ENFORCED TWICE.** The RLS policy on
`lounge_event_answers` grants a student their OWN row plus everything once
`status = closed`; `get_event_answers()` says the same thing independently. The feed shows a
count and the count is all the database will give it. Without this the first correct answer
is copyable and auto-award pays the fastest COPIER rather than the fastest thinker — which
is the trap the whole design is built around.

**CLOSING IS THE ONLY THING THAT PAYS, AND IT IS IDEMPOTENT.** `cp_close_event_core()`
takes `for update` on the event and returns 0 if it is already closed. THREE things can
close one — the instructor, the per-minute cron at `closes_at`, and a retried request — and
any two racing must not pay twice. Same guard on `award_event_answer`, keyed on
`point_event_id` already being set.

Winners are the first `winner_cap` correct answers ordered by `(created_at, id)`. The id is
not decoration: a timestamp alone is not a total order, and two answers in the same
millisecond would rank differently in the client preview than in the database.

**`src/lib/lounge-answers.ts` MIRRORS `cp_event_normalize()` AND IS PINNED BY A TEST.** The
instructor previews who would win before closing; the database decides who is paid. A drift
makes that preview a lie about real points. The subtle half is that punctuation is REMOVED,
not replaced with a space — "run-time" normalises to "runtime", and swapping that one
character in the JS fails four tests. Change one side, change the other, same commit.

**`point_events.category` gains `event`** (constraint name preserved, all earlier values
re-listed). `point_events_points_check` needed no change — its `category <> ‘redeem’` branch
already allows 1..100. Reusing `activity` would have been free and was rejected: the ledger
is the one place in this app that has to stay answerable about where points came from.
Widening the union surfaced two call sites at compile time — `PointsHistory`’s
`Record<PointCategory, …>` legend and `database.types.ts` — which is exactly what a union
that narrow is for.

**No notification is queued on an event payout.** `cp_notify_point_event` (0017) already
pushes for a `point_events` row; queueing another here would double-notify. Same rule
`commit_attendance_penalties` follows.

Client: `src/lib/api/events.ts` — **nothing in it can return `answer_key`**, which is a real
column on a table the client may select, so every read path in 0045 reports only `has_key`.
`components/space/EventCard.tsx` pins the open event above the Lounge feed with a live
countdown; `features/instructor/EventComposer.tsx` sits at the top of /teach/space, above
the gate controls — events are used weekly, the gates once.


Chat UI rework (2026-09-02, no migration) — from real beta use, six things:

**The instructor could not see chat at all.** Every chat screen lived under `/app`, which is
`RequireRole role="student"`, so the instructor was redirected to /teach. The DATABASE always
allowed it (`cp_can_read_room` returns true for them on global and section rooms) — only the
screen was missing. `Chats` and `ChatRoom` now take a **`basePath`** prop and are mounted a
second time under `/teach/space/chats` and `/teach/space/chat/:roomId`. ONE implementation,
two mounts: the alternative was a parallel instructor copy, and every parallel copy in this
codebase has drifted. `Chats` hides its "message your instructor" row when `basePath` is not
a student path, and `ChatRoom` uses `useStudentDataOptional()` — undefined in the instructor
area, which is also how "is this message mine" is decided there (author_student_id IS NULL).

**"React · Reply · Report" under every message was the single biggest source of noise** —
three words of chrome per line, which at group-chat density doubled the visual weight of the
room. They now live in a floating toolbar that is ABSOLUTELY POSITIONED (so it costs the
message no vertical space) and appears on hover, or on a 420ms long-press on touch. A
pointermove beyond 8px cancels the press, or scrolling would open every message it passed.
Measured after: 18 action buttons in the DOM, 0 visible, rows 48px.

**The sticky header is a bug fix, not a polish item.** In a long room the header scrolled
away and took the BACK BUTTON with it — there was no way out of a conversation without the
browser. It is `sticky top-0 z-20` with negative margins so the blur spans the content width.

**Enter sends, Shift+Enter is a newline.** Guarded with `!e.nativeEvent.isComposing`, or an
IME candidate selection would fire a send mid-word — which is how this breaks for anyone
typing a language with an input method.

**Auto-scroll only when already at the bottom.** `atBottomRef` (a ref as well as state, so
the realtime handler reads it without re-subscribing) gates whether a new message scrolls
into view; otherwise it increments a "N new messages" count on the jump-to-latest button.
Yanking the view while someone reads older messages is the most irritating thing a chat can
do. Plus date separators, and a tappable reply-quote that scrolls to the parent and rings it.

**The typing indicator is Realtime BROADCAST, not a table** (`src/lib/typing.ts`). Writing
keystrokes to Postgres would be hundreds of rows a minute for information worthless two
seconds later — and it would leave a permanent record of when each student was at their
keyboard, which is exactly the surveillance the no-read-receipts decision exists to avoid.
Broadcast touches no table and persists nothing. Throttled to 2.5s and expiring at 5s, and
the test pins THROTTLE < TIMEOUT: invert that and an indicator flickers off while someone is
still typing.

⚠ **Two false alarms during verification, both the documented compositing artifact:** a
`transition-opacity` toolbar and a `transition-colors` border both reported their
PRE-transition computed value while the Browser pane was hidden, so the toolbar looked stuck
at opacity 0 and the over-limit border looked like `--line`. Inject
`*{transition:none!important}` before reading colour or opacity, per the note in the Era 6.0
Phase 6 section. Do not "fix" what is already right.

Message rows — Instagram structure at Discord density (2026-09-02, no migration).
Decisions (user): **Instagram inspo mixed with the Discord density already there** ·
**left-aligned for everyone** · **ASCII art supported** · **Level and the XP ring only —
no streak on a message row**.

**THERE ARE NO BUBBLES — messages sit on the plain canvas (the user's call, 2026-09-03).**
The "cluttered highlighted my message" complaint was a background FILL, and two rounds
proved a lighter fill was not the fix: a bubble has to be painted on every line, so a run
of three rendered as three grey slabs and a busy room as a wall of boxes. What survives is
**marks on a flat surface, each one meaning something** — 2px accent rule = yours, 2px gold
rule = the instructor, blue tint = you were @mentioned, red tint = hidden by moderation,
card fill = the row you are hovering or holding. Measured after: a continuation row is
**28px**, a run-start row 44px, and a plain row's background computes `rgba(0,0,0,0)`.

**The identity rule is a positioned SPAN, not `border-l`.** A border follows the box's own
`rounded-xl`, so each message in a run bowed inward at both ends and three consecutive
messages rendered as three parentheses. The span bleeds into the 2px inter-message gap
(`-bottom-0.5`) unless it is the last of the run, so a run reads as ONE unbroken line —
verified by measuring the segments: consecutive bars touch at exactly 0px.

**Everyone is left-aligned, including you.** Right-aligning your own messages leaves each
side ~78% of the column, and this room carries ASCII art and emoji walls that want the
whole width. The avatar sits beside the **LAST** message of a run — **yours included**.
Hiding your own avatar made the room read as something happening to other people (the
user's report), and it is the message a reply lands next to. The name header shows on the
first of every run for the same reason: your rank medal and section dot are part of the
fun, and there is no reason you should be the one person who never sees their own.

**Per-message timestamps are gone; the room prints a centred divider on a ≥30-minute gap.**
At this density a time on every row was more chrome than content.

**Actions are a floating toolbar, absolutely positioned, so they cost the message no
height.** Hover on mouse, **420ms long-press** on touch, with a **>8px pointermove
cancelling the press** — without that, scrolling opens the toolbar of every message it
passes. Measured: 12 toolbars in the DOM, 0 visible, 134×26 when opened and inside the
viewport.

**A mention is `info`, deliberately NOT `accent`.** Accent is already the rule down your own
run, so an accent tint made someone else's message read as one of yours — and a red wash
reads as an error besides. A blue band is unambiguous against own (accent rule), instructor
(gold rule) and hidden (danger tint).

**With no bubble, anything that needs a surface must bring its own.** The mono block went
`bg-canvas/70` → `border border-line bg-card` (it was invisible against a flat canvas) and
reaction pills went `bg-canvas` → `bg-card`. The reaction row also lost its `-mb-2.5`: that
negative margin existed to tuck the pills under the bubble's bottom edge, and with no edge
to hide behind it put a pill on top of the next message.

**A hairline separates SPEAKERS, and it is the flat layout's cost of doing business.** With
nothing drawn, a busy room is one continuous column of text. The rule is rendered by
ChatRoom (not the row) wherever the author changes and nothing louder — a time divider, the
unread divider — is already being drawn, and it is indented `ml-9` past the avatar gutter so
it separates the TALK rather than cutting the whole row in half.

**Double-tap sends a 🔥, and the two touch gestures cannot collide:** `DOUBLE_TAP_MS` (320)
is comfortably under `LONG_PRESS_MS` (420), so a held finger opens the toolbar and two quick
taps react. It is counted from `click` so a phone and a mouse take one path, and it bails
when the tap landed on an `a` or `button` — otherwise following a link also reacted.
⚠ **A synthetic `new MouseEvent('click')` does NOT reach a React 19 handler unless it
carries `view: window`** (and realistic coordinates). Half an hour went into "the handler is
not firing" when the handler was fine and the test event was malformed — call the handler
off `__reactProps$…` to tell the two apart.

**Links and @mentions are styled by `parseInline` in `message-body.ts`, and its regex is a
SECURITY boundary.** The matched text becomes an `href`, so only `http`, `https` and bare
`www.` are matched — a pattern loose enough to catch `javascript:` or `data:` would turn any
message into a script the reader taps. Pinned by a test that walks three such schemes.
Mentions are matched against **the names the caller supplies**, never a bare `@word`, for
the reason `mentions.ts` already documents: an app where "@everyone" lights up like a real
person is lying about who was notified. Longest name wins at a tie (so "@Maria Santos" is
not a mention of "Maria" plus a stray "Santos"), and a hit overlapping an earlier one is
dropped, so a name inside a URL cannot split the link. Links use `[overflow-wrap:anywhere]`
rather than `break-all` — a long URL must still break, but a short one should not be chopped
mid-word. Links are `accent` because Era 6.0 Phase 10 already put inline links on that role.

**The level chip beside a name is MUTED, not reward gold.** Gold is the level's colour
everywhere else in the app, but at rank 1 the medal is also gold and the two chips blurred
into one. The medal is the rarer fact, so it keeps the colour.

**The top-three rank is a tinted `#N`, not a 🥇.** UI chrome in this app uses icons rather
than emoji, and at `text-2xs` a colour-emoji medal beside its own rank number rendered as a
smudge followed by a redundant "1". Reaction glyphs stay emoji — those are content.

**`src/lib/message-body.ts` + its test decide what becomes monospace.** Explicit ``` fences
always win; otherwise a block is promoted when it is ≥50% line-art characters over ≥40
non-space characters AND contains a newline. **The detector must never fire on an emoji
wall** — emoji are not in the art class, so the ratio stays near zero, which is the property
the test pins (a wall of 😂 in a scrollable mono block would look broken in a way nobody
would report). Measured ratios: a drawn figure 0.97, a bar pattern 1.00, prose 0.04, emoji
0.00. **The length floor was picked by measuring, not by feel** — at 60 it rejected both
real drawings in the fixtures (48 and 59 dense characters). An UNCLOSED fence stays literal
text rather than swallowing the rest of the message. The mono block owns its own
`overflow-x-auto`, so art keeps its shape and still cannot push the page sideways.

**`get_space_people()` replaced `list_lounge_classmates`** — one roster fetch per room feeds
the XP ring, the rank medal, the section dot AND mention resolution. `listStudents` must
never be called from the student app: it joins `student_secrets` to merge claim tokens for
the instructor's roster.

**Type sizes in Space use the named steps only.** `text-[8px]`/`[9px]`/`[10px]`/`[11px]`
crept back in while these screens were being built; they are `text-2xs` and `text-xs` now,
per Era 6.0 Phase 4 (104 arbitrary sizes → 5 named steps, zero remaining).

Since 0046 (The room panel): `space_pins` — several pinned messages per room instead of
0043's single `space_rooms.pinned_message_id`, capped at **10 inside `pin_message`** (a
CHECK cannot count sibling rows). Instructor-only to pin, exactly as 0043 already required.
**`pinned_message_id` is NOT abandoned and is NOT a second source of truth:**
`list_my_rooms` already returns it and changing that return type means a drop-first +
re-grant dance for a column nothing renders, so the pin RPCs keep it pointing at the NEWEST
pin and are its only writers. Existing single pins are backfilled. **Ownership move:
`pin_room_message` 0043 → 0046**, kept as a thin delegate rather than deleted — two ways to
pin is exactly how the list and the column would drift. No `audit_log` row, so
`audit_log_action_check` needed no widening.

**`components/space/RoomRail.tsx` is ONE component with TWO mounts** — the desktop rail
beside the thread and the sheet behind the ⋯ button on a phone. A parallel mobile copy is
how the two drift, and this codebase has four separate cases of exactly that.
**Everything in it is DERIVED, not fetched**, except pins: members come from the roster
`ChatRoom` already loads for the XP rings and mentions, and Shared / search / @You are read
out of the messages already on screen. The consequence is stated ON SCREEN rather than
hidden — search and Shared cover the loaded history, and the panel says so.
`getRoomAudience` needs **no new RPC**: `space_rooms` carries a SELECT policy gated on
`cp_can_read_room()`, so `section_id` is readable directly, and only a `dm` has real member
rows. **"Top of the room" is hidden below 8 members** — under that the top five ARE the
room, and printing them twice is the redundancy that makes a panel feel like filler.

**`Shell` gained `wide`, and it grows to the RIGHT ONLY** (the user's call, after a first
attempt that removed both caps and slid the whole shell to x=0). The left margin is the one
a centred `max-w-6xl` would have had — `ml-[max(0rem,calc((100%-72rem)/2))] mr-0` — so the
sidebar does not jump sideways when you open a room and jump back when you leave it; only
the dead strip on the right is spent. **`w-auto`, not `w-full`:** with a left margin,
`width: 100%` measures the full viewport and is then pushed right by the margin, which
overflowed the page by exactly that margin (measured: `scrollWidth` 2252 in a 1885 viewport).
The rail grows with the viewport (`15rem` at `lg`, `18rem` at `xl`, `22rem` at `2xl`) rather
than the thread taking all of it. **`src/lib/routes-shape.ts` decides which routes are
wide** and is pinned by a test: `ChatRoom` is mounted twice (student and instructor), so it
matches the shared tail rather than either prefix, and the room LIST deliberately stays in
the reading column.

**When `wide`, the whole chain from `<main>` down to the routed screen is a column flex**,
with the message list as the `flex-1` child. That is what pins the composer to the bottom of
the viewport in a room with three messages in it — the thread takes the slack instead of the
composer floating up to meet the last message. The height comes from the `min-h-[100dvh]`
the shell already has, so nothing has to agree with a `calc(100dvh - …)`. Reaching the route
wrapper needs `[&>.cp-route-in]:flex-1` — `RoutedOutlet` owns that div and cannot be given a
class from the layout.

⚠ **`lg:grid-rows-[minmax(0,1fr)]` on the room grid is load-bearing.** Without an explicit
row the grid sizes it to content, and the rail — capped at a viewport-relative height —
became the tallest thing in the row and pushed the PAGE 45px past the viewport in a
two-message room. The cap is also `10rem`, not `7rem`: 6rem is the sticky offset and the
rest is the chrome above and below it (main's `pt-8`/`pb-12` plus the gap). At `7rem` the
rail was taller than the space it sits in. Measured after: a two-message room scrolls 0px,
a 24-message room scrolls 295px, and the rail is 778px tall in both.

**On a phone the panel is a FULL SCREEN with a back button, not a bottom sheet** (the
user's call, from a Messenger reference). It is a destination — who is here, what is
pinned, what was shared — and a half-height sheet made a 40-person roster a scroller inside
a scroller. `Sheet` gained an additive **`variant="screen"`**: no backdrop, `inset-0`, a
sticky back bar carrying the only way out, and a push-in from the right instead of a rise
from the bottom. The ~21 existing sheets omit the prop and are byte-identical. The title
goes `sr-only` there, because the content brings its own identity block — 80px avatar, room
name, member count, and round Mute / Search actions — which is the shape the reference has
and which would restate the chat header one line above it on the desktop rail. Hence
`RoomRail`'s `variant`, not a second component.

⚠ **`requestAnimationFrame` is STARVED while the Browser pane is hidden, not merely
throttled.** A 90-frame wait timed out at 45s, and the screen panel sat at its `initial`
`x: 100%` forever — which looks exactly like a broken animation. Same artifact as the
compositing note in the Era 6.0 Phase 6 section, with a second symptom to recognise. To
measure a framer-motion panel's geometry, override `transform: none !important` and read
`offsetWidth`/`offsetHeight`, which ignore transforms.

Verified by a probe mounted INSIDE a real `Shell` (removed, residue-checked). At 1900×950:
a normal screen is unchanged (shell 374→1526, `main` still `display: block`); a room keeps
the same left edge and runs to the viewport edge, with zero horizontal overflow. Two
messages → page scrolls 0px and the composer sits at the bottom; 24 messages → scrolls
295px and the composer sticks 20px above the fold. At 375 the rail computes `display: none`,
the composer clears the tab bar in both cases, and the ⋯ button opens a 375×812 panel at
left 0 with a Back button.

**"View profile" IN CHAT OPENED YOUR OWN PROFILE.** It called `navigate('/app/profile')` —
there IS no route for someone else's profile; it is `StudentProfilePreview`, a sheet, the
same one the leaderboard opens. The button worked, went somewhere, and showed the wrong
person, which is the worst shape a bug can take: nothing errors and nothing looks broken.
ChatRoom now builds a `PreviewTarget` from the `SpacePerson` it already has and opens that
sheet, so a classmate's profile is identical wherever you tap it. `sectionLabel` became a
joined list rather than an interpolation (`{label} · Level N`), because a caller with no
section name to give — Global spans sections — otherwise rendered a stranded "· Level 3".

Room list + hub (2026-09-03, no migration). Decisions (user): **cards with presence** ·
**keep the message density, polish the edges** · **the Space hub next**.

**"Presence" here is TWO facts and they are deliberately not blurred.** TYPING is real and
live: `Chats` subscribes to every room's typing broadcast, so "Maria is typing…" appears on
the card before you open the room — only possible because typing moved to a shared topic.
RECENT is that the room had a message in the last 10 minutes; that is message recency, NOT
"people are online", which this app cannot know. It is a small dot at the corner of the room
glyph, LABELLED "Active in the last 10 minutes" rather than badged as "online". **A ring
around the whole avatar was the first attempt and was wrong** — it fought the unread card's
own accent border, and two coloured outlines on one 48px glyph is noise.

**The hub was two identical cards with a chevron** — a menu restating the nav. It now
answers the question you open it with: is anything happening? An open event (the only thing
with a deadline and the only thing that pays points) outranks everything, then the Lounge
card carries the newest post and the Chats card carries an unread count and the latest room.
Three reads, all off the critical path and each failing soft — a failed read costs a preview
line, never the screen, and every card still routes.

**THE TYPING INDICATOR NEVER WORKED, AND `uniqueChannel` IS WHY.** Typing rode the room's
`uniqueChannel('room-<id>')`, whose topic carries a random suffix so a remount cannot be
handed a dying channel. That is right for `postgres_changes` — those are SERVER-side
subscriptions, so two clients on `room-x-a1b2` and `room-x-c3d4` still both get the row
events, and everything else looked fine. **But BROADCAST is delivered to the TOPIC.** Two
people in one room were on two different topics, so a broadcast could never reach the other
and the indicator appeared for nobody. Nothing errored; the message went to a topic whose
only listener was the sender, who is excluded by default.
`src/lib/typing-channel.ts` gives typing a SHARED topic and answers the hazard three ways:
ONE `.on()` binding made at creation with consumers in a Set the handler fans out to (so
nothing calls `.on()` on a joined channel); refcounting; and a **DEFERRED teardown** (2s),
because a remount releases and re-acquires within a frame and a synchronous teardown is
exactly how the next acquire gets a channel that is still unsubscribing.
**`postgres_changes` stays on the unique channel — do not merge the two.**

**Anyone who can POST can pin (the user's call, 2026-09-03); only the instructor or whoever
pinned it can UNPIN.** 0046's gate is `cp_room_post_block()` returning null — the same one
answer the composer's disabled state reads — so a timed-out student cannot pin their way
around being muted, and an announce-only room stays the instructor's. Unpinning is narrower
because otherwise the first student to disagree can quietly remove the rules post.
`get_room_pins` returns a server-computed `can_unpin` rather than leaving the client to
re-derive a permission the RPC enforces anyway.

Since 0048 (Notification level per room): `space_room_prefs.level` — `all` / `mentions` /
`none`, defaulting to `mentions`, which is what every room did before the setting existed.
**`muted` is now `generated always as (level = 'none') stored`**, and that is the whole
trick: `list_my_rooms()` returns `coalesce(pref.muted, false)`, so growing its return type
would have meant a drop-first + re-grant of a 60-line function for a column the room list
already has. One writer, one derived reader, `list_my_rooms` untouched.
**Ownership moves `set_room_muted` and `send_message` 0043 → 0048.** The fan-out grows a
second audience: `direct` (mentioned, replied to, in this DM — 0043's behaviour) and `all`,
which is **driven by the prefs table**, not the roster, and excludes anyone already in
`direct` so one message cannot queue two rows for the same person. `everything` re-derives
membership from the ROOM rather than calling `cp_can_read_room()`, which answers for the
CALLER — here the question is whether the TARGET still belongs in the room.
**`send_message`'s 137-line body was copied forward programmatically, not retyped**; a
copy-forward of that size is exactly where a transcription error lives.

**THE EMPTY PEOPLE PANEL WAS A SILENT CATCH, AND THE RENAME BEHIND IT IS THE REAL LESSON.**
`get_space_people` REPLACED `list_lounge_classmates` inside migration 0042 during the chat
rework — an edit to a file that had already been pasted. Anyone who applied 0042 before that
edit has the old function and not the new one, so `listSpacePeople()` 404s. The client then
swallowed it (`.catch(() => {})`) and the panel reported **"Nobody else is in here yet"** —
a lie, told to the only person who could fix it, and the same class of bug as the attendance
screen that once told a student they had no record at all. It also explains a second
symptom: no `Lv N` chip beside any name in the thread, because that reads the same roster.
**Renaming a function inside an APPLIED migration is a silent breaking change.** A rename
belongs in a new numbered file, or the old name stays as a delegate. The fix now surfaces:
`peopleError` + a `Retry`, and the room-panel header shows the SERVER's `memberCount`, not
the length of a list that failed to load.

**Typing an @mention** — `mentionQuery` / `matchMentions` / `applyMention` in `mentions.ts`,
pinned by 8 more tests. The query is anchored to an `@` at the start or after whitespace, so
an email address never opens the picker, and it allows exactly ONE space because half this
class has a two-word name and "@Maria S" has to keep matching. **The trailing space
`applyMention` inserts is load-bearing**, not a nicety: `resolveMentions` requires the name
not to be followed by a word character, so without it the mention the picker just inserted
would not resolve. The popover is a real `listbox`, sits ABOVE the composer, and its options
commit on **`pointerDown`, not `click`** — the textarea's `onBlur` closes the picker and blur
lands first on a click. While it is open it owns Enter, Tab, ↑/↓ and Escape, or Enter would
send "@ma" instead of choosing Maria.

**Drafts are localStorage per room** (`cp_room_draft_v1:<roomId>`), restored in `load()` and
cleared on a successful send. Not a table, and the reason is not cost: the only thing worse
than losing a draft is the server keeping a copy of what you decided not to send.

**Copy lives in two places and both use `navigator.clipboard` with a silent failure path**
(it is undefined on an insecure origin, and an error toast for a convenience is worse than
nothing). The confirmation is ON the button rather than in a toast, because the point of
copying is that you are about to paste and a banner at the other end of the screen is the
wrong place to look. The code block's button is `opacity-100 md:opacity-0
md:group-hover/code:opacity-100` — always there on touch, where there is no hover to reveal
it — and the `<pre>` carries `pr-12` so the button never sits on top of the code.

**The typing indicator is three framer-motion dots**, not a CSS keyframe like the leaderboard
flame: exactly one exists at a time, so the forty-springs argument does not apply, and
`MotionConfig reducedMotion="user"` switches it off with no second rule to remember.

⚠ **Mount layout probes inside `Shell`, not beside it.** An earlier probe rendered at the
router root and its `body` overflowed by exactly the chat header's `-mx-4`/`-mx-8` bleed —
which `Shell`'s own `px-4`/`md:px-8` cancels — so the number was a lie about the real app.
Anything that measures the shell's width, padding or flex chain has to be a child route of
a real `<Shell>`.

Verified by probe route at 375×812 in both themes (removed, residue-checked): no horizontal
overflow (`scrollWidth === clientWidth === 375`); a plain row's background computes
`rgba(0,0,0,0)`; consecutive own-run bar segments touch at exactly 0px; long-press opens the
toolbar; a fast double-tap reacts and bursts while a 500ms one and a tap on a link do not;
`href` resolves to `https://…` with `rel="noopener noreferrer nofollow"`; the empty room
renders the 64px pixel-art astronaut at `image-rendering: pixelated`.
**Not verified on a real authenticated screen.**

Since 0049 (Peer groups — Peer Evaluation Phase 1): `peer_groups` + `peer_group_members`.
Reusable teams inside a section, shipped before any evaluation exists because organising a
class into teams is work the instructor already does on paper. **Nothing in this feature
touches `point_events`** — points are never turned into a grade, and Peer Evaluation stays
structurally out of the ledger rather than staying out of it by convention.

**`peer_group_members.section_id` is denormalised, and the reason is a constraint that
cannot otherwise be written.** One group per student per section is `unique (section_id,
student_id)`; reached through a join it could only be a trigger, and a trigger is a rule
you can forget to fire. Same justification as `space_rooms.dm_key`. A BEFORE trigger
(`cp_peer_member_section`) overwrites whatever the caller passes, so the copy cannot go
stale. **No `semester_id` anywhere in the file** — a section has been semester-scoped since
0027 and a second copy of that fact is a second thing that can drift.

**TICKING A STUDENT WHO IS ALREADY ON A TEAM MOVES THEM, SILENTLY, AT THE DATABASE LEVEL.**
The builder is group-first (the user's call, 2026-09-10): each group card opens a sheet of
the section roster with checkboxes. That shape lets the same student be ticked in two
sheets, and the unique constraint would reject the second save with an index name for a
message. So `set_peer_group_members` removes the student from any other group in the same
section first. The save therefore always succeeds — which makes it **the screen's job to
show the move before it happens**: every already-placed row wears its current group as a
Chip, and the summary above Save counts how many will move. A move the instructor did not
see coming is the one failure mode this shape can produce.
It takes the FULL intended membership, never add/remove deltas: the sheet holds the
complete answer, and a delta API lets the screen and the table disagree about a checkbox
that toggled twice.

**Unassigned students WARN, they never block** (user's call) — a collapsed count at the top
of the builder, names on tap. The `set_active_semester` `unplaced` precedent: leaving
someone behind is often deliberate, and a screen that argues about it is one the instructor
learns to work around. Phase 2's group-scoped evaluation shows them as **not applicable**,
never as missing.

**Group names start BLANK with a placeholder** (user's call), unlike the sequential default
that was on the table. Unlike a section name in the rollover wizard a wrong group name is
renamed in a tap, so the reason is not risk — it is that a section of "Group 1…Group 8"
nobody edited is worse than eight names typed once.

**`audit_log_action_check` was widened ONCE for both phases**, adding `'peer_group'` AND
`'peer_eval'` even though nothing writes the second until 0050. That constraint has already
been silently narrowed twice by a drop-and-recreate that forgot a value, and widening it in
two files is two chances to do it again. All twelve prior values re-listed.

RLS is **instructor-select only on both tables, with no write policies at all**. Students
get no read deliberately: Phase 2 hands a student their groupmates through
`get_peer_evaluation()`, scoped to one evaluation they are in. A blanket read of the
membership table would let any student enumerate every team in their section whether or not
an evaluation exists — a roster nobody asked to publish.
Archiving releases the members and keeps the row (Phase 2 snapshots `group_id` on every
submission), frees the name (the unique index is partial), writes one audit row carrying
the membership it had, and is idempotent so a retried tap writes no second row.
`get_section_groups` filters archived STUDENTS out of `members`/`member_count` while their
row survives holding the unique slot — so restoring a student (0023) puts them back on the
team they were on.

Client: `src/lib/api/peer.ts`; `PeerGroups.tsx` at `/teach/peer`, reached from a new
`ClipboardIcon` in the instructor Shell's `actions` slot — **stateless by requirement and
carrying NO badge**, because that slot mounts twice (desktop sidebar + mobile header). A
count later means hoisting it into `InstructorLayout` the way redemptions and excuses
already are. **`listRosterBasics` in `core.ts` is deliberately NOT `listStudents`**: that
one also fetches `student_secrets` to merge every claim token into the row, which a group
builder has no business pulling over the wire — the same call `getSectionHeadcounts` makes
for the same reason.

**No changelog entry for this phase.** `changelog.ts` drives the student-facing "What's
new", and Phase 1 has no student-facing surface at all. The draft entry starts in Phase 2.

Since 0050 (Peer evaluations — Peer Evaluation Phase 2): six tables —
`peer_evaluations`, `peer_evaluation_sections`, `peer_criteria`, `peer_submissions`,
`peer_ratings`, `peer_comments` — plus the submit RPC, close/extend/reopen, the
per-minute cron `classpoint-close-due-peer-evals`, and the kill switch
`app_flags.peer_eval` (seeded ENABLED). **Results are deliberately NOT readable yet**;
0051 adds aggregation, release and export. Still nothing touches `point_events`.

**SUBMISSION IS FINAL (the user's call, 2026-09-10)** — `unique (evaluation_id,
evaluator_id)` and a plain INSERT, no upsert, no `updated_at`. This is the OPPOSITE of
0045's editable event answers and the difference is the point: an event answer is a race
where an edit costs nobody anything, a peer rating is a judgement about a classmate the
instructor will read. The cost is that a misclick is permanent, so the form's
ConfirmDialog says so before it sends and the RPC's rejection says it again. The
double-submit path is guarded TWICE — an early `exists` check for the ordinary case, and
the unique constraint for the stale-tab race that check cannot close.

**`submit_peer_evaluation` IS THE SECURITY BOUNDARY, AND IT IS WHERE THE REFERENCE APP
HAD NOTHING.** peer2peer trusted an `evaluatorId` from the request body, never
range-checked a score, never checked a criterion belonged to the evaluation, blocked
self-rating with a client-side `filter`, and displayed a deadline it never enforced. Here
the evaluator comes from `cp_my_student_id()` and cannot be passed in; the ratee set must
EXACTLY equal the derived peer set **in both directions** (one direction alone lets either
a missing peer or a stranger through, and those are different bugs); every criterion must
be covered for every ratee exactly once; and **every score must be a value that appears in
THAT criterion's own scale — membership, not a range**, because on a 1/3/5 scale the
number 2 lies between the ends and is still not an answer anyone can give.

**`cp_peer_set(eval, student)` is the ONE definition of who your peers are.** The form,
the submit validation, the completion view and the "it's open" notification all ask it.
A second copy would let the form show a classmate the submit RPC then refuses. Its OUT
column is `peer_id`, **not `student_id`** — a RETURNS TABLE column becomes a variable in
scope and would shadow `peer_group_members.student_id`. It returns EMPTY rather than
raising for an unplaced student, which is what lets a caller tell "not on a team" apart
from "something went wrong".

**`peer_ratings` and `peer_comments` are INSTRUCTOR-SELECT ONLY, with no student branch at
all — not even "rows addressed to me".** A student holding the peer list could difference
those rows against the totals and reconstruct who said what. 0051's released results reach
students through an aggregating RPC and nothing else. Same discipline as 0045: sealing
lives in RLS, never in the client.

**Criteria and scope LOCK on the first submission** (`update_peer_evaluation` raises).
peer2peer destroyed every submitted response whenever criteria were edited, silently.
Title, instructions and deadline stay editable forever because none of them changes what a
submitted rating MEANT. `p_set_closes_at` is a separate boolean because **null is a real
value there** (no deadline) and cannot also mean "leave it alone" — without it every title
fix would clear the deadline.

**`cp_peer_scale_clean()` exists because a CHECK cannot walk an array.** The table CHECK
covers what it can (an array of 2–10 elements); distinctness, ascending order, label
length and the 0–100 envelope are enforced in the function, which is the only writer's
gate. Values must ASCEND, and that is load-bearing rather than tidy: 0051 normalises a
percentage against the first and last values. **`src/lib/peer-scale.ts` mirrors it and is
pinned by 18 tests** — the load-bearing one is `isOnScale`, which rejects 2 on a 1/3/5
scale. Change one side, change the other, same commit (the `lounge-answers.ts` rule).

**Create IS open IS notify.** Criteria and sections arrive with the evaluation in one RPC,
so there is never a window where a student opens one and finds it empty — which also means
creating it pushes. Only students who ACTUALLY have peers are notified (an unplaced
student would otherwise be pushed toward a form that can only tell them they are not on a
team). Audit row BEFORE dispatch, chunked at 50 (the 0034 lesson). Two new notification
types, `peer_eval_open` and `peer_eval_results`; `notifications.type` has no CHECK so
nothing needed widening.

**`cp_close_peer_core` is idempotent and has NO instructor check** — the cron calls it too,
and three things can close one evaluation (the instructor, the cron, a retried request).
**`reopen_peer_evaluation` CLEARS `closes_at`**, or the cron would close it again within
the minute and the button would look broken. It refuses once results are released.

**`applicable` is the third completion state peer2peer could not express.** A student with
nobody to rate is NOT outstanding; listing them as missing sends the instructor chasing
someone with nothing to do. `get_peer_completion` orders outstanding students FIRST — the
list exists to be chased, and ordering by name puts the answer on page two.

Client: `src/lib/api/peer.ts` grows the evaluation half; `src/lib/peer-scale.ts` +
`peer-scale.test.ts`; `components/peer/` (PeerCard, ScaleRow); `/app/peer` and
`/app/peer/:evaluationId`; `/teach/peer` is now `PeerConsole` (Evaluations | Groups,
mirrored to `?tab=`, hosting Phase 1's `PeerGroups embedded`) and
`/teach/peer/:evaluationId` is `PeerResultsBoard` (completion only until 0051 — named for
what it becomes so the route does not move under anyone).
**Student nav label is "Peer eval"** (user's call) with `ClipboardIcon`, a SIXTH
`SIDEBAR_NAV` entry; `TAB_ROUTES` stays at three, so on a phone it lives in the Menu
overlay beside Student Space and Profile.

**DRAFTS ARE localStorage ONLY, and the consequence is stated on the instructor's screen.**
Key is `cp_peer_draft_${studentId}_${evaluationId}_v1` — the student id is in there because
a shared phone must never hand one student another's half-finished opinion of their
classmates (the `cp_seen_level_${studentId}_${semesterId}` precedent, and it matters more
here). There is no draft table, so **the instructor cannot see partial progress**; the
completion card says so in words rather than letting a progress bar imply a percentage
that does not exist.

**`Input` gained `wrapperClassName`, the same defect `Select` shipped with for months.**
Its root is `<div className="w-full">` while `className` lands on the `<input>`, so
`className="flex-1"` in a flex row sized the control while the wrapper kept its own width.
No existing call site was passing layout classes to `Input`, so this is additive and
changes nothing that shipped. Sizing goes to the wrapper, appearance to the control.

**`PeerPerson` is one shape for group members and evaluation peers** (`PeerGroupMember` is
now an alias). They are the same three fields drawn by the same rows, and two names for it
is where the four-way drift of the points row started.

`ScaleRow` renders BUTTONS, not a slider: a scale can be sparse or binary, and a slider
implies every point between the ends is available when the server checks membership. The
value is printed beside the label only when the two differ — on a 1-to-10 scale the label
IS the number, and "1 1" reads as a bug.

Since 0051 (Peer results — Peer Evaluation Phase 3, the last): NO NEW TABLES. Aggregation,
release, comment hiding, and an **ownership move of `cp_nightly_backup` 0032 → 0051**
adding all eight peer tables. 0032 must not be edited.

**AGGREGATION IS IN SQL BECAUSE THE ALTERNATIVE IS SILENTLY WRONG.** A 40-student
section-wide evaluation with 4 criteria is 40 × 39 × 4 = 6,240 rating rows, and PostgREST
truncates any response at 1000 rows without saying so — the 0031 lesson. A client-side
average over a truncated set looks completely fine and is not.

**The percent formula is MIN-MAX, not `avg / max`,** and the difference is the whole
reason it needed pinning: on a 1-to-5 scale a straight 1 is the worst rating available and
must read **0%, not 20%**. The two formulas agree only when a scale starts at zero, which
is exactly why a Yes/No criterion hides the bug and a 1-to-5 one exposes it.
`cp_peer_scores()` is the ONE place it exists in SQL — both result RPCs read it, neither
re-derives it. `percentOf` in `src/lib/peer-scale.ts` mirrors it for the export, with every
expected value in its test computed by hand rather than from the function under test.
**Averages are carried UNROUNDED and rounded once at the end**; peer2peer averaged
already-rounded numbers and compounded the error across four criteria (`roundTo`'s second
test pins that the two disagree).

**THE THREE-RATER FLOOR (the user's call, 2026-09-10): below 3 raters COMMENTS are
withheld and numbers are not.** In a pair, one comment is one person's voice and
"anonymous" is a fiction, while an average is still hard to attribute to a sentence.
Enforced in `get_my_peer_results`, never in the client — the client is never sent the rows
it would have to decide not to draw. `commentsWithheld` and `minRaters` come back so the
screen can state the real number instead of implying nobody wrote anything.

**A student's comments arrive as BARE STRINGS.** Not objects with the evaluator stripped
out: the shape has no room for a name, so there is no field anyone can forget to remove in
a later edit. Hidden comments never leave the database at all.

**`get_peer_results` includes students NOBODY RATED** (`raterCount` 0, null averages) and
sorts them LAST, not first — that is a gap in the data, not a low score, and the card wears
a neutral chip rather than a zero that would be averaged and compared. Everyone else sorts
**lowest first**: this board is read to find who needs a conversation, and alphabetical
order buries the answer on page two.

**`sameScale` exists because averaging raw means across a 1-to-5 and a 0/1 criterion gives
a number with no unit.** The percentages stay comparable either way, so the headline is
always the percent and the raw figure is captioned "across different scales" when it is
one. Decision 13 said show the raw mean; this is how it is shown without lying.

**Release refuses while the evaluation is open** — a figure that moves after a student has
seen it is worse than a late one, because the second version is the one they assume was
doctored. It is idempotent (returns 0 when already released), so a retried tap cannot push
twice at a whole class, and it notifies only students who were actually rated. Notification
copy is **neutral and factual** (the user's call): "Peer feedback ready". This can carry
criticism, so a cheerful push is the wrong doorbell. Releasing also permanently blocks
`reopen_peer_evaluation`.

**Hiding a comment sets a timestamp and is allowed AFTER release.** Catching it late is the
ordinary case, and a screen that refuses at exactly the moment it matters is worse than
none. The instructor can still read it, which is the question you actually ask when the
student comes to talk about it. One audit row each way. The client patches the row in place
rather than refetching, because a reload collapses every card the instructor had open.

**`src/lib/export-peer.ts` is SCORES ONLY** (decision 16). A comment is a student's words
about a classmate written on a promise of anonymity, and a spreadsheet gets mailed, copied
to a shared drive and opened on a projector. **Column headers come from the CRITERIA list,
never from the first student's score array** — that is the bug that empties peer2peer's
header row whenever the first student received no ratings. An unrated cell is BLANK, not 0,
because a spreadsheet 0 gets averaged as one.

Client: `getPeerResults` / `getMyPeerResults` / `releasePeerResults` / `setPeerCommentHidden`
in `api/peer.ts`; `components/peer/PeerResultCard.tsx` (expandable, one card per student —
the user's call over a table, which needs its own horizontal scroller at 375px);
`/app/peer/:evaluationId/results` (`PeerResults`). The student list routes a released
evaluation to the results screen instead of the form, **including for a student who never
submitted** — their classmates still rated them, and that feedback is what they came for.
**`getPeerResults` is fetched in a SEPARATE try/catch** (the 0034 SectionGrid precedent), so
before 0051 is applied only the Results tab is missing rather than the whole screen.

⚠ **Postgres `numeric` arrives over PostgREST as a STRING**, not a number — it is sent as
text to preserve precision. `num()` in `api/peer.ts` coerces every one of them. A screen
that skips this still does arithmetic correctly (`"81.3" * 1` works) and fails only on
`.toFixed()`, which is the worst place for it to surface.

Since 0052 (Target an evaluation at specific groups, 2026-09-14): `peer_evaluation_groups`.
A "Within groups" evaluation used to mean every group in its sections, so the instructor
could not aim one at a single team. Decisions (user): **groups listed under each ticked
section, all pre-ticked** · **students on unpicked teams never see the evaluation at all**.

**NO ROWS MEANS ALL GROUPS, and that is what made this safe to add to a live feature.**
Every evaluation created before 0052 has no rows, so it keeps its exact meaning with no
backfill. The composer follows the same rule: when every group is left ticked it sends
NO list, so ignoring the picker behaves exactly as before, including for a group created
after the evaluation opens. The server test is "does this evaluation have ANY rows",
never "any rows for a live group" — if every picked group is later archived the
evaluation must reach nobody, not silently widen back to the whole section.

**`cp_peer_in_audience(eval, student)` is the ONE answer to "is this student part of
it"**, and everything that decides membership asks it: `cp_peer_set` (so submit
refuses), `cp_peer_eval_targets_me` (which backs the RLS policies — narrowing it is what
makes a narrowed evaluation INVISIBLE to other teams rather than merely unanswerable),
`get_peer_completion` and `get_peer_results`. Revoked from the API roles; every caller is
a definer. **A student who SUBMITTED or WAS RATED stays attached** to their evaluation
after a regroup — `targets_me`, completion and results each keep them — because their
words are already in it and history must not vanish over a team change.

**Ownership moves:** `cp_peer_eval_targets_me`, `cp_peer_set`, `get_peer_completion`
0050 → 0052 (same signatures, `create or replace`); `list_peer_evaluations` 0050 → 0052
(return type GROWS by `group_names`, drop-first); `create_peer_evaluation` and
`update_peer_evaluation` 0050 → 0052 (**signature grows** by `p_groups`, so the OLD exact
signature is dropped first — a `create or replace` with a new parameter list makes an
overload and PostgREST rejects every call as ambiguous, the 0028 lesson);
`get_peer_results` and `cp_nightly_backup` 0051 → 0052. **0050 and 0051 were NOT edited.**
The carried-forward bodies were diffed against their sources after writing, and every
difference is an intended one.

**A 0050 bug fixed on the way through:** `cp_peer_set`'s group branch matched membership
without checking the section. `peer_group_members` allows one row per student PER SECTION,
so a student promoted at rollover keeps last semester's row and would have been handed
last semester's teammates. Both sides of the join now require the current section.

`p_groups` in `create_peer_evaluation` is written BEFORE the notification query, because
that query asks `cp_peer_set` who has peers. Written after, a narrowed evaluation would
push the whole section. Each picked group must be live and inside one of the chosen
sections, and only a within-groups evaluation may name any. In `update_peer_evaluation`,
null leaves groups alone and an EMPTY array resets to all groups; a sections change
prunes any picked group whose section left.

**`src/lib/peer-audience.ts` decides what the composer sends, pinned by 10 tests,
because every failure mode is silent** — the evaluation opens either way and only the
wrong students get the push. Rules: section scope → null; nothing unticked inside a
TICKED section → null; anything unticked → the exact remaining list, including every
group of sections the instructor never touched; an untick left over from a section since
unticked does not count; **an empty list is refused, never sent** (the server would read
it as all groups, the opposite of clearing every box); and a narrowed list is refused
while any ticked section's groups are still loading or failed, since sending it then
would drop that section. An all-groups evaluation is never blocked by a slow fetch.
Verified to bite: breaking the null default fails 3 of the 10.

**`createPeerEvaluation` OMITS `p_groups` rather than sending null when there is no
list**, so it still resolves against a database without 0052 — PostgREST matches on the
argument names it is sent. A narrowed create against a pre-0052 database fails loudly
instead of opening for the whole section.

The composer stores the UNticked groups, not the ticked ones: groups arrive after a
section is ticked, and an inverse set makes them ticked by default with no effect to
reconcile. Each group row shows its member count, with "No one to rate" for a group of
one. The confirm dialog names the teams and says nobody else in the section will see it;
with more than one section in play each group carries its section, since two sections can
each have a "Team Alpha". Group names now show on the console card and the results board
subtitle — without them, one evaluation for a whole section and one for a single team
read identically.

Since 0053 (Hard-delete a peer evaluation, 2026-09-14) + live results (no migration).
Decisions (user): **results visible live as submissions arrive** · **delete only when
CLOSED and NOT RELEASED** · **the audit log keeps a FULL snapshot** · **delete lives at
the bottom of the evaluation's own screen**.

**Live results needed no migration.** `get_peer_results` was always instructor-gated and
never looked at status; only `PeerResultsBoard` held results back until close. It now
fetches them as soon as `submittedCount > 0`. While open, Completion stays the default tab
(the list you chase) and the Results tab carries a "Live, still changing" card. Release
to STUDENTS still requires closing, so nothing a student sees can move. Export stays
closed-only, since a partial sheet gets mailed as if final.

**`delete_peer_evaluation(eval, typed_title)` is one DELETE wrapped in validation** —
every peer table already cascades from `peer_evaluations`, and `audit_log_action_check`
has accepted `'hard_delete'` since 0023, so nothing needed widening. Refused while OPEN
(it would pull the form from under someone mid-sentence) and, permanently, once RELEASED
(students have already read that feedback). **Every check runs AFTER `for update`**:
`release_peer_results` locks the same row, so validating before the lock would let a
release commit in the gap and the delete destroy feedback that was just sent.

**The server compares the TYPED title itself, using the dialog's exact rule (trimmed,
case-insensitive)** — stricter would refuse a match the screen just accepted. The case
it actually catches is a stale tab: rename in one tab, confirm a delete in another still
showing the old title, and the server refuses. So the client sends what was TYPED, never
the stored title, which would make the check unable to fail.
**`ConfirmDialog` gained `onChallengeChange`**, a separate optional prop, rather than
passing the typed text to `onConfirm` — thirteen existing callers pass a bare function
there and would start receiving a string they never asked for. **Its challenge input also
went `text-sm` → `text-base`**: it was the one form control still zooming the page on
iPhone, on exactly the path hard-delete-student and semester activation depend on.

**The audit snapshot is complete and deliberately compact.** It carries the evaluation,
subject, sections, picked groups, criteria with scales, every submission, every rating
and every comment WITH its author, pruned with the rest of `audit_log` at 365 days.
**Ratings are `[evaluator, ratee, criterion, score]` tuples indexing into `people` and
`criteria` arrays in the same row** (with a `ratingsFormat` key so the row explains
itself), because `listAuditLog` in Ops downloads `row_data` for every row it lists: a
40-student section-wide evaluation is 6,240 ratings, ~800 KB as UUID-bearing objects
versus ~100 KB as tuples, and every index still maps back to a UUID. The audit row is
written BEFORE the delete in the same transaction, so a failed delete leaves no record of
a deletion that did not happen. The notifications the evaluation sent are deleted with
it, since they would deep-link to nothing.

The Danger zone card is the last thing on `PeerResultsBoard` and the button stays
VISIBLE but disabled with the blocking rule written above it, rather than vanishing —
an instructor who cannot find a delete button does not learn why. Success navigates with
`replace`, so Back cannot return to a screen for something that no longer exists.

Since 0054 (Flagged comments + group shuffles) and a peer-eval UI batch (2026-09-14).
Decisions (user): **shuffle into groups** (choose each time, unassigned-only by default ·
leftovers spread · "Group N" names) · **duplicate an evaluation** · **banned-word comments
hidden until reviewed** · **number-row rating buttons with the label underneath** · **a
Next button under the comment** · **review screen, then the usual confirm** · **"Saved on
this device"** · **class summary + By team + search on the results board** · **full-screen
composer** · **neutral "Strongest / Room to grow"**.

**A peer comment with a banned word is SAVED, FLAGGED and HIDDEN, not refused.** The list
includes Filipino words like "bobo" and "tanga" that a blunt but honest comment can use, so
refusing (the Lounge's rule) would teach students to soften feedback the instructor needs.
`peer_comments.flagged` is SEPARATE from `hidden_at`: hiding is the instructor's control,
flagged is a permanent record that the filter tripped, so a restored comment stays
flagged. **The student is not told** — that would make the filter a probing tool.
`cp_contains_banned_word(text)` is the one definition for anything new; the inline copies
in 0020 and 0042 predate it and live in applied files. The backfill touches only
`flagged = false` rows, which is what stops a re-run re-hiding a comment the instructor
restored, and hides only where results are unreleased (a released comment has been read).
**Ownership moves:** `submit_peer_evaluation` 0050 → 0054 and `get_peer_results`
0052 → 0054, both bodies extracted programmatically from their owners, modified by
split/join, and DIFFED — every difference intended. The board lists flagged-and-hidden
comments first as their own queue with Restore, and the release confirm says how many stay
hidden.

**THE CLIENT DRAWS THE SHUFFLE; `apply_peer_group_plan` ONLY WRITES IT.** The instructor
previews and redraws; a server-side draw would save a different result from the one on
screen. One transaction, so a failure at group six cannot leave a section half-regrouped,
and every refusal can truthfully say "Nothing was changed" (replace mode's archiving
rolls back too). Unassigned-only mode refuses a student who has since been placed; replace
mode archives every live group first and writes ONE audit row listing them with members.
**`src/lib/peer-shuffle.ts` + 19 tests:** group count is `floor(n / size)` with students
dealt evenly, so sizes differ by at most one and none falls below the size asked for (the
one exception: a pool smaller than a single group becomes that group). 11 in groups of 4
comes out 6 and 5 — the preview prints real sizes rather than the rule inventing a smaller
group. Names continue after the highest existing "Group N", not the count, and skip taken
names with the unique index's own comparison (trimmed, case-insensitive).

⚠ **GROUPS OF 3 ALSO LOSE THEIR COMMENTS, NOT ONLY PAIRS.** In a group of N each student
has N − 1 raters, and 0051 withholds comments below 3 raters — so the real threshold is a
group of **4**. The shuffle preview warns whenever any planned group is under 4. (The
option text offered when this was decided mentioned only pairs; the sheet states the real
rule.)

**Duplicate needs no migration and creates nothing.** `getPeerEvaluationTemplate` reads the
four tables directly (instructor RLS allows it; an RPC would be a second definition of an
evaluation's shape) and the group read fails SOFT to "all groups" before 0052. The
evaluation screen links to `/teach/peer?duplicate=<id>`; the console reads it ONCE, opens
the composer pre-filled, and strips it — a one-shot is right here because losing it loses
no data. Title gets " (copy)" inside the 80-char limit; the deadline is never copied; a
past semester's subject is left blank; the template's picked groups are converted into the
composer's UNticked set the first time each section's groups load, so an archived group
simply isn't there rather than being re-included.

**Rating buttons were broken at phone width, and were measured, not assumed.** A labelled
1-to-5 scale was ~420px of "4 Very good" buttons in ~310px of card and wrapped onto two
ragged rows. `ScaleRow` is now equal columns showing numbers, 44px tall, with ONE caption
line: the two end labels before choosing, the chosen label after (fixed height, so a choice
never nudges the page). Yes/No keeps two wide labelled buttons; a 1-to-10 scale takes two
rows of five with no caption. **Measured by probe at 375×812 (removed, residue-checked):**
1-to-5 on one row at 57×44, Yes/No 151px each, 1-to-10 two rows, zero horizontal overflow.
**`describeOption` in `peer-scale.ts` is the one rule for writing a chosen option** — the
probe caught the review screen printing "0 · No" beside a button that said "No", because
the two places had each decided the format. Pinned by 4 tests.

**Next sits UNDER the comment box, deliberately.** Auto-advancing after the last rating
would close the card before the student reached the optional comment. The bottom button is
never a dead grey "Rate 2 more": it names and opens the next classmate still waiting, then
becomes "Review and submit". Avatar chips at the top show who is done and jump to anyone.
Opening a card SCROLLS after `SCROLL_AFTER_MS` (260), because the previous card is still
collapsing and scrolling at once aims at where the next card is mid-animation.
"Saved on this device" turns into a danger line if localStorage throws — it must never
claim a save that failed.

**`PeerReviewSheet` is full screen and its Submit opens the SAME ConfirmDialog as before**,
so the rule that hard-to-undo actions go through a confirm still holds. No negative-margin
bleed on its sticky footer: inside an `overflow-y` scroller the other axis computes to auto
(the profile-sheet lesson).

**`src/lib/peer-summary.ts` + 6 tests: each student counts ONCE** in class averages. Pooling
every rating would weight a student rated by five above one rated by three. Unrated
students are left out of every average but counted in the total. `byTeam` sorts teams
numeric-aware (Group 10 after Group 2) with "No team" last. The summary always covers the
whole class; search narrows only the list. **`src/lib/peer-strengths.ts` + 8 tests**
compares on PERCENT (raw averages are not comparable across scales), says nothing with
one question or when everything ties within the SQL's rounding, and names tied questions
together rather than picking the first.

**The composer is `Sheet variant="screen"`** — the screen variant draws no title, so the
heading lives in the content — as are the shuffle and review sheets.

⚠ **`preview_start` can report a port the dev server is not on.** It said 63022; Vite, with
5173 taken, actually bound 5174 (see `preview_logs`), so the tab showed a Chrome error page
and every probe read an empty `/`. Read the real port from the logs before measuring.

Since 0055 (Global event attendance — a special/limited, large-scale check-in). Decisions
(user, 2026-09-20, three question rounds): **its own isolated tables** · **flat points,
once, into the ONE shared pool, silent** · **any active student, any section** · **rotating
QR only** · **a dedicated Events screen off the Attendance tab** · **in-app scanner only** ·
**manual-add + student event-history QOL** · **a new `event_attend` ledger category**.

**ISOLATION IS THE WHOLE SAFETY STORY — `scan_attendance` and `class_sessions` are NEVER
touched.** `event_sessions` / `event_session_secrets` / `event_attendance` are a parallel
world with their own scan RPC, so an event can't inflate a streak, a show-up rate or any
achievement metric, and it can't weaken the class-scan section guard. `class_sessions.section_id`
is NOT NULL and usually carries a subject; an event has neither, which is the second reason
it is not a class row. `event_attendance` stamps the student's `section_id` AT SCAN TIME (the
"record it in their respective section" requirement), nullable so a lost section never blocks
a check-in.

**THE SECTION GUARD IS THE INVERSE OF THE CLASS ONE, SO IT IS A SEPARATE FUNCTION.**
`scan_attendance` raises when `v_student.section_id <> v_session.section_id`;
`scan_event_attendance` omits that line entirely (any section) but still requires the student
to be in the CURRENT semester. Weakening `scan_attendance` to serve both would have voided
class-attendance security app-wide — the exact thing the isolation avoids.

**SILENT AT SCALE FORCED A TOUCH ON THE MOST LOAD-BEARING TRIGGER, AND A NEW CATEGORY MADE IT
LEGIBLE.** `cp_notify_point_event` pushes for every non-`redeem` award, and the Lounge relies
on it pushing for `'event'`, so reusing `'event'` could not be silenced by category alone —
a school-wide event would be hundreds of pushes. **Ownership move `cp_notify_point_event`
0025 → 0055**, body carried forward VERBATIM, the ONLY change one skip line:
`NEW.category in ('redeem', 'event_attend')`. A dedicated `'event_attend'` category (widening
`point_events_category_check`, re-listing every value incl. 0045's `'event'`) keeps the ledger
answerable — the same rule that rejected reusing `'activity'` for the Lounge. Widening the
union surfaced `PointsHistory`'s `Record<PointCategory,…>` legend at compile time (added
"Event check-in", gold like the other earned categories).

**POINTS ARE AWARDED EXACTLY ONCE, ENFORCED BY THE INSERT ITSELF.** `unique (event_id,
student_id)`; the RPC inserts `on conflict do nothing returning id`, and only if a row came
back does it write the `point_events` row and back-fill `point_event_id`. A re-scan or a
stale-tab double-tap can never double-pay. `points_per_scan = 0` records attendance with no
ledger row (0 would violate `points <> 0`). The award is silent because of the trigger skip,
so the student's confirmation is the scan screen + the ordinary in-app points toast on their
OWN device (not a push — that is what "silent" meant).

**SCALE: THE INSTRUCTOR MONITOR POLLS, IT DOES NOT SUBSCRIBE.** `event_attendance` is
deliberately NOT in the realtime publication; `get_event_stats` (instructor-only) returns
`total` + a `by_section` jsonb, polled every 4s. Subscribing would push hundreds of row
events at a whole-school event. Only `event_sessions` is published — that drives the GLOBAL
"Event is starting" banner, one `.on('event_sessions')` (UNfiltered — cross-section) added to
the existing durable `student-self-*` channel, re-reading `getActiveEvent` rather than
patching (an `ended_at` UPDATE must clear the banner). Events start/end rarely, so the
unfiltered subscription is cheap. `getActiveEvent`/`getMyEventStatus` on StudentData feed
`liveEvent`/`liveEventChecked`, both off the critical path; `noteEventCheckedIn()` flips the
banner to "You're in" the instant the scan screen succeeds (event_attendance isn't realtime).
The banner is gold, not the class banner's red — an event is points to earn.

**The QR carries a DISTINCT `CP1E` prefix** (`qr.ts` `buildEventPayload`/`parseEventPayload`),
so the class scanner (`parsePayload`, exactly `CP1`) and the event scanner reject each other's
codes. Same HMAC (`computeCode` over `${id}.${window}`) and 15s window, so the server mirrors
`scan_attendance` byte-for-byte against the event secret. v1 is in-app-scanner only; the
payload is still built as a `/scan#…` deep link so native-camera support is a one-line route
change later. `start_event_session` mirrors `start_class_session` (OUT columns `out_event_id`/
`out_qr_secret`, the 42702 trap; resume-active-before-validate). One active event per active
semester (partial unique index on `(semester_id) where status = 'active'`).

Client: event functions in `api/attendance.ts` (NOT a new `events.ts` — that name is 0045's
Lounge events); `EventSession`/`EventScanResult`/`EventStats`/`EventHistoryEntry` in types.ts.
`/app/event` (`EventScan`) reached from `EventStartingBanner` on Home; `/teach/event`
(`EventConsole` = create form → monitor with the rotating QR, polled counts, per-section
bars, `ManualAddSheet`, and a ConfirmDialog-gated End) reached from a card in the Attendance
tab header. `routes.test.ts` gained both paths. **`QrScanner` was enlarged + centred with a
sweeping aim line and an icon torch** (was a 🔦 emoji — chrome uses icons); it is shared, so
the class scan sheet got the same. Changelog: `DRAFT_EVENTS` (playful, NOT in `CHANGELOG` —
invisible until the instructor says to announce it).

**0056 fixes a latent guard bug in 0055 (2026-09-21).** A real student scan awarding >0
points died with `cp_guard_student_update`'s "You can only update your display name, photo,
bio and interests." — the FIRST time this surfaced anywhere, because event check-in is the
first student action that writes a `point_events` row for the student themselves (every other
award runs as the instructor). SECURITY DEFINER does not change `auth.uid()`, so the scan runs
as the student; its ledger insert fires `cp_recompute_points`, whose `students` UPDATE trips
the profile guard. 0056 gates the guard behind a transaction-local GUC `cp.event_award` that
`scan_event_attendance`/`mark_event_attendance` raise (`set_config(..., true)`) right before
their insert — narrow, and `cp_recompute_points` stays untouched. Safe because the flag is
transaction-local and PostgREST runs one statement per transaction and does not expose
`set_config`, so a student cannot raise it and then issue an arbitrary `students` UPDATE.
**Not verified on a real authenticated screen** — until 0056 is applied every >0-point event
scan fails; verified by typecheck, the 309-test suite and build only.

Event monitor + history (2026-09-21, NO migration — reads only). Decisions (user): **show who
checked in** · **event check-ins on BOTH the student attendance screen and the instructor
student record** · **a recent-events list with read-only review of finished events**.
`getEventAttendees(eventId)` is a direct embed select on `event_attendance`
(`students(display_name, avatar_url)`, `sections(name)`, `point_events(points)`), instructor-
gated by the table's own RLS (`is_instructor() or own`) — **no new RPC and no migration**,
so it works against the already-applied 0055. Cast-through-unknown like `getMyEventHistory`
(hand-written schema types embeds as `SelectQueryError`). Bounded by the active-semester
roster, so it stays under PostgREST's 1000-row cap. `listRecentEvents(limit)` reads
`event_sessions` newest-first WITHOUT the secret (review is read-only, no QR to render).
**The monitor's attendee list refetches only when the polled `get_event_stats` total CHANGES**
(`AttendeeList`'s `version` prop = `stats.total`), so the live list updates as people scan
without a full roster query every 4s; in review mode `version` is constant so it fetches once.
An event never grows a check-in it can lose (no un-check-in), so a count-gated refetch cannot
miss a row. `EventReview` reopens an ENDED event read-only (total + per-section + attendees, no
QR/manual-add/End) — the scan and manual-add RPCs already refuse an ended event, so this just
doesn't offer them. **`components/attendance/StudentEventHistory.tsx` is the ONE definition**
of a student's event list — used on the event scan screen (was an inline `RecentEvents`,
extracted to avoid a 4th copy), on `/app/attendance` (its OWN section, deliberately OUTSIDE
the term groups and `tally`, so an event never touches a show-up rate/streak), and on
`/teach/student/:id` (self-fetching by studentId, instructor RLS lets it read any student's
`event_attendance`). **`PageHeader` gained an optional `onBack`** for a header that switches an
in-component view (the review ↔ setup toggle is state, not a route); `fallback` is ignored when
`onBack` is set and stays required so no existing caller changed.

Fullscreen check-in wall + the count/list fix (2026-09-21, migration 0066 — written as 0057
on the PC and renumbered to 0066 at the PC↔laptop merge, because the laptop had since used
0057–0065 for grades, names and semester close). Decisions (user):
**a Twitch-style live feed on the right of the fullscreen QR** · **newest at the bottom,
auto-scrolling** · **avatar + name + section rows** · **~2s poll while presenting** ·
**desktop only**. `PresentFeed` is `hidden md:flex`, a 22–26rem right column; on a phone the
present overlay stays a single centred column. The QR is sized to the LEFT STAGE via a
`ResizeObserver` (not the window), so it shrinks to make room for the panel and never overlaps
it. The feed renders `attendees` REVERSED (the fetch is newest-first) and pins `scrollTop` to
`scrollHeight` on every change — a projector always wants the latest. The stats poll drops to
**2s while `presenting`, 4s otherwise** (one instructor's event, so the faster poll is cheap).
**`attendees` is lifted to `EventMonitor`** and fetched on `[event.id, stats?.total]` (capped
at `MONITOR_CAP` 100, newest-first), so the inline "Checked in" list and the fullscreen feed
share ONE fetch that only re-runs when the count changes — an event never loses a check-in, so
a count-gated refetch can't miss one. `AttendeeList` was split into `AttendeeListView`
(presentational, takes `count` because the monitor's `people` is a capped slice while the
header number must be the accurate `stats.total`) and a self-fetching `AttendeeList` wrapper
(the review's one-time full fetch). **The count/list mismatch was a definer-vs-RLS split**
(see 0066): `getEventAttendees` now reads through the definer RPC with an embed fallback.
The laptop's later pass reworded this screen from "checked in" to "recorded" (the inline list,
the fullscreen header and the count caption all say "Recorded" now); the layout above is
unchanged.

Since 0057 (Grades — Phase 1: the data layer). The instructor's Excel grade sheet as
data: `grade_policies` (weights per subject per term), `grade_items` (one score column —
"Quiz 1", out of 20, per SECTION), `grade_scores` (one mark). Instructor-only in RLS with
**no student branch at all**, so there is no "own rows" path to widen by accident. Nothing
references `point_events` in either direction — points are never turned into a grade, and
this stays structurally disjoint the way Peer Evaluation is.

**THERE IS DELIBERATELY NO SQL MIRROR OF THE MATH, AND THAT IS THE OPPOSITE OF
`peer-scale.ts`.** `src/lib/grading.ts` is the ONLY definition of every weight, the
transmutation and all rounding; SQL's whole job is `sum(score)` / `sum(max_score)`,
numbers that cannot drift. Those other files mirror because the server ACTS on their
value (`cp_event_normalize` decides who is paid, `cp_peer_scale_clean` decides whether a
rating is valid), so a client preview must agree with an authority. Nothing server-side
ever acts on a grade: no RLS branch reads one, no trigger, no notification. A mirror here
would be a second definition with nothing requiring it — the pattern that grew five copies
of the show-up rate and four of the points row. **If you are about to put a weighting
expression in a migration, stop.** The one thing both sides must agree on is WHICH ITEMS
COUNT: `archived_at is null`, stated in `get_section_grade_sums` and in `sumsFromScores`.

**THE ABSENCE OF A `grade_scores` ROW IS MEANINGFUL.** No row = "not marked yet"; a
student who sat the quiz and scored nothing gets a row holding 0. That one distinction is
what lets the app show the OFFICIAL grade (blanks count as zero, byte-identical to the
spreadsheet) beside an honest in-progress figure, with no second state column — hence the
three totals per component: `*_score`, `*_max` (every non-archived item) and `*_marked`
(only what this student has a score for). Clearing a cell is a DELETE, not a write of 0.

Transmutation is `(raw/total * span + base) * 100` with base 0.6, so **the lowest possible
grade in this system is 60.00, not 0**. `componentScore` returns that floor rather than
NaN when a component has no items (the instructor's call — Excel answers #DIV/0! there, so
there is no behaviour to be faithful to), but `termGrade` returns **null** for a term with
no items anywhere, and `finalGrade` returns null if any weighted term is missing. That
last one is the bug the whole feature exists to remove: the live sheet reads 68.508 for a
student with a 99.64 prelim and a 96.54 finals purely because Midterms is empty.
**Everything is carried unrounded and rounded once at display** — pinned by the
load-bearing test, where exam 35.58/50 → 88.464 → 94.61, and rounding that component
first gives 94.60.

`transmute_base` / `transmute_span` are COLUMNS, not constants: two columns today versus
a migration against live grade data later. Weights are `numeric`, so the two row-level
sums (PT+Quiz+Recit = 1, CS+Exam = 1) are real CHECKs — exact decimal arithmetic makes
that safe where float would not. The three terms' `final_weight` summing to 1 is CROSS-ROW
and cannot be a CHECK (a deferred trigger would make inserting the first row fail), so it
is validated in `subjectPolicyError` and surfaces as a sentence. A subject is gradeable
only once **all three** policy rows exist — a missing row is ambiguous, and defaulting its
share to 0 would silently compute a final grade out of 70%. 0057 seeds them for every
existing subject and `trg_seed_grade_policies` seeds new ones, **copying the weights of
the most recent subject sharing the same code**, so a rollover does not hand the instructor
three blank forms and a screen of dashes.

`get_section_grade_sums` returns **one row per (student, term)**, and the shape is
load-bearing: per (student, term, component) across a whole subject is 208 × 3 × 4 = 2,496
rows, past PostgREST's silent 1000-row cap (the 0031 lesson). Its roster is active students
in the section **plus anyone holding a score against this section's items** — items are
keyed to a section, so a student moved mid-semester would otherwise vanish from the grid
holding the marks they earned, with nothing on screen saying so (the `getSectionRegister`
rule). `listGradeScores` pages via `fetchAllPages`: one section-term is ~800 cells, just
under the cap, and three terms is well past it.

**Ownership move `cp_nightly_backup` 0052 → 0057.** Body carried forward verbatim; the
array gains the three grade tables **and 0055's `event_sessions` / `event_attendance`,
which were never added**. Two behaviours change, both because grades write **no
`audit_log` rows** (the instructor's call) and this mirror is therefore the only history a
grade has: grade tables keep **365** daily snapshots rather than 14, and on schema drift
their mirror is **parked under a dated name instead of dropped** — the generic handler
recreates from scratch and explicitly sacrifices old snapshots, which is fine beside an
audit log and a data-loss event without one. `audit_log_action_check` is untouched.

`num()` (PostgREST sends `numeric` as a STRING) moved from a private helper in
`api/peer.ts` into `api/_internal.ts`, where the other shared plumbing lives. Every weight
and score goes through it.

Grades — Phase 2: entering marks (no migration). **Grades took the FIFTH bottom tab**
(Students · Attendance · Grades · History · Ranks). The `actions` slot already carries
four round buttons and a fifth puts ~212px of controls in a 375px header — on the thing
opened most often. Entering marks is weekly core work, unlike Ops or Peer Evaluation.

**Two routes, and the scope is in the PATH on purpose.** `/teach/grades` is a narrow
landing (section × subject cards, three term links each);
`/teach/grades/:sectionId/:subjectId/:term` is the sheet. `Shell` only ever sees
`pathname`, so a `?section=` scope would make the width undecidable and strand the grid in
the 672px reading column. **`routes-shape.ts` gained `isGradeGrid`, and
BOTH layouts now call `routeWidth`** — `isChatRoom` was deliberately not widened (its name
would lie, and its own test asserts the room LIST is false). Touching only
`InstructorLayout` would reintroduce exactly the divergence that file exists to prevent.

**THE GRID'S INPUTS ARE UNCONTROLLED, AND NOTHING ELSE IN THIS CODEBASE IS.**
`grep defaultValue src/` returned zero hits before this. A section-term is ~40 students ×
~20 items = **800 inputs** (measured), and a controlled grid re-renders all of them on
every keystroke. Each ROW owns its committed values in local state, the inputs hold the
in-progress text, and a commit re-renders exactly one row. Nothing above the row re-renders
while typing. The consequence to respect: **the DOM is the source of truth between
commits**, so anything that changes values from outside — undo, a pasted column, a reload —
writes the screen's authoritative map and remounts the editor with a fresh `key`. Both are
deliberate one-off actions where a remount is free. The screen holds a `{ key, scores }`
SNAPSHOT in state rather than passing the ref through, so nothing reads a ref during render.

⚠ **`size={4}` ON THE CELL INPUT IS LOAD-BEARING, AND THE BUG IT FIXES IS INVISIBLE IN
CODE.** An `<input>` has an intrinsic width of ~20 characters, and in an auto-layout table
that is what sizes the column — `w-full` does NOT constrain it, because the column is sized
from content first. Measured: each item column came out **228px**, making the table
**5,343px**, with only four columns readable at a time. With `size={4}` the column is 87px,
the table 2,499px, and **eight** columns fit. Any future table of inputs has the same trap.

⚠ **THE SCROLLER OWNS BOTH AXES, AND `flex-1` DOES NOT BOUND IT.** A sticky element only
sticks inside its own scroll container. With the height unbounded the page scrolled instead
and the column headers slid away after about twelve rows (measured at `top: -503`), so you
could not tell which quiz you were typing into. `flex-1 min-h-0` was tried first and does
nothing: **every height in the Shell chain is a `min-h`**, so the column grows to its
content (measured 1,539px tall and not scrolling). The fix is `max-h-[75dvh]` on the
scroller — viewport-relative, so it needs no agreement with Shell's paddings (the
`calc(100dvh - …)` trap), and a grid shorter than the cap simply never scrolls. Measured
after: scroller 660px, both axes scrolling, header stuck at offset 0, name column stuck at
offset 4, zero page overflow.

**`type="text"` + `inputMode="decimal"`, NOT `type="number"`** — a deliberate break from the
house pattern (`AwardBar.tsx` uses `numeric`). Number spinners hijack the mouse wheel over a
scrolling grid, and `type="number"` cannot reliably tell `""` from invalid across browsers,
which is precisely the blank-versus-zero distinction the whole feature rests on. Scores are
decimal (37.5 / 48.25 / 35.58), so `numeric` would also hide the decimal point on iOS.
Every cell is `text-base`: below 16px iOS Safari zooms the viewport and never zooms back.

**One editor is mounted at a time, via `useIsDesktop()`** — the grid on desktop, the
one-column-down-the-roster flow on a phone. Not `hidden md:block`: two editors would mean
two inputs per cell, and the keyboard walk and the failed-cell flags both assume one.
**Enter and ↑/↓ walk the column; left/right are deliberately unbound** — they would fight
the text caret, and Tab already moves across.

**Saving is a debounced coalescing upsert (600ms), and a FAILED write keeps the typed value
on screen rather than reverting it.** The plan called for a per-cell revert; keeping the
mark and flagging it is better and was changed on purpose — losing someone's work to a
dropped connection is worse than showing it as unsaved, and the bar says "N marks not
saved" with a Reload. `AttendanceSession`'s whole-roster snapshot-and-restore is the wrong
shape here: it would undo edits made while the failed request was in flight. **Clearing a
cell is a DELETE, not a write of 0** — it takes the item out of that student's "so far"
denominator, where a 0 counts against them. A `beforeunload` guard covers the debounce
window, and unmount flushes.

`src/lib/grade-entry.ts` (+18 tests) owns what a typed cell means. It is **stricter than
`Number()`** — which accepts `'1e3'`, `'0x10'` and `'-5'` — because a typo'd exponent
becoming 1000 on a quiz out of 20 is exactly what nobody catches by eye. A pasted column
**keeps interior blanks**: a column copied out of Excel has a gap where a student was
unmarked, and dropping those shifts every score below the gap up a row, silently assigning
marks to the wrong people. Only the first column of a block paste is taken.

Grades — Phase 3: weights and the final grade (no migration). Decisions (user, 2026-10-15):
**a sheet from the subject card** · **summary + the biggest movers** · **percent entry with
the CS/Exam pair auto-balanced** · **the Overall view ships in this phase**.

**THE WEIGHTS EDITOR OPENS FROM THE LANDING, NOT FROM A GRADE SHEET, BECAUSE WEIGHTS ARE
SUBJECT-WIDE.** A sheet is scoped to one section; editing weights from inside it would
imply the change applied to that section alone, when it reaches every section taking the
subject. The console card is the only place a subject appears without a section, so the
scope on screen matches the scope being edited, and the confirm states the real count.

**Weights are typed as percentages and stored as proportions.** The two-field splits
(Class Standing / Exam) **balance each other** and therefore cannot be made invalid; the
three-field ones show a running total and refuse to save until it reads 100%, because
auto-balancing three fields means guessing which of the other two was meant. Verified by
probe at 375px: typing 70 into Class Standing set Exam to 30; Quizzes at 40 made the chip
read 115%, showed the error and left Save disabled.

**`src/lib/grade-impact.ts` (+12 tests) computes the confirm's numbers from `grading.ts`
itself** — a preview computed any other way would be a second opinion about the thing it is
previewing. Two rules it exists to enforce. **`VISIBLE_DELTA` (0.005):** grades show to two
decimals, so a smaller move is invisible, and floating point guarantees that re-saving the
SAME weights yields deltas around 1e-15 — without the threshold the dialog would announce
all forty grades moving every time, which trains the instructor to ignore the one time it
is telling the truth. **A grade that APPEARS or VANISHES is counted apart from one that
moves**, because averaging "null became 78" as a delta is meaningless and it is the loudest
thing a weight change can do. The average is SIGNED, so one student up 4 and one down 4
reads as a redistribution rather than a four-point inflation.

⚠ **A test meant to nudge one weight harmlessly found a real behaviour and now pins it:**
raising a single `final_weight` takes the three to 100.001%, and `grading.ts` refuses a
misconfigured policy outright rather than renormalising — so every grade DISAPPEARS. The
preview reports that loudly instead of as a rounding-sized move. Only a shift *between* two
terms keeps the sum intact.

**The transmutation sits behind a disclosure with a typed-name `ConfirmDialog` challenge.**
It is a column rather than a constant so it *can* change, but changing it moves every grade
the subject has ever produced — the one edit here that earns the same treatment as
hard-delete-student.

**The Overall view is the FOURTH TAB on the grade sheet, riding the same `:term` segment**
(`/teach/grades/:section/:subject/overall`). One route serves all four views, so each stays
a real deep link and `routeWidth` can still decide the width from `pathname` alone. It
reads the aggregate RPC, never raw cells — three terms of a section is ~2,400 score rows,
past the 1000-row cap. **It is where the app finally refuses to lie:** a student with 100
in Prelim and Finals and no Midterm reads **"No Midterm"**, not the 70.00 the spreadsheet
computes — and 70 looks like a passing grade. A term weighted at 0% is deliberately not
counted as missing. Verified by probe: 2 of 3 students graded, the third withheld and named.

Grades — Phase 4: outputs (no migration). Decisions (user, 2026-10-16): **both export
buttons** · **every item column plus the computed ones** · **the Overall sheet is the
printed one** · **every item in the per-student breakdown**.

**`src/lib/export-grades.ts` (+9 tests) obeys two rules, both inherited from mistakes this
codebase already made.** **An unmarked cell is BLANK, never 0** — a spreadsheet 0 gets
averaged as one, so writing zeros would destroy the blank-versus-zero distinction the whole
feature rests on the moment anyone put `=AVERAGE()` under the column (the `export-peer.ts`
rule for an unrated student). **Computed figures go out UNROUNDED** — the app shows two
decimals, but a spreadsheet is where people re-check arithmetic, and Excel can format what
it is given while it cannot recover precision thrown away. A withheld final is blank with
the reason in its own **Note** column: a number there is the lie, and "No Midterm" in the
grade column would put text where every downstream formula expects a number.
"This term" downloads one sheet; "Whole subject" (on Overall) builds four — three terms
plus Overall — and **re-fetches the other two terms rather than holding all three in
memory**, since the screen only ever shows one and three terms is ~2,400 cells.

**`fileName` is now EXPORTED from `attendance-io.ts` rather than copied.** It encodes a
collision rule (two subjects of one section exported the same day used to overwrite each
other), and this codebase has already merged the same rule back together four separate
times after it was duplicated.

**`cellKey` moved from `GradeGrid.tsx` into `grading.ts`** — the exporter needs the same
map and **a lib must not import from a feature**. Same reasoning as `fileName`.

**BOTH PRINT ROUTES ARE PORTRAIT, and the landscape matrix was dropped.** The sheet that
actually gets signed and handed in is names × three terms × final — five columns, portrait,
with a Note column and a signature block. The full item-by-item working lives on a
student's own printout instead, where it belongs. Both sit outside `InstructorLayout` (the
`StudentReport` precedent) and each loads the term calendar itself.

⚠ **`useForcedLightTheme` is the decision that stopped a second copy of everything.**
`StudentReport` carries its own namespaced light-only stylesheet so dark mode cannot leak
onto paper — correct, but it means any component it prints must exist twice, once in tokens
and once in literals. The theme is a single `dark` class on `documentElement`, so removing
it for the life of the route gives every token its light value and **`StudentGradeBreakdown`
is ONE component on the record page and on the printout**. It restores the class on
unmount, or going Back from a printout would silently relight the whole app. Verified in
the browser: dark on → removed while mounted → restored on leaving.

**`listGradeScores` gained an optional `studentId`.** The breakdown wants ~120 cells;
without the filter one record page pulled the whole class's marks for every item of every
term — roughly 4,800 rows to render one person.

⚠ **`isGradeGrid` now matches the four tab names, not a wildcard segment.**
`/teach/grades/<section>/<subject>/print` is ALSO three segments and a wildcard matched it.
Harmless in practice (the print route renders outside `Shell`, which never asks about
width) — but a predicate that answers true for a URL it does not describe is how the next
reader gets misled. Pinned by two more tests.

The breakdown is **collapsed per subject on the record page and force-expanded in print**:
it is the full working — every mark, every component's transmuted score, class standing,
exam, term and final — which is what you want when a student asks, and too long to leave
open on a record that already carries attendance, points and achievements.

⚠ **A THIRD Browser-pane measurement artifact, beside the compositing and rAF ones above:
a hidden or collapsed pane reports `clientWidth === 0`**, so every element reads as
overflowing and `scrollWidth - clientWidth` looks like a catastrophic layout bug. It showed
as 368px of phantom overflow on a page that measured 0 at 1280 and at 375. **Set an
explicit viewport with `resize_window` before trusting any geometry.** Screenshots also
time out outright while the window is hidden — read the DOM instead, which is the stronger
check anyway.

Since 0058 (Grades — Phase 5: the importer). Decisions (user, 2026-10-16): **one
transactional RPC** · **a full-screen sheet from the term tab** · **one term per run** ·
**overwrite, with the count stated up front**.

**`import_grade_term()` IS ONE TRANSACTION, AND THAT IS WHY IT IS A FUNCTION.** An import
is four column inserts and ~160 marks; from the client that is five round trips with no
transaction around them, so a dropped connection leaves two components imported and two
not — real columns, real marks, no way to tell from the screen which half is missing. The
`apply_peer_group_plan` (0054) reasoning exactly. 0057's section guard still fires per row,
so **a mis-matched name pointing at a student in another section aborts the whole import**
rather than quietly attaching one mark to a stranger. A re-import finds the same column by
name and overwrites rather than stacking a second one beside it. **It never creates a
student** — inventing a roster row from a spreadsheet cell is how a typo becomes a person.

**IMPORTED TERMS GET ONE COLUMN PER COMPONENT** (`"Quizzes (imported)"`), holding each
student's row total. The source sheet records a total per component and never a maximum per
quiz, so per-item detail cannot be recovered without inventing it — decision 15 from the
planning round, now enforced by the RPC's shape.

**`src/lib/grade-match.ts` (+16 tests) is the riskiest code in the feature.** Everything
else fails loudly; a mis-matched name writes a class's marks onto the wrong person with
nothing looking broken. The idea doing most of the work: **compare a SORTED TOKEN SET, not
a string** — "Dela Cruz, Juan" and "Juan Dela Cruz" are the same set, which removes the
whole "Last, First" problem with no special case. Particles are joined (`de la cruz` →
`delacruz`, the most likely real mismatch in this roster), accents folded, suffixes
dropped. **An initial is never treated as noise:** dropping it downgrades a match to FUZZY
and a collision to AMBIGUOUS, because "Juan P." and "Juan R." are two people and that
letter is the only thing telling them apart. **Nothing is ever auto-resolved** —
`students.full_name` has no unique constraint and two real people can share one.
`missingFromSheet` counts only EXACT matches as covered: a fuzzy row may still be rejected,
so the student stays on the list that exists to catch someone being left ungraded.

**`src/lib/grades-io.ts` (+12 tests) detects the layout, and everything it finds is a
SUGGESTION.** Ranges come from the merged group headers, totals from the totals row; one
inserted column shifts all of it, so the importer shows each range beside the real header
text and the first student's actual cells, and writes nothing until a person confirms.
⚠ **Detection order is load-bearing and the first attempt had it backwards.** Finding the
body first and the name column second reads naturally — but the instructor's totals row
carries **"FULL NAME"** in the name column, which is text beside numbers, the exact shape
of a student row. It was read as the first student and every range shifted a row with it.
The name column is now found across the whole sheet and the body starts at the first row
whose name is an actual name (`isLikelyHeading`, shared with the matcher). A component
whose cells are all blank yields **null, not 0** — importing zeros would record marks
nobody gave, which the official grade then counts.

**Three stages, and the middle one cannot be skipped.** Confirm the structure → review the
names → confirm the counts. **Only EXACT matches are pre-ticked**; ambiguous rows offer
every candidate and choose none, fuzzy rows sit at Skip, an unmatched row cannot create
anyone, and students the sheet never mentions get their own warning block — the strongest
signal the wrong file was loaded. The final `ConfirmDialog` states columns created vs
reused, marks written, **marks replaced**, rows skipped and students getting nothing.

Grades — grid UI pass (2026-10-16, no migration), from the first real screenshot with the
instructor's own roster in it. Decisions (user): **pin Term Grade right** · **quieten the
view toggle** · **dash instead of the floor in So far** · **tighter rows, a divider before
the computed columns, collapse the explanatory note**.

⚠ **AN AUTO-LAYOUT COLUMN SIZES TO ITS HEADER, NOT ITS INPUT — `size={4}` only ever
capped half of it.** A column named "Sample Recitation" grew to ~180px while its cells
stayed at 88px, so a few long names shoved the term grade off the right edge. The `th` now
carries `w-22 min-w-22 max-w-22` with `truncate` and the full name in `title`. Measured
after: every item column 87px with that same name. **This is the second half of the
`size={4}` lesson — cap BOTH the control and the header.**

**Term Grade is `sticky right-0`.** The name column was already frozen left; the number the
screen exists to produce was the one thing that scrolled away. Name on one edge, grade on
the other, marks scrolling between them. Verified pinned under a 400px horizontal scroll.

**Rows went 46px → 32px** (input `h-9` → `h-8`, cells `py-0`), which is **20 students
visible instead of 13** at 900px tall. `text-base` is untouched — that is the iOS zoom rule,
not a type choice, and shrinking the box does not shrink the text.

**In the "So far" view a component with nothing marked renders "—", not 60.00.** The floor
is correct and Official still shows it, but on a part-marked term it filled the screen with
identical numbers. Display only; no arithmetic moved. ⚠ **The probe caught the half-fix:**
every component showed a dash while **Class standing still read 60.00** beside them, because
it has no null to fall back to. It now dashes when all three of its components are unmarked.

**`SegmentedControl` gained `tone="quiet"` and `size="sm"`.** Two filled accent strips in
one row read as a single control with two active items — exactly how the term tabs and the
So far / Official toggle were being misread. Quiet keeps the shape and the radiogroup
semantics and drops the fill, so red only ever marks which term you are in. **Additive: the
default path emits the identical class set, so all ten existing callers are byte-identical.**

Measured across widths, page overflow 0 at every one: scroller 697px at 1024, 969 at 1440,
1209 at 1920 against a 1270px table. ⚠ **At 1920 the grid still scrolls ~60px while 384px
of gutter sits empty on the left** — that is `Shell`'s `wide` contract (grow right only, so
the sidebar never jumps), inherited from the chat room. Correct there and arguable here; it
only bites in the narrow band where the table is slightly wider than the scroller, since a
20-item term scrolls regardless. Left alone deliberately rather than forking the width rule.

Verified end to end by probe (removed, residue-checked) against a deliberately awkward
fixture — a reversed-order exact match, a name differing by one initial, two students
sharing a name, one student absent from the sheet, and a TOTAL row. Result: 1 exact, 1
fuzzy, 1 ambiguous, 1 unmatched, 1 heading ignored, "4 students get nothing", and **only
the exact row pre-selected**. Editing a range in the form updated the detected chips
correctly. ⚠ **A CSV carries no merges**, so range detection falls back to single columns
there — which is the suggestion-then-confirm design working, not a bug.

Mobile responsiveness pass (2026-10-19, no migration). The user asked for the whole
app, not one screen: **cards, components, text and containers**. Four real defects,
all of them invisible on screen and only findable by measuring.

**`components/ui/TableScroller.tsx` exists because the print routes shipped tables with
no scroller at all.** A phone cannot scroll a plain `<table>`, so it SQUEEZES instead:
measured on the class grade sheet at 375px, 9px of page overflow and rows **103px** tall,
each name wrapped into a column of single words. The grid already had the right wrapper
inline, so this is the fourth-copy rule applied one copy early — `GradeGrid`,
`OverallTable`, `GradesPrint` and `StudentReport` now share it (the last two through
`.gp-scroll` / `.report-scroll`, since they are namespaced literal-CSS islands and must
stay token-free). `fill` is the grid variant that takes the viewport height;
`print="release"` drops the cap, and **both print stylesheets release `overflow` and
`min-width` inside `@media print`** — on paper there is no viewport to scroll, so a live
scroller would print one screenful and silently drop the rest of the class. Measured
after: 0 page overflow, rows 49px.

⚠ **`truncate` DOES NOTHING WITHOUT A WIDTH CONSTRAINT, AND WHICH CONSTRAINT DEPENDS ON
THE PARENT.** `Stat` carried `truncate` on its label and the label still rendered **422px
wide, running 153px off the left edge of the screen** — nothing looked broken only
because `body { overflow-x: clip }` cropped it without a scrollbar. The parent already
had `min-w-0`, which is why it read as correct. Three shapes, three fixes:
- **A child of `items-center` (or any shrink-to-fit flex child) → `max-w-full`.** It is
  sized to its CONTENT and is never asked to shrink, so `min-w-0` has nothing to permit.
  This was `Stat` (Dashboard strip, profile tiles, StudentRecord) and `RoomRail`’s
  64px rail buttons.
- **A compressed child of a flex ROW → `min-w-0`.** `PodiumBoard`’s section-and-level
  line, where a long section name plus "· Lv 12" escaped the podium card.
- **A grid item → `min-w-0`.** Grid items default to `min-width: auto` and refuse to
  shrink below content. `ScaleRow`’s two-column Yes/No buttons.
A `truncate` on a BLOCK element (`<p>`, `<h2>`) is fine — it fills its parent — which is
why ~40 such sites are correct and only these four were not. **Grep is not enough here:
the broken and working cases look identical in source.** Measure with
`getBoundingClientRect` against `clientWidth`.

**`overflow-wrap: break-word` is now a global backstop on `body`.** The default is
`normal`, which breaks at spaces only: measured at 375px, a 90-character unbreakable
token in an ordinary `<p>` inside a `Card` overflowed that card by **444px** and took
the document 406px past the viewport. Only 14 call sites (lounge posts, chat messages,
reports) carried `break-words` of their own, so every instructor-typed item name, error
message and free-text field was unprotected. `break-word`, NOT `anywhere`: it breaks a
word only when that word would otherwise overflow, so nothing that fits is re-wrapped.
**It cannot disturb `truncate`** — that is `white-space: nowrap`, and wrapping rules
never apply to a line that does not wrap (verified: all 14 truncating elements still
compute `nowrap` + `ellipsis`). The per-site `[overflow-wrap:anywhere]` on chat links
stays, because a URL must break mid-token. Same discipline as the `overflow-x: clip`
rule above it: **the backstop, not the fix — a string that needs breaking usually wanted
`truncate`.** Verified it does not move the grade tables: at 1440 the Overall table is
1292px in a 1320px scroller with 36px rows (no cell wrapped to two lines); at 375 it is
536px inside a 351px scroller that absorbs it, page overflow 0.

**Tap targets on the two print toolbars were 40px**, under the 44 Apple and Google both
publish — and these are the buttons pressed hardest, since the whole point of the route
is to hit Print. `.gp-btn` and `.report-btn` are 44px now. `Landing`’s back-to-top
button was at a flat `bottom-5`, which puts it under the home-gesture bar on a notched
phone; it is `bottom-[max(1.25rem,env(safe-area-inset-bottom))]`.

**Measured clean and deliberately left alone:** `StudentRecord`’s 4-up `Stat` row beside
a 56px avatar (labels need 49px in a 57px cell — it fits, so collapsing it to 2×2 would
have been a change with no defect behind it); `UsePoints`’ four `grid-cols-4` kind
buttons ("Activity" is the longest at ~56px in a ~70px cell); every fixed width in the
app (all ≤280px); the five-tab bottom bar at 69px each; tablet 768/1024 and landscape
812×375, where the nav’s own `overflow-y-auto` absorbs the squeeze. **Measuring first is
what kept this pass to four real fixes** instead of a sweep of plausible-looking edits.

⚠ **ESLint warnings are now 105, not the 47 recorded above** (and 107 since Era 7.0) — the grades feature added
the bulk of them, still dominated by react-hooks v7’s `set-state-in-effect` and
`purity` opinions, plus unused-disable directives. Still 0 errors, so the gate is green;
the "tighten to errors once the backlog is read" note now has twice the backlog.
Tap targets — the 44px pass (2026-10-19, no migration). Came out of the
responsiveness sweep above: `Button`'s `sm` variant was **36px**, under the floor
Apple and Google both publish, and three square buttons had never come through
`IconButton` at all.

**`.cp-tap-44` and `.cp-tap-y` in index.css are the ONE definition of each
geometry**, and there are two because small controls come in two shapes.
`.cp-tap-44` is a centred 44x44 box for SQUARE icon controls; `.cp-tap-y` is 44px
tall across the element's own width, for WIDE ones (a labelled button, a segmented
tab, a switch) — **height only, because those are already wider than 44px and
expanding sideways would only reach into a horizontal neighbour**. `IconButton`'s
inline `before:*` chain was replaced by `.cp-tap-44`, so its 44 call sites and the
three hand-rolled buttons now share one rule rather than two copies of it.
Both are absolutely-positioned pseudo-elements, so **nothing moves**: every control's
VISIBLE height was measured unchanged afterwards (36, 32, 40, 28, 24).

**⚠ THE ADJACENCY RULE DECIDES DATA CORRECTNESS HERE, NOT COMFORT, AND IT IS WHY
TWO THINGS WERE DELIBERATELY LEFT SMALL.** Two expanded regions overlap when their
centres are under 44px apart, and in the overlap the LATER element in DOM order
wins. For `.cp-tap-y` only VERTICAL neighbours can collide. The two that must not
take it:
- **`StatusPicker`'s `compact` variant** — five letter squares at `h-8` and
  `gap-1`, i.e. 36px centres. Expanding them does not cause a mis-tap, it **marks
  the wrong attendance status**, on the one screen the codebase already exempts for
  speed. Measured still 32x32, unexpanded, on purpose.
- **`AwardBar`'s point chips** — same `gap-1` shape, where a wrong tap awards the
  wrong number of points.
Everything expanded was checked: the instructor's `actions` row is `gap-2` with
36px buttons (36 + 8 = 44 centres, exactly touching); `StatusPicker`'s grid is 3-up
at `gap-2`, measured row 1 ending at y=387 and row 2 starting at y=388 — **touching
at zero overlap**. A static scan of all 67 `Button size="sm"` sites found two
candidates in `divide-y` lists and **both were false positives** (the button sits
after the list with `mt-2`/`mt-3`, not inside it).

**A second bug fell out of the same scan, and it was not a tap target.**
`CommentsOverlay`'s composer is a hand-rolled `<input>` that never used the `Input`
primitive, and it was **`text-sm` — 14px, which makes iOS Safari zoom the viewport
on focus and never zoom back** — on a student-facing surface. A scan of every
native form control in the app found it was the ONLY one; `Input`/`Textarea`/
`Select` are all `h-11 text-base`. It is `h-11 text-base` now, and the `h-10`
override on the Send button beside it was dropped so the row lines up at 44.
**Any new hand-rolled form control must be `text-base`** — the Era 6.0 Phase 4 rule
held for four months and then a new component quietly broke it, so the check is
worth re-running rather than assuming.

**Left alone deliberately, beyond the two adjacency cases:** `Attendance`'s
penalties checkbox is `h-5` but sits inside a `<label>`, so the whole row is
already the target — a sweep that "fixes" the checkbox makes it worse, not better;
`PinnedBadges`' Unpin, `ProfileBanner`'s Remove and `Profile`'s pencil/x stay small
because they are DESTRUCTIVE overlay affordances on image tiles (the existing
decision — a 44px region there invites the accidental taps the small size
prevents); and Landing's version string is a `cursor-default` secret-tap easter
egg, where a bigger target is the opposite of the intent.

Expanded: `Button sm` (67 sites) - `SegmentedControl` both sizes - `StatusPicker`
grid + its Reset - `UsePoints`' four kind buttons - `ThemeToggle` - the two
`role="switch"` toggles (24px and 28px, the smallest real controls in the app) -
the notification bell, the mobile menu's close and the instructor's requests
button - Landing's "Claim your account" and "How it works".

Verified by probe at 375x812 (removed, residue-checked) by walking
`elementFromPoint` outward from each control's centre — **the real hit region, not
what the CSS claims**: `Button sm` 36 -> 44, segmented 32/40 -> 44, switches 24 ->
44 and 28 -> 45, icon buttons 36 -> 44x44, `expandHitArea={false}` still 36x36, and
the compact status squares still 32x32. Then on the live Landing page: the claim
link 28 -> 45 sitting 4px clear of Sign in, and **`overlaps: []`** across every
control on the screen. **Not verified on a real authenticated screen.**

Auth screens — the aurora pass (2026-10-19, no migration). Decisions (user):
**aurora + raised card** · **ticket-stub claim door below the form** · **all four auth
screens**.

**THE SIGN-IN SCREEN HAD THREE DOORS TO `/claim` AND THE FIRST ONE WAS IN THE WAY.**
Measured at 375x812 before the change: a bordered "First time? Have a token?" card at
**y=274**, directly under the heading and ABOVE both fields, plus a footer link at
**y=695** saying the same thing in different words. So a returning student — very nearly
all of the traffic — read an invitation addressed to somebody else before reaching the
username box, and a new student was asked the same question twice in one screen.
`components/auth/ClaimDoor.tsx` is now the ONLY route to `/claim` from sign-in, and it
sits BELOW the form: it earns attention by being the loudest block on the page rather
than the highest one. Verified in the browser — `a[href="/claim"]` returns exactly **1**.

**THE TICKET STUB USES A PERFORATION, NOT EDGE NOTCHES, AND THAT IS A DELIBERATE
DEPARTURE FROM `PodiumBoard`.** The spend pedestal bites its notches out with circles
painted in the colour of the surface behind it, which works there because that surface
is flat. Here the backdrop is the aurora, so a `bg-canvas` circle would read as a solid
dot parked on a gradient. A genuine hole needs `mask-composite`, whose failure mode on
an unsupporting engine is **the element disappearing entirely** — not a trade worth
making for the only claim door in the app. A dashed perforation says "ticket" with no
assumption about what is behind it.
The ACTION is the second line and carries the weight and the `reward` colour; the
question is the muted first line. A one-line explanation sat on that second line first
and wrapped to two, which pushed the stub to **90px** and left the verb in muted body
copy — it is **70px** now.

**`AuthShell` hosts the aurora on a FULL-WIDTH root, not on the reading column.** The
blurs are 416px and 480px across and would be cropped to `max-w-md` otherwise. The root
carries `overflow-hidden`, which is safe **only because nothing in the auth area is
`sticky`** — the same class would break the Shell header, AwardBar and the roster. The
aurora is the landing page's own component reused rather than re-invented, so the screen
a student lands on and the screen they sign in on belong to one world; it is
`pointer-events-none`, animates only transform/opacity on the compositor, and the global
reduced-motion block already switches it off with everything else.

**The shell now owns the icon tile and a `below` slot.** `InstructorSignIn` hand-rolled
that tile in its own body; it is an `icon` prop now, and Claim and ResetPin take one too.
**Sign in passes NO icon on purpose** — it is the default door, so its heading should be
the loudest thing on the page and the claim stub the only decorated element. `below`
renders between the card and the footer, outside the card, because the claim stub is a
second door and putting it inside the card that holds the form would say it was a field.

⚠ **A real bug fixed on the way through: `Claim` and `ResetPin` rendered EVERY validation
error under the LAST field.** `error` was passed to the Confirm-PIN input, so
"Enter the token your instructor gave you." appeared at the opposite end of the form from
the token box, with a red border on a field that was fine. Both now render it in their
own `role="alert"` block above the submit button.
Claim's six stacked fields are split into **"1 · From your instructor"** and
**"2 · The login you keep"** (ResetPin likewise): the token is something you were HANDED,
the rest is something you CHOOSE, and six identical boxes in a column said neither.

Verified at 375x812 in BOTH themes (`localStorage['classpoint-theme']`, since the pane's
`colorScheme` emulation does not drive this app's `.dark` class): zero horizontal
overflow on all four screens, every input still **16px** (the iOS zoom rule), aurora
present on all four, sign-in and instructor sign-in fit one screen (812px) while claim
scrolls at 1105px. Light canvas `#f3f3f6` / card `#ffffff` / action `rgb(214,124,5)`;
dark canvas `#08080b` / card `#18181f` / action `rgb(255,186,31)`. ESLint stayed at
**105 warnings, 0 errors** — the new files added none. **Not verified against a real
sign-in**, only the unauthenticated screens.

Sign-in transition + auth polish (2026-10-21, no migration). Decisions (user):
**fade & breathe logo transition, ~2s** · **on every student entry** (sign-in, claim,
reset — instructor instant) · extras: **show/hide PIN · remember username · staggered
entrance · caps-lock hint · button spinner→checkmark · auto-focus first empty field**.

**`AuthTransition` + `useAuthTransition` play THEN navigate, they do not navigate then
animate.** The three student screens already know they are going to `/app` the instant
the server says yes. A full-screen `bg-canvas` overlay fades in OVER the screen that
succeeded, and the `navigate('/app', {replace})` fires only when it ends — so the
dashboard mounts behind an already-opaque screen with no seam, and no second route or
loader flash. **The navigate is driven by a single `setTimeout(onDone, 2000)`, NOT by
`onAnimationComplete`** — three sub-animations finish at three different moments and
`reducedMotion` changes which, so one timer is the only clock that cannot disagree with
itself. Everything is opacity+scale (compositor), and the global reduced-motion block
leaves the straight fade the user asked for while the timer still fires on time.
`onDone` is `useCallback`'d on `dest` so the overlay effect does not re-run every render
(the `[open, onClose]` Sheet-focus trap). Instructor sign-in deliberately stays instant —
the instructor is not made to wait 2s on every login.

**`Input` gained `revealable`** — an eye toggle (new `EyeIcon`/`EyeOffIcon`) that flips
`type` password↔text, `tabIndex={-1}` so it stays off the Tab path (username → PIN →
submit), `.cp-tap-44` hit region, sitting INSIDE the field (`pr-11` on the input).
Verified in the browser: password→text→password, `eyeInsideField: true`. Claim and Reset
carry it on both PIN fields (`pinEyeCount: 2`).

**`src/lib/auth-prefs.ts` stores the USERNAME ONLY** (`cp_last_username_v1`), never the
PIN — the whole point of a PIN is that the device does not hold it. Written on a
successful sign-in AND a successful claim (so a new student's first ordinary sign-in on
that phone remembers them). SignIn prefills it, shows "Not you?" to clear
(field + storage + refocus), and **auto-focuses the first EMPTY field**: PIN when the
username is remembered, username otherwise. All of localStorage is try/caught (the
per-viewer-convenience rule). Verified: prefill, PIN-focus-when-remembered, and the full
"Not you?" clear cycle.

**`src/lib/useCapsLock.ts` reads `getModifierState` off the field's OWN key events**, not
a global listener — it is reliable only on a real key event and a phone's on-screen
keyboard reports nothing, so it is inert exactly where it has nothing to warn about (a
phone has no caps lock). The hint is `warn`-toned and suppressed while an error already
shows under the PIN.

**The staggered entrance reuses `motion.ts`'s `listVariants`/`rowVariants`** — the form
is a `motion.form` and each field group a `rowVariants` child, so fields cascade in under
the card's own entrance. The button shows a `CheckIcon` + "Signed in" the instant auth
succeeds, as the hand-off into the overlay.

⚠ **A CONCURRENT-EDIT COLLISION happened mid-task and is the lesson here.** All four auth
screens were rewritten; while the browser verification ran, the user was hand-editing
`SignIn.tsx` in their own editor (an older buffer) and saved it — silently reverting that
one file to a plain version ("Welcome!" copy, no features) while Input/Claim/ResetPin and
the three new files kept their new versions. Caught because the rendered page showed copy
("Forgot your PIN? Click here") that was not in the code just written. **SignIn was
re-applied ONTO the user's copy** (title "Welcome!", subtitle "Log in to your account to
access your progress.", "Forgot your PIN? Click here" preserved verbatim) rather than
reverting their words. If an auth `.tsx` ever shows copy that does not match the source,
suspect the user's editor has it open — read disk before assuming a build is stale.

Verified at 375x812 in both themes (`localStorage['classpoint-theme']`): zero horizontal
overflow on sign-in and claim, inputs 16px, eye toggles work, auto-focus and
remember-username confirmed by DOM probe. `npm run verify` green — **0 errors, 105
warnings (unchanged), 417 tests**. **The 2s success transition itself is NOT verified
against a real sign-in** (no test student credentials) — it is verified by typecheck,
build and logic only, like the aurora pass. ⚠ The stagger entrance photographs faded
because framer-motion's rAF is starved while the pane is not compositing (the documented
artifact); the DOM measurements are the reliable signal.

⚠ **THE TRANSITION DID NOT SHOW ON A REAL SIGN-IN, AND THE GUARD RACE IS THE LESSON
(2026-10-21).** The first version rendered the overlay INSIDE the auth screen
(`{transition.overlay}` in SignIn's JSX) and navigated from the overlay's own timer. On a
real sign-in it never appeared: `RedirectIfAuthed` (the guard wrapping /signin, /claim,
/reset) redirects to /app the INSTANT auth resolves, so SignIn — and the overlay it
rendered — unmounted a tick after the server said yes, long before the 2s timer. The
guard won the race every time. This was foreseeable from `guards.tsx`, which had already
been read; a full-screen effect that must outlive a route change cannot be mounted by the
component the route change unmounts. **The overlay now lives in `AuthTransitionProvider`
at the APP ROOT** (App.tsx, wrapping `RouterProvider`), triggered through context by
`start()`. The guard redirects to /app UNDERNEATH; the `fixed inset-0 z-[100]` layer stays
mounted across the redirect and covers it for the full 2s, then unmounts after its
fade-out has already gone transparent, revealing /app (mounted behind it the whole time).
**No navigate lives in the overlay any more** — the guard is the only thing that moves the
route, so `start()` takes no destination. Verified by a temporary probe route
(`/__fx`, removed, residue-checked) that called `start()` on mount: the overlay mounts at
root, `z-index 100`, covers the viewport, `bg` canvas, logo + "ClassPoint" present, and
opacity sampled `1` steadily across 5 reads (it animates in and holds). ⚠ Its SCREENSHOT
still captures black — the pane's screenshot grabs a pre-composite frame — so the DOM
opacity sample, not the screenshot, is the proof here.

Era 7.0 — the material layer (2026-10-22 to 2026-11-04). Decisions (user): **lit edges
+ an elevation ladder** · **fine grain globally, a dot grid as a scoped surface
treatment** · **responsive motion on one spring system, no new always-running
animation** · **defects, then foundation, then screens**.

**The diagnosis, because it explains every choice below.** Era 6.0 left the COLOUR layer
mature (role tokens picked by measured ΔE and contrast, pinned by `tone.test.ts`) and
everything else unsystematised. Measured across ~30,000 lines: **41 shadow utilities**
(so no elevation language at all), 7 untokenised radii, 7 untokenised control heights,
**25 inline spring definitions**, 20 arbitrary `z-[...]`, and three of the most-visited
student screens hand-rolling `animate-pulse` while 45 other sites used the `Skeleton`
primitive. The app read flat because it WAS flat, not because the colours were wrong.

**Phase 1 fixed four verified defects.** The headline one: `.dark` was applied in a
`useEffect` in `theme.tsx`, so it only landed after a 515KB bundle had parsed and
mounted — **every dark-mode user got a white flash on every cold launch of the installed
PWA**, because `:root` resolves to light (`--canvas #f3f3f6`) until the class arrives.
Fixed with a blocking inline script in `index.html` placed BEFORE the only render-blocking
stylesheet, which is a spec guarantee rather than a timing race: no paint happens until
that stylesheet loads, and the script has already run. It mirrors `getInitialTheme()`
exactly and the effect then writes the same value, so the two cannot disagree. The
`try/catch` is load-bearing — `localStorage` throws in some private-browsing modes and an
uncaught throw in a head script stops the page dead. `theme-color` is now resolved by that
same script and kept in sync by the effect; a media-scoped `<meta>` pair was rejected
because it follows the OS preference and would disagree with an in-app override.
Also: `PodiumBoard.tsx`'s `RestRow` had a bare `layout` prop while `initial` one line below
WAS reduced-motion gated (~205 FLIP participants on the instructor board, in the subtree
`CommentsOverlay` re-renders on every realtime comment); three dead keyframes removed
including `cp-podium-glow`, the only animation in the app touching `box-shadow`; and the
per-pill `backdrop-blur-md` dropped from every flying comment, which composited over
Shell's three permanent blur layers for no visible gain at `bg-card/92`.
⚠ **A plan claim that was WRONG and is worth not repeating:** the 888KB `levelup.mp3` is
NOT precached. The manifest is 132 js, 4 png, 3 svg, 2 ico, 2 html, 1 css, zero audio. It
is still a real cost, just differently — `sound.ts`'s unlock primes all four clips with
`preload='auto'` on the FIRST TAP ANYWHERE. Re-encoding it changes how the app sounds, so
it is the instructor's call and is still open.

**THE RADIUS LADDER WORKS BY OVERRIDING TAILWIND'S OWN `--radius-*` VALUES, AND THAT IS
THE CONSTRAINT THAT KEEPS THE WHOLE ERA SAFE.** `lg` 8→10px, `xl` 12→14px, `2xl` 16→18px,
`3xl` unchanged. All 275 existing `rounded-*` sites moved with **zero files edited**.
Inventing a name instead (`rounded-card`) is silently broken: `cn.ts` is bare twMerge with
no `extendTailwindMerge`, so it classifies an unknown word after `rounded-` as a COLOUR and
drops the size. Nothing errors; corners just quietly go square. **Do not add custom
`rounded-*` or `text-*` names — retune the `@theme` value.** `rounded-full` is not a token
and is untouched.

**Light and dark carry depth by DIFFERENT means, and that is measured rather than
stylistic.** In light a card is `#ffffff` on `#f3f3f6`, so a shadow has something to darken
and a white top highlight would be invisible. In dark the reverse: canvas→card is ΔL* 6.3
and a black shadow on `#08080b` has almost nothing to darken. So light leans on
`--elev-shadow-*` and dark leans on `--lit`, and **both tokens exist in both themes so no
component ever branches on theme**. `--lit` is `transparent` in light on purpose: shipping
a white hairline on a white card is not a subtle effect, it is a pseudo-element painted for
nothing on every surface.

**`.cp-lit` uses `border-radius: inherit`, NOT the mask-composite gradient-border trick.**
Verified in the browser: a 16px parent gives a 16px pseudo, so the hairline is clipped by
the curve and stops short of each corner instead of cutting across it. mask-composite was
rejected because its failure mode on an unsupporting engine is the element disappearing
outright (the same reason `ClaimDoor` uses a dashed perforation). `inset: 0` resolves
against the PADDING box, so on a bordered card the hairline sits just inside the border.
⚠ `.cp-lit` sets `position: relative`. Harmless for `fixed` descendants (only transform,
filter, will-change and contain create a containing block for those, so every Sheet
backdrop is safe) but it DOES become the offset parent for absolutely positioned children.
⚠ **DO NOT STACK `.cp-elev-*`.** twMerge does not recognise `cp-*` names, so it passes both
through and CSS source order picks the winner rather than the author — the same class of
bug the plain-join `cn()` caused app-wide. `Card` emits exactly one.

⚠ **NEVER RAISE A `--color-plate` SURFACE** (the home scoreboard, `YourRankCard`). The
plate is declared in the FIXED `@theme` block precisely so it does NOT flip, while `--lit`
does and is transparent in light. A lit edge on a permanently dark plate renders for
dark-mode students and **silently vanishes for light-mode ones**, which is invisible in
whichever theme the author happens to be using. Those surfaces carry their own fixed
`ring-1 ring-white/10`, and that is correct rather than an oversight. Pinned in
`material.test.ts`.

**Grain is global atmosphere; the dot grid is a scoped SURFACE treatment.** Grain is a
fixed `body::after`, one tiled 160×160 raster painted once and composited thereafter, at
`0.02` light / `0.035` dark, `pointer-events: none`, at the top of the z ladder so a sheet
or a burst wears the same film, and switched off in `@media print`. Verified it survives
`body { overflow-x: clip }`: a fixed pseudo still lays out at full viewport size because
body creates no containing block. `stitchTiles='stitch'` is load-bearing — without it
feTurbulence restarts its noise field at every tile edge and the seams read as a visible
160px grid. ⚠ **`.cp-grid` goes on a DECORATIVE ABSOLUTELY POSITIONED CHILD, never a
content box**: it carries a mask, and a mask applies to content as well as background, so
on a container it would fade the text out with the dots. Aurora is the pattern to copy. It
is deliberately NOT used behind scrolling lists or on the leaderboard board area, where it
would compete with the flying pills and the podium.

**FIVE NAMED SPRINGS, and the count in the plan was wrong.** The plan said six competing
definitions; the real number was **25**. Now 4. `snap` 400/30 (UI state feedback) ·
`glide` 320/32 (large surfaces) · `settle` 120/20 (values coming to rest) · `tap` 600/20
(direct manipulation of a small target, stiffer on purpose because it is felt rather than
watched) · `pop` 300/18 (a celebratory overshoot — the ONLY role where a visible bounce is
the message, and it was written out three times, twice in one file, before it had a name).
`spring` 260/24/0.9 remains the house general. The four survivors all carry per-element
computed delays or are declared art (PodiumBoard ×2, `AchievementUnlockBurst`,
`HomeHero`'s 500/18 points pop) and are deliberate.

**`ScreenTitle` is the counterpart to `PageHeader`, and the trap it exists to prevent is
one I nearly walked into myself.** `PageHeader` always renders a back button, correct for
every screen it serves because all of them are pushed onto the stack (hence its required
`fallback`). Home, Ranks, Attend, Profile, Grades, History and Student Space are nav
DESTINATIONS with nothing to go back to — which is exactly why all seven hand-rolled an
`<h1>`. **That reads like drift and is correct**, so the obvious cleanup ships a back
button onto seven root screens. Adopted on 7 of them. Its alignment is DERIVED, not a prop:
`items-start` with a subtitle so actions line up with the title, `items-center` without,
where a 24px title beside a 44px control reads as misaligned. It also settled three
`text-2xl` outliers — Profile, Sections and Student Space — **all three of which turned out
to be root screens**.
**`SectionGrid`, `StudentSpace` and both Leaderboards keep bespoke headers.** They differ
in LAYOUT (a wrapping two-button row, a status chip that qualifies the title by sitting
beside it, a truncating title with a caption chip), not in style, and this codebase has
already reverted two UI changes for collapsing exactly that distinction.

**Elevation is opted into, never swept.** `Card`'s `elevation` defaults to `flat`, which is
byte-identical to what it rendered before the prop existed, so no existing card moved. Five
subject surfaces rise: the UsePoints balance, the Attendance summary, both QR cards and the
Lounge `EventCard`. Elevation only means anything while it stays rare.

**`material.test.ts` (17 tests) pins all of it**, in the spirit of `tone.test.ts`: pure
source parsing, no mocking. It guards the radius trick, the both-themes rule, the absence
of mask-composite, grain never reaching paper, the plate rule, the repeated-row rule
(`MessageRow`, `PostCard`, `PeerCard`, `PeerResultCard` can never take elevation or a lit
edge — `MessageRow` has no bubble BY DESIGN, and a lit edge per row rebuilds it by another
name), and that `pop` stays the only role that visibly overshoots. Every guard was verified
to FAIL on an injected violation.
⚠ **A guard must not fire on prose about itself.** The mask-composite check failed on its
first run against the comment explaining why mask-composite was avoided. Hence
`stripComments()` / `CSS_CODE` — any new source-text guard in this file must use them.

**Deliberately left, each for a reason a sweep must not "fix":** the 20 arbitrary `z-[...]`
(the ladder is defined and documented, but most sit on authenticated screens that cannot be
verified in this environment, and a wrong z-index is invisible until it is catastrophic —
they migrate per screen); `Students.tsx`'s structure; `GradeGrid`, which is untouched and
**provably unaffected by the radius retune because it contains no `rounded-*` classes at
all** (its load-bearing `w-22 min-w-22 max-w-22`, `size={4}` and `h-8` are intact);
`AttendanceSession`'s one remaining `animate-pulse`, which is a live-status dot rather than
a skeleton; `QrScanner`'s bordered empty and `EventConsole`'s two "Loading…" lines, which
are loading states rather than empty states and would be a box inside a box as a compact
`EmptyState`; and `Ops.tsx`'s `ErrorLine`, which the audit called a fourth error treatment
and which already delegates to `<ErrorState inline>` — it is a thin alias, not drift.

**The Dashboard banners stay OUTSIDE the stagger, and the plan was wrong to want them in.**
Each returns `null` when inactive, and an empty `motion.div` is still a `space-y-5` child,
so three inactive banners would add ~60px of phantom gap on an ordinary day. Two of them
already own entrance animations timed to the EVENT rather than to page load, which is right
for a banner that appears mid-session.

**Build:** `vite.config.ts` had no `build` key at all. Three vendor chunks now split
`react`/`react-dom`/`react-router-dom`, `framer-motion` and `@supabase/supabase-js` out of
the eager entry (515,707 → 33,470 bytes). The split is for CACHE LIFETIME, not first-load
size: all three are imported eagerly, so what it buys is that an ordinary deploy no longer
invalidates ~300KB of unchanged dependency bytes. react and react-dom MUST stay in one
chunk — separating a library from its renderer is the classic initialisation-order crash.
The whole material layer costs **+1.15KB of CSS** (117.50 → 118.65KB).

⚠ **A fourth Browser-pane artifact, beside the three already recorded:
`requestAnimationFrame` is STARVED while the pane is hidden, so a measurement script that
awaits a frame simply never resolves and times out at 45s.** `getComputedStyle` forces a
style recalc synchronously and needs no frame — measure with it instead of waiting on rAF.

**Verified: 0 errors, 107 warnings (unchanged throughout), 449 tests.** ⚠ The warning and
test baselines recorded earlier in this file were STALE (105 / 417) before this era began;
my own edits added zero warnings, confirmed by stashing them and re-linting. Landing and
all four auth screens measured at 375px in BOTH themes: zero overflow, zero escaping
elements beyond the aurora's own contained blobs, inputs still 16px. **Nothing in the
student, instructor, space or peer areas has been seen rendered on an authenticated
screen** — those are verified by typecheck, tests, build and temporary probe routes
(each removed and residue-checked) only. A guided pass on a real device is still the
agreed next step.

Pre-ship QA sweep (2026-11-04). A full responsiveness and overlap audit, run
because "ship-ready" is a claim that has to be measured rather than asserted.

**Method.** A detector injected into the running app that reports four things:
page overflow, content wider than its own box with nothing clipping it (the
"crammed chip/frame" case), text that is not the topmost element at its own
coordinates (the covered-text case), and expanded tap regions that collide.
Run over the six real unauthenticated routes, plus a stress probe mounting the
components that carry the risk — `ScreenTitle`, `PageHeader`, `HomeHero`,
`Stat` 3-up and 4-up, `Chip` rows, `PersonRow`, `PointEventRow`,
`SegmentedControl`, all three `ScaleRow` shapes, `Meter`, `XpBar`, `BadgeArt`,
all three `Card` elevations, `Input`/`Select`, both `EmptyState` variants, both
`ErrorState` variants, and tight `Button`/`IconButton` rows — with **worst-case
data**: a 53-character name, a 36-character section name, four-digit points,
Level 99. Measured at **320, 360, 390, 414, 768 and 1440**, in both themes.

**Result: zero defects.** Zero page overflow, zero escaping elements, zero
crammed boxes, zero covered text, zero tap collisions, at every width, in both
themes. All form controls 16px (the iOS zoom rule). 320px is the tightest case
the audit covers and nothing broke there, which matters because every earlier
phase measured at 375.

⚠ **A FIFTH BROWSER-PANE ARTIFACT, and the one most likely to waste somebody's
afternoon: `document.elementFromPoint()` RETURNS A STALE NODE while the pane is
not compositing.** Measured: at the point (54, 242) it returned an element whose
own bounding box is 249–306, which does not contain that y at all, while
`document.elementsFromPoint()` at the same instant correctly put the real
element at index 0. The singular API appears to read a cached hit-test tree that
the non-compositing pane never refreshes.

This produced two confident false positives on `HomeHero` ("Level" and "Points"
reported as covered) that look exactly like the real paint-order bug this file
already documents for the profile name. **Use `elementsFromPoint` and check for
index 0; never trust `elementFromPoint` here.** Note that the tap-target pass
recorded earlier in this file used `elementFromPoint` — its conclusions were
confirmed by other means, but a re-run should use the plural API.

Two further measurement traps found the same way, both instrument rather than
app: neutralising transforms globally to defeat a frozen spring also kills
`.cp-tap-44::before`'s own centring `translate(-50%,-50%)`, which inflates its
deliberate 4px spill to 26px and invents a dozen "crammed" findings — neutralise
only framer-motion's INLINE transforms instead. And a 44px hit region on a 32 or
36px control legitimately spills 4–6px past its parent's scroll width, so a
cramming check needs a tolerance above that or every icon button is a false
positive.


Since 0060 (Closing a semester — Era 8.0 Phase 1). Decisions (user, 2026-11-08):
**archive the whole semester in one action** · **archived students get a farewell
message, then a recap and the live board, and nothing else** · **the message is per
SEMESTER, edited on the Semesters screen, and plays on every sign-in** · **an empty
board shows a graphic and "the board is still silent", never a list of zeroes**.

**NOTHING IN THE APP COULD END A SEMESTER, AND THE GAP WAS INVISIBLE.** 0035 shipped
promote / archive / activate, but the only bulk archive reachable from the UI is
`SemesterRollover`'s step 3, which archives the UNTICKED students of the ONE section
currently chosen in its `From` dropdown — so closing a semester meant repeating a
confirm dialog once per section and hoping none was missed. `archive_semester_students`
takes a semester, writes one audit row per student and refreshes the leaderboard
snapshot **once** (archiving 208 students through the single-student RPC would rebuild
it 208 times — the reason `archive_students` exists at all). Idempotent: a second run
finds nobody un-archived, returns 0 and does not touch the snapshot.

**AN ARCHIVED STUDENT USED TO GET THE WHOLE APP, WORKING.** `resolveRole` decides
student-ness from the email domain alone, `RequireRole` passes, `getMyStudent` returns
their row because `students_select` is `using (true)`, and `StudentData.load()`
succeeds — so they saw a normal dashboard with a Scan button and every action failed
with a raw Postgres exception string. The only visible difference was that they had
vanished from the leaderboard. **`students.archived_at` is now SELECTED by
`getMyStudent` and is the whole client-side gate**: one column on a row the app already
fetches, so the decision is made before the first screen paints and no RPC is needed.
`AppLayout` renders `ArchivedScreen` instead of `StudentShell` and **suppresses all four
overlays** — a level-up burst, a badge unlock, "What's new" or an away-recap on top of a
farewell is absurd, and three of the four exist to pull someone back into an app they
can no longer use.

⚠ **`archived_at` IS NOT `semesterEnded`, and they genuinely disagree.** That flag is
derived from section membership, so a student can be archived while still sitting in an
active-semester section, and can be in a past-semester section without being archived.
Both stay; `archived_at` wins.

**THE ARCHIVED SCREEN ADDS NO READ PATH, AND THAT IS THE POINT.** Every figure comes
from a grant that already existed: `sections` and `semesters` are
`select … to authenticated` (0003, 0027), which is how a student reads the name and
message of a semester they are no longer in; `get_semester_leaderboard` is granted to
`authenticated` and deliberately INCLUDES archived students (0035); points, badges and
attendance are already on StudentData. So 0060 adds **one column and zero RPCs** on the
student side. ⚠ **`me.semester_points` is NOT their final score** — it is relative to
the ACTIVE semester and `set_active_semester` bulk-recomputes it for every student,
archived ones included, so the recap reads points AND rank from
`get_semester_leaderboard` for the semester they finished. The cached column would show
every returning student a proud 0. Attendance is scoped by the semester's own stored
term dates rather than through `term.ts`, because that calendar is configured for
whichever semester is active and pointing it at a past one would leave it wrong for
everything mounted afterwards.

**`restore_student_into` is the half 0023 was missing.** `restore_student` only clears
`archived_at`, which leaves the student in the section they had when they left — a
section belonging to a FINISHED semester — and `scan_attendance`'s active-semester guard
(0035) then refuses them with "That class belongs to a semester that has ended." So they
looked restored and could not attend a class, and **nothing failed at restore time**; the
failure surfaced later, to the student. The new RPC sets both columns in one transaction
with one audit row carrying both sections. It does NOT require the target section to be
in the active semester: the rollover wizard commits sections for a semester that is not
active yet, which is the normal order of work.
**`listArchivedStudents`' `sectionId` became OPTIONAL for the same reason** — after a
close, every archived student is in a section of a finished semester, a section that is
not in the instructor's current list at all, so the per-section drawer could not reach
one of them. `ArchivedStudentsSheet` is now ONE component with two mounts: per-section
off the roster (one-tap restore, because the destination is the screen you are on) and
cross-semester from `SemesterClosePanel` ("Restore into…", with a section picker).
⚠ The placement form **replaces the list in place** rather than opening a second
overlay: Sheet is portalled and focus-trapped, so a Sheet inside a Sheet stacks two
competing traps — which is exactly why `AppLayout` closes the mobile menu before opening
the sign-out dialog.

**Ownership move `request_point_redemption` 0029 → 0060**, body verbatim plus exactly one
line: an archived guard. It was **the only student-callable write in the app with no
archived check** — every other one already refuses — so an archived student holding
leftover `semester_points` could still file spend requests, which landed in the
instructor's inbox looking exactly like a live student's. Wording is word-for-word the
one the five existing guards use.

**`SemesterClosePanel` has its own semester picker, and that is not redundant.** The
obvious shape is "close the semester this screen is about", i.e. the active one — but the
instructor may activate the new semester FIRST and only then think to archive the old
batch, and at that moment the semester they want is no longer
`useInstructor().semester`, so an active-scoped panel could not reach it at all. It
defaults to the active semester. Closing is behind the typed-name `ConfirmDialog`
challenge, and the preview (`get_semester_close_preview`) states the real count with the
names behind a disclosure: a count the instructor cannot check is a count they learn to
tap past, and this one is 200 people wide. The farewell editor's **Preview mounts the
real `ArchivedFarewell`**, not a mock-up, so there is one definition of what the student
sees.

**The silent board.** `leaderboard_snapshot` has no `semester_id`; it ranks EVERY
non-archived student by `semester_points` (0038), and `set_active_semester` resets that
column for everyone — so the first morning of a new semester the board is forty students
tied at zero, alphabetical, wearing place numbers, which reads as a real ranking and is
not one. `SilentBoard` replaces the podium whenever `top.every(e => e.points === 0)`, and
`YourRankCard` is hidden with it ("#1" out of a field of zeroes is a number, not a
standing). The rule is **client-side on purpose**: teaching the snapshot or an RPC about
emptiness would be a second definition of "is this board live". `CommentsOverlay` still
wraps it — the composer is the useful half, and day one of a semester is exactly when a
class has something to say. `SpendBoard` uses it too, keeping its own actionable line in
`detail`, so the two boards feel like one app on day one.

⚠ **`SilentBoard`'S OUTLINE IS `--muted`, NOT `--line`, AND THAT WAS MEASURED.** The
first version stroked everything with `--line`, the right token for a border between two
surfaces and completely wrong for the only thing carrying a shape: on a white card in
LIGHT mode `--line` (#e7e7ec) is **1.23:1** — the whole podium was invisible, and
invisible in exactly one theme, so it looked fine to anyone working in dark mode.
`--muted` is 4.83:1 there. Measured after the fix, each translucent stroke **blended over
the card before computing** (reading an `rgb(… / α)` value straight into a contrast
formula gives nonsense): stand outline **3.00 light / 4.43 dark**, seat ring 2.32 / 3.30,
floor 2.14 / 2.98. Only the stands are held to 3:1 — the rest is secondary and everything
the graphic means is also in the heading beside it. The FILLS stay `--card-2` (1.04:1 in
light) deliberately: that is the app's documented theme split, where the surface step does
the work in dark and the stroke does it in light. Its animation is a **CSS keyframe**
(`cp-silent`, opacity only — a transform on an SVG child has a layout-relative origin and
the stands would drift off their shared floor), so the global reduced-motion block covers
it with no `useReducedMotion` guard.

**`ArchivedFarewell` WAITS FOR THE STUDENT (instructor, 2026-11-11).** It used to follow
`AuthTransition`'s single-timer pattern — a clamped reading time (3.6–9s) and then a fade-out
by itself. That is gone: it fades IN (opacity only) and holds until a tap, click, or
Enter / Space / Escape. A send-off that leaves while someone is still reading it is worse than one
that waits, and nothing is in its way (the screen behind it is a read-only recap). So there is **no
end timer at all**; the only timer left is `TAP_GUARD_MS` 700, which is still load-bearing: this
screen appears immediately after the student taps "Sign in", and without it the tap already in
flight would dismiss the farewell before it drew a frame — the same lesson `LevelUpBurst`
records. `onDone` lives in a ref (an inline-arrow callback is a new identity every render — the
Sheet focus-trap bug that cost 21 sheets their keystrokes). The layer takes focus on mount so the
keyboard can dismiss it. z-[90]: above Sheet (40) and the bursts (50), below
`AuthTransitionOverlay` (100), which is still fading out over the top of it.

⚠ **`material.test.ts`' PLATE GUARD WAS MISSING HALF ITS CALL SITES, and it was only
found by injecting a violation and watching the test pass.** The matcher was
`className=\{?(?:cn\()?…\}` — a BRACE expression. HomeHero and Leaderboard both wrap
their plate in `cn(...)`, so it worked there and looked complete; a plain string
`className="… to-plate … cp-lit"` has no braces and was invisible to it, which is exactly
how `ArchivedScreen`'s plate card is written. It now matches both forms, and a test
asserts the matcher itself finds each. **Same shape as the `border-t-brand-500` hole
`tone.test.ts` records: a source-text guard that enumerates one syntax silently exempts
the others.** Every new guard in that file was verified to fail on an injected violation
(framer-motion in SilentBoard, a hardcoded hex, a transform in the keyframe, `cp-lit` on
a plate in both syntaxes).

**Verified: 0 errors, 110 warnings, 454 tests** (from 0/107/449 — the three new warnings
are all `react-hooks/set-state-in-effect` firing on the house fetch-on-mount pattern that
every screen in this app uses, left for the ESLint pass rather than deviating in three
files). Built CSS 118.65 → 120KB. Measured by probe at 375×812 in BOTH themes (removed,
residue-checked): zero page overflow, zero escaping elements, the farewell mounts at
z-index 90 covering 375×812 with opacity rising to 1 and holding, a tap at 250ms is
IGNORED while one past the guard closes it, and it completes on its own between 3s and
7.2s for a 123-character message. **Not verified on a real archived account** — that
needs the instructor to close a semester, which is the one thing this phase exists to
make safe.


Era 8.0 Phase 2 — the minor revision batch (2026-11-08, NO migration). Eight items
the instructor listed, every one of which turned out to have a measured defect
behind it rather than a preference.

**⚠ THE PASSWORD REVEAL CONTROL HAS BEEN LAID OUT WRONG SINCE IT SHIPPED, AND THE
CAUSE IS A CSS CASCADE RULE WORTH KNOWING.** `.cp-tap-44` / `.cp-tap-y` set
`position: relative` so their 44px `::before` has something to position against —
and that rule was **UNLAYERED**. Per the cascade, unlayered styles beat every
LAYERED style regardless of specificity or source order, and
`@import 'tailwindcss'` puts `.absolute` in the `utilities` layer. So any element
carrying both `cp-tap-*` and `absolute` was silently pinned to `relative` and fell
back into the document flow. **Exactly one call site in the app does that** — the
reveal button inside `Input` — so on all four auth screens it rendered BELOW the
field, left-aligned, stretching the field's wrapper from 44px to **76px**.
Measured at 375px: the button sat at **x=8** with `position: relative` where it
belongs at x≈303. The rule now lives in `@layer components`, so a utility wins as
it always should have; the `::before` rules stay unlayered because nothing
competes for `::before` on these. Pinned by two tests in `material.test.ts`.
⚠ It is also why the Era 7.0 auth verification missed it: the check was
`button.right <= field.right`, which passes **vacuously** for a button sitting at
the LEFT of the field. My own first check this phase was the same shape and passed
the same way. A geometry assertion has to pin the side it cares about.

**The reveal control is now a labelled Show / Hide, not an eye** (the instructor's
call). The eye is the convention and the one piece of chrome here where the
convention is not self-explanatory — which of two eye glyphs means "currently
hidden" versus "tap to hide" genuinely has to be learned. A word does not. It also
carried the geometry fix: a text button needs `pr-17` instead of `pr-11`, which
moves the control clear of the typed text. Measured after: text ends at x=291, the
button starts at x=303 — **12px of clearance where there was a 6px overlap**, and
a 44px-tall hit region (`.cp-tap-y`, height only; expanding sideways is the defect
being fixed). "Show" and "Hide" are both four characters, so the control is 48px
wide in both states and nothing shifts; `min-w-12` holds that floor for a future
translation. `EyeIcon` / `EyeOffIcon` were deleted — nothing else used them.
`revealable` was also added to the three Change-PIN fields in Settings, which had
none.

**⚠ `.cp-rise` REPLACED `.cp-fly`, AND THE `container-type` TRAP IS NOT WHAT I
FIRST WROTE DOWN.** Comments now rise up a single narrow column instead of flying
right-to-left across five lanes: at five lanes the whole board sat behind moving
text, and one column covers a single strip and lets a comment be three lines tall
without threatening anything. The keyframe travels `-100cqh - 100%`, which
requires **`container-type: size`** on the track. I documented the failure mode as
"`cqh` resolves against nothing, so every pill sits still" — **that is wrong, and
measuring it in the browser is what caught it.** `inline-size` establishes a query
container on the INLINE axis only, so `cqh` skips the track and falls back to the
small VIEWPORT: a 206px track moved a 38px pill **−244px correctly and −849px**
under `inline-size`. The pill does not stop; it goes about four times too far in
the duration `flightDurationMs` derived from the track's height, so every pill
moves four times too fast and the no-overlap guarantee silently stops holding
while the screen merely looks "a bit fast". Both comments now say that, and
`material.test.ts` pins the container type and the keyframe.

`danmaku.ts` is **reused, not rewritten** — not a line of its arithmetic changed,
because the guarantee is about a distance and a size and never cared which axis
they were measured on. Its parameters are now `travelPx` / `pillPx` rather than
`deckWidth` / `pillWidth` to say so. ⚠ The caller must pass the size **on the axis
of travel**: `offsetHeight`, not `offsetWidth`. Passing the width while the pill
rises holds the column for the wrong duration and lets a tall comment be
overtaken, and nothing else in the system would notice. `laneCount` was deleted
(it derived a lane count from the viewport height, which means nothing for one
column) and `danmaku.test.ts` grew a `the rising column` block running the same
disjointness proof with real vertical numbers — one-line 40px and three-line 78px
pills on a 632px track, plus a 195px landscape track where the guarantee must not
depend on the track being long. Both halves verified to fail on an injected break.
The assign interval is also **gated on something being parked** now; it used to
run five times a second for the life of the screen.

**The 120-character limit was already 120** — in `types.ts`, in the table CHECK and
in the RPC. What was missing was any way to SEE it: the field simply stopped
accepting characters. There is now a counter that appears once you start typing and
turns `warn` over the last 20. No migration.

**⚠ THE PODIUM'S WIDTH USED TO DEPEND ON THE NAMES IN IT** (the instructor's
report: "the rank 1 2 3 design width is changing based on the name, it looks
awkward and weird. It SHOULD not move."). The cards were `flex-1` items with
`max-w-[12rem]` on the champion and `max-w-[10rem]` on the others. `flex: 1 1 0%`
looks like three equal columns, but a flex item's `min-width` defaults to `auto`,
so each card's min-content size became its floor — and the children that do NOT
truncate contribute to it: the points figure, the "Lv 12" line, the pedestal, the
signals row. So the row visibly reshaped between two refreshes of the same board.
It is a **`grid grid-cols-3`** with `min-w-0` on every cell now, so each card is
exactly one third whatever is in it; `min-w-0` is the half that matters, because a
grid item ALSO defaults to `min-width: auto` and is the documented reason
`truncate` silently did nothing in `Stat` and `ScaleRow`. The champion is raised by
**height alone** — taller pedestal, larger avatar — which is all width was ever
contributing. Measured at 320 / 360 / 375 / 390 / 414 / 768: all three cards equal,
and **byte-identical between a 3-character-name fixture and a 53-character-name,
four-digit-score fixture**, with zero overflow.
**`podiumOrder` became `podiumSlots`, three fixed slots with holes.** The old
`top3.length >= 3 ? [#2, #1, #3] : top3` fell back to natural order, so a board
with two ranked students put **#1 on the LEFT** — i.e. the podium read backwards in
exactly the first week of a semester, when that is most likely. #2 left, #1 centre,
#3 right, always; an empty slot holds its third of the row open.

**Both leaderboard pickers moved out of their header row.** They were
`wrapperClassName="max-w-34 shrink-0"` + `className="h-9! text-sm!"` — a hard 136px
box whose chevron eats 40px, leaving about enough for "Global", on a screen whose
whole job is naming a section. Full width on their own row now, at the primitive's
real height, on BOTH boards (they share a switcher, so one readable and one clipped
is worse than either). The `!` suffixes only ever existed to beat the old
plain-join `cn()`.

**The attendance summary card is scoped by term.** A quiet `SegmentedControl` of
Prelim / Midterm / Finals / Overall (Overall default), and **the whole card
follows it** — counts and rate alike, because three lifetime counts above a
per-term percentage is two scopes stacked in one box. `termRanges()` finally has a
real caller; until now it was exercised only by its own test. The picker renders
only when there is **more than one term with classes in it**: offering Midterm and
Finals tabs in week two gives a student two ways to be told "nothing yet".
⚠ A term with nothing counted shows a **dash, not 0%** — `rateOf` answers 0 there,
which on a student's screen reads as "you attended none of them". `lib/attendance`
now says so where `rateOf` is defined, and `term.test.ts` grew a block pinning the
boundary days (prelim ends 07-26, midterm starts 07-27) and the **partition**
property: filtering by term must never put one class in two terms, or the per-term
rates stop reconciling with Overall. Both verified to fail on an injected
off-by-one and an injected overlap.
"Show-up rate" is **"attendance rate"** in every UI string. The function names
(`rateOf` / `rateTone` / `showedUp`) were deliberately left alone — renaming them
touches five call sites and the comment pinning this file to
`get_section_attendance_stats` (0031) for no user-visible gain — so the prose in
`lib/attendance.ts` still says "show-up" and now explains why.

**`components/attendance/ScanStage.tsx` centres the camera.** The scanner was
already `mx-auto`, so the complaint was the FRAMING: Attendance opened it in a
bottom `Sheet`, which rises from the bottom edge, so the viewfinder sat low on the
screen directly above the button just tapped. The sheet is `variant="screen"` now
and the stage centres the camera in the viewport with the caption under it and the
way out at the bottom. ⚠ `h-full` **and** `min-h-[60dvh]` together, both
load-bearing: `h-full` resolves against the screen Sheet's definite height, and
computes to auto — harmlessly ignored — inside EventScan's card, where the `min-h`
takes over. One class set, no `fill` prop, no second layout. Both call sites use
it; they had already duplicated the same `space-y-3` + caption stack with captions
differing only in wording, so this is the fourth-copy rule applied at copy two.

**"Checked in" is gone from the UI: 48 strings across 15 files**, student and
instructor. Applied by a script that **fails loudly on any string it cannot find**
— a sed sweep that silently matches nothing is how a vocabulary change ends up
half-applied, which is worse than not doing it, because the app then says both
things. It caught one genuine miss (the bulk-mark confirm's "Everyone who hasn't
checked in yet", twice) and one apostrophe mismatch. **Deliberately NOT renamed:**
the `Checked In` achievement title (students may already hold it), the
`'Checked in'` column in `attendance-io.ts` / `export-all.ts` and the printed
Attendance Record header (files already filed keep their shape), the notification
titles inside applied migration 0024, every code comment, and **every shipped
`CHANGELOG` entry** — rewriting an announcement that already went out is
falsifying history. The one changelog line that DID change is in `DRAFT_EVENTS`,
which has not shipped, so it will go out in the new vocabulary.

**Sign out is red at rest in the student menu**, which REVERSES the decision
recorded in `AccountMenu.tsx` ("rests muted … so a menu never looks alarming").
Under five ink-coloured nav rows and an ink Settings row, muted read as DISABLED —
the same failure the comment on `SettingsRow` already describes for muted text in
that menu. The comment now carries the new reason rather than being deleted, so it
is not reverted by the next reader. Settings' own Sign out matched it and **gained
the ConfirmDialog it never had**: two paths to the same action, one of them a
single tap, on a screen students open to toggle sounds.

**Verified: 0 errors, 110 warnings (Phase 2 added NONE), 467 tests** (from
0/110/454). Measured by probe at 375×812 and re-measured at 320/360/375/390/414/768
(removed, residue-checked): podium widths content-independent at every width, zero
page overflow, the reveal control absolute and 12px clear of the text with a stable
48px width across both states and `tabIndex -1`, the toggle flipping
password↔text with `aria-pressed` and an `aria-label` containing its visible word,
and `.cp-rise` resolving `cqh` to exactly −(track + pill) with opacity fading in
and out. ⚠ A CSS keyframe does **not advance** while the pane is not compositing
(the documented artifact, now with a third symptom): sampling the pill's position
over time returned six identical values. Read a keyframe's resolved state instead
by pausing the animation at a negative `animation-delay` — `getComputedStyle`
forces a synchronous recalc and needs no frame. **Not verified on a real
authenticated screen**; the leaderboard, attendance and scanner screens all need a
login.


Since 0061 (`set_active_semester` — "UPDATE requires a WHERE clause", 2026-11-08).
Reported by the instructor: activating a newly created semester from
/teach/semesters failed outright and switched nothing. See the pg_safeupdate
bullet in the Migration workflow section for the rule; the short version is that
0035's bulk `semester_points` recompute was **deliberately unqualified** (every
student row, archived included — it says so in its own comment) and Supabase
refuses an unqualified UPDATE for the API roles.

**IT PASTED, IT PASSED ITS OWN ACID TEST, AND IT COULD NEVER RUN.** The SQL
editor is `postgres`, which pg_safeupdate exempts — so the migration applied
cleanly months ago, 0029's identically-shaped top-level backfill ran fine, and
0035's footer ACID TEST (run in the editor) proved the round-trip worked. The
only path that fails is the one the app uses. **A migration that pastes cleanly
can still contain a statement no API role can execute**, and nothing in the
project's verification habits would have caught it: the fix is to audit for the
shape, which 0061's header records doing across 0001–0060.

The replacement computes the balance once in a `from (…) v` subquery and joins
on `where v.id = s.id`. That satisfies the guard with a REAL predicate rather
than a tautology like `where s.id is not null`, keeps ONE copy of the balance
expression (a `where semester_points is distinct from <expr>` would have needed
two), and still updates every student row exactly once. The body was EXTRACTED
from 0035 programmatically and then diffed, so the WHERE clause and its comment
are provably the only differences. 0035 is not edited.

Era 8.0 Phase 3 — the grade admin rebuild (2026-11-08, no migration). Decisions
(user): **one screen, scope in a toolbar** · **grouped header band** · **row
numbers, striping, crosshair**.

**`GradesConsole` IS DELETED, AND THE CARD WALL WAS THE CONFUSION.** It was one
card per section × subject, each carrying three term links and a small Weights
button — a dozen cards and thirty links for two subjects, where every entry led
to the SAME screen with different parameters. A menu whose every row goes to one
place makes choosing a scope feel like navigating, when the scope is two
dropdowns. `/teach/grades` is now a **resolver** (`GradesEntry`): it redirects to
your last scope, or the first section × subject pairing that exists.

**The scope stays in the PATH, and that is not negotiable.** `Shell` only ever
sees `pathname`, which is what lets `routeWidth` give the grid the full window; a
sheet rendered at `/teach/grades` with its scope in state would be stuck in the
672px reading column. So the resolver redirects rather than rendering.
`src/lib/grade-scope.ts` remembers it (`cp_grade_scope_v1`), **validated on read**
— a half-written entry would otherwise put `undefined` into a URL — and
`GradesEntry` additionally checks the saved pairing still EXISTS, because a
section can be deleted and a subject unassigned between visits and a stale
pairing lands on a sheet that can only show its error state. One place decides
whether a scope is still real.

**`ScreenTitle`, not `PageHeader`, and this is the trap Era 7.0 documented.** The
sheet is a nav DESTINATION now — `/teach/grades` resolves straight to it — so
there is nothing to go back to, and `PageHeader` always renders a back button.
Shipping one here would send the instructor to a redirect that bounces them
straight back to the screen they just left.

**Changing section can orphan the subject, and `goTo` is the one place that
knows.** Sections do not all take the same subjects, so picking a new section
with the current subject unassigned would navigate to a pairing whose sheet can
only error. `goTo` falls to that section's first subject instead. It is also the
only writer of the remembered scope, plus an effect that records the scope you
ARRIVED at — without that, a deep link followed by a tab-bar visit to Grades
would send you back to the last scope you picked by hand rather than the one you
were just looking at.

**`subjectPolicyError` moved to a chip on the Subject picker.** That warning was
the console's one genuinely useful signal: a subject needs all three policy rows
and each has to add up, and when it does not EVERY figure on EVERY sheet for that
subject is withheld. It is distinct from `policyError`, which is about the one
term on screen — a missing Finals row withholds every final grade while the
Prelim sheet in front of you looks perfectly fine.

**Weights and Columns merged into `GradeSetupSheet`.** With the landing gone,
weights needed a home, and a toolbar already carrying Import / Export / Print did
not need two more buttons. ⚠ **The two tabs have DIFFERENT SCOPES and each says
so on screen** — that ambiguity is exactly why the weights editor was kept off
the grade sheet when it was built (a sheet is scoped to one section; weights reach
every section taking the subject). Putting them side by side concentrates the
hazard rather than removing it, so each panel states its own reach in its first
line, the header names the scope of the tab you are on, and the weights confirm
still counts the real sections. **Do not delete those sentences to tidy the
layout.** One panel is mounted at a time (conditional render, not `hidden`):
both seed their drafts on mount, and switching tabs discarding a half-typed draft
is correct, because the two tabs write to different tables.
**The merge was done by EXTRACTING each body with a script, not retyping it** —
`WeightsSheet`/`GradeItemsSheet` became `WeightsPanel`/`ColumnsPanel` by removing
only their `<Sheet>` wrapper, because 770 lines carrying the impact preview, the
auto-balancing pair, the max-change warning and the archive confirm is where a
transcription error lands in code that moves every grade in a section.

**`completionByTerm` in `grading.ts` (+6 tests) answers "what is left".** ⚠ The
denominator is `sumMax`, NOT `sumMaxMarked`, and inverting it gives a figure that
is **always 100%** — the worst possible failure for a progress read, because it
says "nothing left to do" and looks entirely plausible. Verified to fail on the
inverted denominator. A term with no columns reads **null → "—", never 0%**: the
instructor has not fallen behind on a term they have not set up, and 0% invites
them to go hunting for marks that cannot exist. All three terms sit on one line
under the tabs rather than inside them — a four-tab strip is ~85px per tab at
375px and "Prelim 18%" does not fit without shrinking the text past readable.
Its fetch is **separate from `load`**, scope-wide rather than term-wide, in its
own try/catch (the 0034 SectionGrid precedent) and deliberately NOT keyed on
`dirty`: re-fetching per keystroke would be a query per typed mark.

**The grid gained a component band, a row gutter, zebra and a crosshair.** None
of it touches the uncontrolled-input architecture, the row-local state, `size={4}`,
the `w-22` header cap, `h-8`, the frozen term grade or the Enter/↑↓ walk.
- ⚠ **TWO STICKY HEADER ROWS NEED TWO OFFSETS.** The band is `top-0` and the
  header below is `top-6` — 24px, which is exactly `h-6` on the band's cells.
  Both reference the same step on purpose; a measured magic number drifts the
  moment the band's padding changes, and the symptom is a header row overlapping
  the band by a few pixels *while scrolling*. Measured under a 600px vertical
  scroll: band at offset 0, header at 24, band height 24 — they abut exactly.
- The band is built from `items` by a run-length pass, so a component with no
  columns contributes no cell. That is only correct because `orderedItems` sorts
  by component then position; **if that ordering changes this must become a
  group-by.**
- ⚠ **ZEBRA IS PER-CELL, NOT ON THE `<tr>`.** The frozen name and term-grade
  cells set their own opaque background (they must, or marks scroll underneath),
  and that paints over a row stripe — so the banding would appear only between
  the frozen edges and read as a rendering fault. Verified: all four cell kinds
  alternate, and every frozen one stays fully opaque.
- The crosshair's ROW half is `focus-within:[&>*]` — no state, no re-render. The
  COLUMN half is one `focusedItemId` in `GradeGrid`, and **the hot path is free**:
  walking down a column fires `onFocus` 40 times with the SAME id and React bails
  out of an identical `setState`, so typing down a column renders nothing extra.
  Only moving ACROSS columns re-renders, once. Verified: focusing a cell tints all
  30 rows of that column and none of its neighbour, the tint follows a move across
  and stays put on a walk down.
- **`onAddColumn` was a dead prop** — declared and used by the grid's empty state,
  never passed, so "Add a column" could not render and the only way to create the
  first column was a header button named "Columns". It is wired to the Set up
  sheet now.

⚠ **A SIXTH BROWSER-PANE ARTIFACT: `element.focus()` DOES NOT RELIABLY FIRE A
FOCUS EVENT while the pane does not hold window focus.** It cost a confident
false negative here — the crosshair measured as completely broken (0 of 30 cells
tinted) while the code was correct, which looks exactly like the memoisation
problem the plan had warned about. The DOM showed the input WAS
`document.activeElement` and React's `onFocus` prop was present, yet the handler
had not run. Dispatching `focusin` explicitly, or calling the handler off
`__reactProps$…`, both work — the same distinction the `MouseEvent` needing
`view: window` note already records. **Verify a focus-driven behaviour by invoking
the handler, not by calling `.focus()` and measuring.**
A second instrument trap in the same pass: forcing a container to `width: 1920px`
inside a 1425px viewport reports 480px of page overflow that belongs to the probe,
not the app. Resize the viewport instead of the container, or read the scroller.

**Verified: 0 errors, 109 warnings, 473 tests** (from 0/110/467 — one warning
FEWER, since deleting `GradesConsole` took one with it). Measured by probe at
1440×900 (removed, residue-checked): both header rows pin and abut at 24px under
a 600px vertical and 285px horizontal scroll, the gutter and name freeze 32px
apart, the term grade holds the right edge, every item column is exactly 88px
even with "Performance Task 1" and a 52-character student name, and page overflow
is 0 at 1024 / 1280 / 1440. **Not verified on a real authenticated screen** — the
toolbar, the resolver and the Set up sheet all need an instructor login, and the
completion figures need 0057 applied.


Era 8.0 Phase 5 — the first-run tour (2026-11-08, NO migration). Decisions (user):
**four cards: points, attendance, leaderboard, spending** · **mini live demos** ·
**plain and friendly copy** · **plays on each of the first three opens, replaying
from the start every time** · **NO Skip on open 1; Skip on opens 2 and 3**.

**`Onboarding.tsx` IS DELETED.** It was a three-step bottom `Sheet` of paragraphs
gated once, ever, on `cp_onboarded`. The brief was that students skip wordy
instructions, so each card is now a title, ONE line and a miniature animated
demo of the real thing: an XP bar filling and a level badge popping, a QR with a
sweeping scan line resolving to "Attendance recorded", a podium rising under a
crown, and a balance dropping while the rank drops with it.

**THE RULES LIVE IN `lib/tour.ts`, PURE, WITH THE STORES INJECTED, AND PINNED BY
13 TESTS.** Every failure here is silent: a tour that never shows looks like one
nobody needed and one that nags forever looks like a feature. The rules: plays on
opens 1–3 from card 1 each time (finishing open 1 does NOT end open 2); skippable
only from open 2; never after open 3.
- **An "open" is a SESSION, not a mount.** `AppLayout` remounts after a
  sign-out/in and StrictMode mounts everything twice in dev; counting mounts would
  spend all three plays in one sitting. The count increments at most once per
  `sessionStorage` session (cleared when the installed PWA's webview closes, which
  is what "opening the app" means on a phone), and a session flag records
  `'open'` / `'done'` so a remount BEFORE dismissal still shows it and one AFTER
  does not. That idempotence is what lets a lazy `useState` initialiser call
  `beginTour` — React runs initialisers twice under StrictMode — and it avoids the
  `set-state-in-effect` warning a "count in an effect" version would have added.
- **Every key carries the student id** (a shared phone must not hand one student's
  plays to the next).
- **Fail safe is DON'T SHOW.** Storage that throws, a count that cannot be
  written, or an unreadable value all mean no tour — the opposite default shows it
  on EVERY open forever for anyone whose browser blocks storage.
- ⚠ **A REAL BUG THE TESTS CAUGHT: `Number('')` is `0`.** The first parser
  accepted `Number.isInteger(n) && n >= 0`, so an EMPTY stored value read as a
  valid fresh start — the one corruption the guard exists to refuse. It is
  `/^\d+$/` now. Each guard was verified to fail on an injected break (counting
  every call, skippable on open 1, failing open on a storage error).
- **Existing students never see it.** The old `cp_onboarded` flag is READ and
  never written: a student who got the previous intro has used the app for a
  semester, so their count is set to the maximum. ⚠ This means the current class
  does NOT get the tour — it is for students who arrive with the next semester.
  If the instructor wants it shown to everyone once, that is a one-line change in
  `startTour`, and it is the instructor's call.

**`IntroLayer` REPLACES `IntroOrWhatsNew` AND TAKES THE AWAY-RECAP IN WITH IT.**
One layer deciding which of three full-attention things the student sees, so they
never stack. The recap and "What's new" are both Sheets, and **Sheet's focus trap
is document-level** — left mounted behind the tour it would drag focus back into
itself the moment anything inside the tour was tabbed to. So they wait their turn;
the recap's events are held in StudentData until cleared, so it simply appears
once the tour is done. The tour also waits for a level-up or badge burst to clear
(two full-screen overlays have already drawn on top of each other once here), and
`open` stays true meanwhile so the others keep waiting too. Nothing renders until
`me` has loaded — the count is per student. Finishing marks the changelog seen
**only if no version has ever been seen**: on open 1 a new student must not get the
tour AND "What's new", but on opens 2–3 a genuinely newer entry should still show.
Archived students never reach it — `AppLayout` renders `ArchivedScreen` instead.

**The deck (`Tour.tsx`, z-[60])** sits above Sheet (40) and the bursts (50), below
the farewell (90) and the auth transition (100). Swipeable (`drag="x"` makes
framer set `touch-action: pan-y`, so a vertical scroll stays the browser's), with
Back/Next, dots, arrow keys, and a **500ms tap guard** — it arrives on its own once
data has loaded, not in response to a tap, so a finger mid-tap on the dashboard
behind it would otherwise land on Next and skip card 1 before it drew. It traps Tab
itself. ⚠ **The trap's first draft counted the invisible Back button** (`invisible`
on card 1 so Next does not jump) as the first focusable, so Shift+Tab from Next
compared against a node focus could never be on and escaped to the page behind;
hidden controls are filtered now. Escape is a skip, so it obeys the same rule as
the Skip button: on open 1 it does nothing.
`Button` does not forward a ref, so the primary button is focused through a
`data-tour-primary` attribute rather than changing a shared primitive for one call
site.

**The demos animate only opacity and transform, and a source-level test pins it.**
`TourDemos.tsx` loops on low-end Android in the first thirty seconds a student ever
spends in the app; animating `width`, `top` or `height` forces layout every frame
and looks identical on a laptop. So the XP bar is `scaleX`, the scan line is `y` in
pixels (hence every Stage has a FIXED pixel height), and the podium is `scaleY`.
The guard parses every `initial`/`animate`/`exit` object for its keys, asserts at
least ten were found (otherwise it passes vacuously), and has its own regression
test for the matcher. **Loops are keyframes with `times`, not `delay`** — `delay`
applies to the first iteration only, so a stagger built on it drifts out of step
from the second cycle; the stagger is baked into each element's `times`. The QR is
a deterministic pattern, not `Math.random()`, which would change every render.

⚠ **A SEVENTH BROWSER-PANE ARTIFACT, AND THE MOST MISLEADING YET: framer's
`AnimatePresence` EXIT NEVER COMPLETES, so the tour looked unable to navigate.**
The step counter advanced and `onDone` fired but the card title never changed, then
changed intermittently — a believable "backward navigation is broken" report that
was nothing of the sort. Framer runs opacity through the Web Animations API, and a
non-rendering page's document timeline does not advance, so `animation.finished`
never resolves and `mode="wait"` never mounts the next card. It is the same family
as the CSS-keyframe and rAF notes above, with a new symptom. **To verify
navigation logic here:** add a temporary
`<script>window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16)</script>`
to `<head>` (framer captures `requestAnimationFrame` at module load, so it must run
before anything imports framer) AND set `MotionGlobalConfig.skipAnimations = true`
from framer-motion — together they apply end states through the frame loop without
needing the timeline. With both, all 8 forward and backward transitions settled at
x=24–296 inside a 320px viewport. Remove both afterwards (`index.html` was restored
from a backup and diffed empty). Without the polyfill, `skipAnimations` alone
leaves a new card stuck at its `enter` pose (`opacity: 0; translateX(48px)`).
**The motion itself — springs, the demo loops — is NOT visually verified**; only
the logic, the final poses and the geometry are.

**Verified: 0 errors, 109 warnings (the tour added none), 490 tests** (from
0/109/473). At 320×640 — the tightest case: every card's stage is 272×208 and
inside the viewport, "Scan to record attendance" wraps to two lines and still
clears the footer, the footer stays in the viewport, zero page overflow, nothing
escapes any stage, and the `+5` pill was lifted 12px after the arithmetic showed it
touching the level badge at the instant it became fully visible. Open 1 has no
Skip and Escape is ignored; opens 2–3 have Skip and Escape both dismiss, once each;
a tap 60ms after mounting is ignored and one after 700ms advances; Tab wraps among
visible controls only. **Not verified on a real student login** — the layer's
wiring (`IntroLayer`, the session count, the WhatsNew/recap ordering) needs one, and
the copy is a DRAFT for the instructor to read before it ships.

Since 0062 (Student grades + grade boosts — Era 8.0 Phase 4). Decisions (user,
2026-11-09): **a student asks only AFTER their mark is entered, never when it is
already full** · **the bonus is CAPPED at the column's max and the real gain is
shown first** · **once per column** · **REVERSIBLE** · **student grades start
HIDDEN behind a switch** · **the student "so far" figure is the SAME number the
instructor's So-far toggle shows** · **the Home card shows the latest figure**.

**A BOOST RAISES THE ORDINARY `grade_scores.score`, SO NOTHING DOWNSTREAM MOVES.**
`grading.ts`, `get_section_grade_sums`, both exports and both print routes are
untouched, and 0057's rule ("`grading.ts` is the only definition; no SQL mirror")
holds — **extended to boosts: if you are about to put a weighting expression in
0062, stop.** The receipt (`grade_boosts`, PK `(item_id, student_id)`) only draws
the indicator and lets the instructor undo one. The instructor flags a column with
`grade_items.points_cost` (1–50) and `points_bonus`, both-or-neither (a CHECK). The
request is a `point_redemptions` row with `grade_item_id` and **`grade_bonus`, a
SNAPSHOT of the bonus at request time** — the student confirmed "5 points for +10",
so editing the column to +2 afterwards must not change what a pending request does.

**`request_grade_boost` re-checks everything, and `src/lib/grade-boost.ts` is its
preview** (`boostState` — every branch names the exception the SQL raises; change
one side, change the other, same commit, the `lounge-answers.ts` rule). The student
comes from `auth.uid()` and cannot be passed in. **Why "after the mark is in":**
approve-before-marking writes the bonus as the mark, and entering the real mark
afterwards silently wipes it. `decide_point_redemption` (0029 → 0062, body diffed
programmatically, every difference marked "0062") re-reads the column, the section
and the mark at APPROVAL time — marks and columns change between asking and
deciding — and refuses a cleared mark, a retired column, a moved student, or a mark
already at the max, each with a sentence ending "Decline this request."

**A REFUND IS A POSITIVE `redeem` ROW, AND THAT IS WHY NOTHING ELSE MOVED.** The
spend board (0038) sums `-points` over `category = 'redeem'`, so a refund nets out of
"spent" with NO change to `refresh_leaderboard_snapshot`; `cp_notify_point_event`
already skips `redeem`, so no second generic push; `listRecentAwards` already
excludes `redeem`, so the instructor cannot delete a refund and desync it. The cost
is one loosened CHECK: **`point_events_points_check` now allows +1..+50 for
`redeem`** (the constraint stores it as `points <= 50`, not "between" — a probe that
greps for the word finds nothing). `types.ts` and `PointEventRow` document it: **test
the SIGN, not the category, to tell a spend from a refund** — the row now reads
"spent" or "refund" instead of "redeem". A dedicated `refund` category was weighed and
rejected: it needed ownership moves of `refresh_leaderboard_snapshot` AND
`cp_notify_point_event` for a cleaner word. Known quirk: a refund that restores a lost
level triggers the ordinary level-up celebration, because `considerLevelUp` follows the
current level, up or down (read from the code, not observed).

**`reverse_grade_boost` puts the mark back ONLY if it is still what the boost wrote.**
`grade_boosts.score_after` is stored for exactly this. A cell the instructor has
retyped since is left alone — the points still return, the receipt goes, the column is
freed, and the result's `markRestored: false` is toasted — because guessing which of
two numbers they meant would be inventing a grade. The grid mirrors it: the corner
dot **hollows out** and its tooltip says "edited since" when `value !== scoreAfter`
(an import overwrites marks too, so this is reachable). Reversal is refused when the
original charge belongs to a PAST semester — the refund would be stamped into the
active one — and its lock order is `decide`'s (redemption, then student). It adds
status **`reversed`** to `point_redemptions` (not `cancelled`, which means a student
withdrew a PENDING request); the CHECK widening finds the old constraint BY
DEFINITION, because it was declared inline in 0019 and a name guess that misses
leaves the narrow rule rejecting `reversed` until the first reversal.

**Student grades are OFF until the instructor turns them on** — `app_flags.student_grades`,
seeded `false` with `ON CONFLICT DO NOTHING` (a re-paste must never flip a flag already
turned on), toggled from **Ops → Student grades** through `set_student_grades_enabled`
(audited as `'grade_visibility'`; `'grade_boost'` is the other widening of
`audit_log_action_check`, 18 values in all). **Opening goes through a confirm; hiding
does not** — a mis-tap on the way off costs less than hesitating. `get_my_grades`
returns `{ enabled: false }` rather than raising when hidden or archived, so the screen
can say "not open yet" instead of showing a failure.

**`get_my_grades()` is the ONLY door** (0057: "a student view gets its own aggregating
RPC"). It returns the caller's OWN marks and the weights, never an official figure and
never another student's row; jsonb numbers are real JSON numbers, so the PostgREST
numeric-as-string trap does not apply here. `src/lib/student-grades.ts` derives
everything from `grading.ts`, and **`student-grades.test.ts` reads the student-facing
source as TEXT and fails if any of it reaches for `'official'` or `finalGrade`** —
verified to bite by injecting each into `StudentGrades.tsx` and `Dashboard.tsx`. The
guard strips comments (these files document what they forbid) and has a matcher
self-test.

**"So far" for a student is the instructor's So-far figure, by the instructor's choice**
(offered: average only what is marked; withhold until every part has a mark). The cost
is known and stated on screen: a term with only quizzes marked reads LOW — measured
64.50 for a single 15/20 quiz — because each unmarked component takes the 60 minimum.
The caption says so ("Parts your instructor hasn't marked yet count at the 60
minimum"), and per-component rows show "—" for an unmarked part rather than a bare 60.
**If that proves confusing, the alternative is a third view in `grading.ts` with
hand-checked tests, not a client-side tweak.**

`StudentData` owns the grades slice (`grades`, `gradesLoading`, `gradesError`,
`reloadGrades`) — loaded off the critical path like achievements and attendance, and
re-read on a `point_redemptions` event for the student (the durable channel). **A
student has NO select on `grade_scores`, so a typed mark is invisible to realtime** —
marks refresh on open, on a return after two minutes away and on pull-to-refresh. The
Home card (`GradesCard`) and `/app/grades` fire no grade query of their own, and the
card renders NOTHING (no error, no placeholder) when grades are off, loading, failed or
empty. `StudentGrades` also reads `listMyRedemptions`, not for grades but because "can I
afford this / do I already have three waiting" is answered by requests that are not
boosts. **Grades is the seventh `SIDEBAR_NAV` entry (`TableIcon`) and NOT a bottom tab**
— the bar is full and the menu mirrors the sidebar; `/app/grades` is in
`routes.test.ts`'s `MUST_BE_LINKED`.

**Instructor side.** The Columns panel gets "Let students spend points on this column"
(a live sentence that is the same one the student will be shown; `boostTermsError` is
the client mirror of `grade_items_boost_range_check`, and the boost fields are sent
only when CHANGED so a rename still works before 0062). The grid draws a **dot, not a
chip** — the cell is 88px with the input filling it, so anything with width would sit
on the mark; it is `pointer-events-none`, and the receipts load in their own
state/try/catch (the `allSums` precedent), deliberately NOT in `load`, because they
change on approve/reverse and reloading the grid would remount every uncontrolled
input. The Requests inbox shows the column and the mark AS IT STANDS NOW (read fresh by
`attachGradeContext`, which swallows its own failure — a missing preview must not take
the inbox down, and the server re-checks anyway) with the capped gain, warns before a
doomed approval, and puts **Reverse** on an approved boost in Recent decisions.
`listGradeItems` and `listRedemptions` try the new columns first and FALL BACK on
`42703`, so pasting the client before the migration costs the boost fields and not the
screen. `components/ui/Toggle.tsx` was extracted from `InstructorSpace` when Ops needed
a second one.

**Backup:** both existing mirrors are widened in the migration (`alter table if exists
backup.… add column`) instead of left to the drift handler, which would PARK
`grade_items` and DROP `point_redemptions`. It works because both tables gain their
columns at the END, in the same order, and `select current_date, s.*` is positional.
`grade_boosts` joins the 365-day `kept` list.

`clearGradeScores` was fixed in passing: a pasted column of forty blanks fired forty
sequential DELETEs inside one flush; it is now one delete per column per chunk of 150.

**QOL batch (Era 8.0 Phase 6, same session; decisions 2026-11-09).**
- **Saving weights is atomic** — `save_subject_policy(subject, jsonb)` in 0062 §7b. The
  weights screen used to write three rows in a client loop; a failure after the first
  left the three term shares off 100%, which `finalGrade` reports as EVERY grade for the
  subject disappearing. The RPC writes all rows or none and **refuses a set whose
  `final_weight`s do not sum to exactly 1** — the cross-row rule 0057 could not make a
  CHECK. That is a guard on WRITES, not a weighting expression (0057's "no SQL mirror"
  stands): the columns are `numeric(5,4)` so the sum is exact decimal arithmetic with no
  float tolerance to disagree with `sumsToOne`, and the client keeps its own check so Save
  can explain itself. `saveGradePolicies` falls back to the old sequential saves ONLY on
  PostgREST's "no such function" (`PGRST202`/`42883`), so the editor still works before
  0062 is pasted; a real failure (the sum refusal, a CHECK) is never retried around.
  ⚠ In a `raise exception` format string a literal percent sign must be written `%%`, or
  it is read as a placeholder and the message itself raises "too few parameters".
- **Columns can be reordered** — Move up / Move down inside the edit row, not icon
  buttons in the list row: four small controls on one line would break the tap-target
  adjacency rule (`sm` needs `gap-3`), and two labelled buttons say what they do. A move
  renumbers the WHOLE component group 0..n-1 and writes only the rows whose number
  changed, because `position` was written once at creation and is not guaranteed unique
  (a restored column keeps its old number, and swapping two equal numbers does nothing).
- **The mobile entry screen walks the roster through a ref map**, not
  `document.getElementById('entry-N')` — a convention in a global namespace.
  (Showing the term figure in its footer, from the original plan, was NOT done.)
- **`levelup.mp3` (888KB) is no longer fetched on the first tap.** The unlock used to
  prime every clip with a muted `play()`, which downloaded it for every student whether
  or not they ever levelled up (it is not precached). A `LAZY` clip is now unlocked with
  a 44-byte silent WAV and its real file attached on first play. ⚠ **It must be the SAME
  element**: iOS Safari only plays an element that was started inside a user gesture, so
  creating it at level-up time would silently block the sound on the very phones most
  students have; changing `src` on an already-unlocked element keeps it unlocked. The
  cost, accepted by the instructor in preference to re-encoding the clip (which would
  change how it sounds), is that the FIRST level-up on a slow connection plays a moment
  late. Measured in the dev server: after a first tap only the three small clips load
  (19 + 3 + 27KB); `levelup.mp3` (867KB) appears only when `playSound('levelup')` runs.
  Not verified on iOS.
- **ESLint is CAPPED, not tightened:** `lint:eslint` is `eslint src --max-warnings 109`,
  so `npm run verify` fails if the count GROWS. Chosen over turning ~100 sites into
  errors because the warnings are overwhelmingly the fetch-on-mount pattern every screen
  uses, "fixing" each changes when an effect runs, and most cannot be exercised without a
  login. **Lower the number as the backlog is paid down; raising it should be a decision,
  not a reflex.** Verified: passes at 109, exits 1 at 108. A new fetch-on-mount effect can
  stay clean by clearing its flag when the answer ARRIVES rather than calling a setter
  before the request (`StudentGradesCard` in Ops does this).
- **Mobile sweep of the new screens (2026-11-09).** The student Grades screen, the Home
  Grades card and the Columns edit row, with worst-case fixtures (a 59-character subject
  name, a 32-character student name, four-digit points, a 50-point cost), at
  **320 / 360 / 390 / 414 in dark and 320 / 414 in light**, plus the empty and loading
  states: zero page overflow everywhere. It found ONE real defect, and it was
  pre-existing: **the Columns row put two `sm` IconButtons at `gap-2`**, so their 44px hit
  regions overlapped by 4px and a tap near the seam hit Retire (the later element) instead
  of Edit. `gap-3` makes the centres 44px apart. It is the adjacency rule from the tap-target
  pass, caught here by measuring at 320 rather than by reading. `StudentGrades` and
  `ColumnsPanel` rows also carry `title={name}` now, since a name truncated to ~19
  characters at 320px is otherwise unreadable.
  ⚠ **False positives worth recognising** (each was checked, not assumed): a `truncate`d
  paragraph reports its FULL text width, so its centre can sit under a sibling button while
  the visible, ellipsised box ends 12px short of it (`pBox` right 173 vs button left 185);
  a large number's line box overlaps its label's box by ~10px with no glyph collision
  (`elementsFromPoint` index 0 is the number, the screenshot shows clean separation);
  a skeleton's shimmer layer is translated outside its clipped parent; and an
  `IconButton`'s `::before` hit region reads as `scrollWidth 38 > clientWidth 32`. **Confirm a
  "covered text" hit with rects and a screenshot before changing layout for it.**
  Also confirmed: `PodiumBoard`'s `layout` animation is still gated on reduced motion at
  both call sites (`layout={!reduced}`).

**Grades follow-ups (2026-11-09, after Phase 4 was committed).** Decisions (user): **push
students when grades open** · **reverse ANY boost, not just recent ones** · **"How is this
worked out?" on the term card** · **term figure on the mobile entry screen** · **pay down the
safe lint warnings** · **a real-device checklist** · the tour stays NEW STUDENTS ONLY. NOT
built, and a known gap: **past-semester grades** — `get_my_grades` reads the student's
CURRENT section, so the moment rollover promotes them, last semester's marks disappear from
their screen (and an archived student has no grades at all).
- **Opening grades notifies, once.** `set_student_grades_enabled` (0062 §1) now returns
  `jsonb { enabled, notified }` and on the OFF → ON transition queues one `grades_open`
  notification for every active student in an active-semester section that has at least one
  LIVE column (a push to a screen that says "nothing set up yet" is noise). The transition
  test is load-bearing — the flag is read BEFORE the write, so a retry or double tap while it
  is already on pushes nobody a second time. Same shape as `send_broadcast`: one bulk
  INSERT, audit row BEFORE dispatch, dispatch chunked at 50. The Ops confirm says students
  will be notified, and the toast reports the real count. `grades_open` is in
  `NotificationType` and `TYPE_META` (table icon, `info`). That "never twice" guard is NOT
  reachable from the UI (the switch only offers the opposite state) — it is checked by 0062's
  verify item 3, not by a click.
- **`Boosts applied (N)` in Requests → Points** lists EVERY approved boost with Reverse.
  Reverse used to hang only off "Recent decisions", which is the newest 30 of the newest
  100, so a boost approved a month ago could not be undone from the app. It has its own
  fetch and its own try/catch (`listRedemptions({ gradeLinked: true, limit: 500 })` plus the
  receipts), which deliberately has NO fallback to the pre-0062 column list — a filter on a
  column that does not exist cannot be answered by selecting fewer columns, and an empty
  list would read as "no boosts" instead of "not applied yet". It is collapsed by default,
  shows 8 rows, grows a name/column filter past 8, and takes `17 → 20 (+3)` from the
  RECEIPT (the request only knows the bonus the student agreed to; the receipt knows what
  was written after the cap). A boost whose receipt could not be read still lists, without
  the arrow, and Reverse works off item + student, not the receipt.
- **"How is this worked out?"** (`explainTerm` in `student-grades.ts`, 5 tests) states each
  part's share of the TERM — 30 / 15 / 15 / 40 — rather than "50% of 60%", which a student
  cannot reason with, and the scale ("no marks earns 60, full marks earns 100"). It only
  restates the weights `termGrade` already reads, derives nothing new, rounds from thousandths
  (0.6 × 0.25 reads 15, not 15.000000000000002), omits zero-weight parts, and returns null
  when the policy is unusable — **the same rule that withholds the term figure: do not
  explain a number that is not being shown.**
- **The phone entry screen shows each student's term figure under their name**
  (`GradeItemEntry` now takes `policy` and `view`). No arithmetic of its own: it calls
  `sumsFromScores` + `termGrade`, the very functions the grid's rows call. A mark typed this
  session lives in `values` (keyed like `cellKey`), everything else in `scores`, and a
  cleared mark drops out of the denominator as on the grid. Hand-checked: quiz 18/20 and exam
  44/50 reads 79.48 (quiz 96, others 60 → CS 69; exam 95.2; 69×.6 + 95.2×.4); quiz 9/20 alone
  reads 62.70; nothing marked reads "—".
- **ESLint 109 → 95, and the cap follows (`--max-warnings 95`).** Fourteen mechanical fixes:
  `ConfettiBurst` draws its pieces through a module-level `makePieces` in a lazy `useState`
  (6 — randomness in render; `count` is never changed on a live burst); `useState(() =>
  Date.now())` in `AttendanceSession` and `EventConsole` (2 — the argument was evaluated on
  EVERY render though only the first value was used); Ops' backup and auth cards record
  `loadedAt` WITH the rows instead of reading the clock while rendering (2 — "is the backup
  stale" and "the last 15 minutes" are about the moment the data was read, and a render-time
  clock slid on every unrelated re-render); two `let x = …` that both branches overwrote (2);
  one unused `eslint-disable` (1); and one narrow, reasoned disable on a `Date.now()` inside a
  click handler (1). **Deliberately LEFT:** 82 `set-state-in-effect` (the fetch-on-mount
  pattern every screen uses — "fixing" one changes when its effect runs), 8 `refs`
  (`Sheet`'s focus trap, `PullToRefresh`, the notifications swipe — core components that cannot
  be exercised without a login) and 3 memoization hints in `ChatRoom` / `StudentData`.
  Verified: passes at 95, exits 1 at 94.
- **`REAL_DEVICE_PASS.md`** at the repo root is the ordered list of everything no code session
  could verify: the migration paste order with BLOCK 2 first, the 0061 activation, closing a
  semester and the archived student, the tour across three opens, the full boost cycle (ask →
  approve → reverse → retype → clear → decline), scanning, the leaderboard, the lazy sound on
  iOS, and the authenticated phone-width sweep. Work it top to bottom; a failing step number is
  the report.
- Verified by probe (removed, residue-checked) at 320px: the explainer open (30/15/15/40, a
  65.10 that hand-checks), the entry screen (figures above, zero overflow) and the Boosts
  list (collapsed → 8 rows + filter → "Show all 11" → 11 rows). **Not verified:** the notification
  actually arriving, and every write path against a database.

**Use points is now the spending hub (2026-11-09).** From the user's screenshots of
`/app/grades` and `/app/points`: nothing on Grades told a student their points could be used,
and `/app/points` was a generic form that did not know about their columns. Decisions (user,
all the recommended ones): **the hub on /app/points** · **actionable columns first** · **keep the
free-form request and the catalog below as "Something else"** · **an always-visible banner plus
row links on Grades**. Where the user's plan was right and where it was corrected:
- **One confirm flow, not two.** The boost confirm used to live on Grades, so spending was split
  across two screens and the warning and rules existed twice. It now lives ONLY in
  `components/points/GradeColumns.tsx` (rendered by `UsePoints`); `StudentGrades` no longer
  imports `requestGradeBoost`, the confirm dialog, or even the student's redemption list (one
  fewer query per visit).
- **Routing is a query param, not a new route:** `/app/points?column=<id>`. The column is
  scrolled into view and ringed; a deep link to a column that is NOT actionable opens the
  collapsed list and highlights it there, because a highlight on something nobody can see is
  worse than none. The existing history-aware back arrow returns to Grades.
- **Not every column is a row.** Most are not boostable, and a screen of mostly dead rows teaches
  students to ignore it. `boostColumns` (in `student-grades.ts`, 6 tests) splits them: boostable
  ones are cards grouped by subject and term in the grid's own order (`17 → 20 / 20`, the REAL
  gain after the cap, the bonus note when it was capped); everything else is one collapsed
  "Not available yet (N)" list that says WHY (`boostReason`: waiting, mark not in, already full,
  not offered, or "+3 from 5 pts"). It asks `boostState`, never re-derives it, and a test pins
  that it agrees with `boostableCount`.
- **The banner on Grades is never a dead end.** It shows even when nothing is boostable and says
  "no column offers a boost yet" — a link that appeared only when there was something to do
  would leave a student with nothing to tap in exactly the situation in the user's screenshot.
  Each boostable row carries `+3 · use points ›`, a LINK (44px tap region), not a button.
- **Enabled and disabled are no longer twins:** "Use 5 points" is the filled primary button;
  "Need 45 more points", "3 requests waiting" and "Closed" are outline and disabled.
- **While grades are switched off** the hub cannot list columns, so that section says "Grades
  aren't open yet" and the catalog and free-form request below keep working.
- `student-grades.test.ts`'s "never the official figure" guard now also reads `UsePoints.tsx` and
  `GradeColumns.tsx`.
- Verified by probe (removed, residue-checked) with fixture data on the REAL screens: 1440 dark,
  375 and 320 in dark and light — zero overflow and zero overlapping tap targets on both
  screens; the three row links carry the right column ids; deep links to an actionable and to a
  non-actionable column; the hidden, "none boostable" and normal states. **Not verified:** the
  request itself from this screen (it is the same RPC call moved, but it has still never run
  against the database) and anything on a real login.

**Grades UI rework (2026-11-09, from the user's screenshot: "it is a mess").** Decisions
(user): **one compact toolbar** · **keep the grid compact and CENTRE it (REVERSED below — it now fills)** · **in So far, show
only the computed parts that have marks** · **all four extras** (flat cells, partial flag, column
footer, calmer header band). Two real defects were found first and fixed outright, no choice
needed:
- **The icon rail printed text it had no room for.** On the grade screen the sidebar is a 64px
  rail (`width="full"`), but its header still rendered the logo, "ClassPoint" and the
  "Instructor" badge in a row, so the words spilled over the screen title; the footer's
  64px theme pill and its 170px ROW of four round buttons overflowed a 48px usable width and
  were cut off at the screen edge. In the rail the header is the mark alone (the words stay as
  `sr-only` and a tooltip), the pill is 40px, and `actions` is flipped to a column with a
  variant selector on its direct child (the layout owns its own classes, so the shell cannot
  change them, but `[&>div]:flex-col` outranks a plain `flex`).
- **The instructor's MOBILE header overflowed at every phone width.** Mark + wordmark + badge +
  theme switch + four buttons came to ~440px against 343, nothing wrapped, so Ops and Sign out
  were pushed past the screen edge and `body { overflow-x: clip }` hid the evidence — measured
  `scrollWidth 439` on a 375 viewport, 375 after. When a badge is passed (only the instructor
  passes one) the wordmark and badge now wait for `min-[480px]`; the student header keeps its
  wordmark at every width. Not seen on a real phone — found by mounting the real `Shell` in a
  probe — so confirm it on one.
- **Toolbar:** Section and Subject are auto-width pickers (they were each HALF the window),
  followed by the term tabs, the So-far/Official toggle and the help link on ONE row; the
  "Entered" line gained a hairline meter for the term on screen. About 150px of height back.
  `text-base` below `md` (the iOS zoom rule), compact `h-9 text-sm` from `md`. Every control is
  full width and stacked on a phone. Changing scope still NAVIGATES — the scope has to stay in
  the path because `Shell` reads `pathname` for the width.
- **~~Centred~~ → FILLS THE WIDTH (the user reversed this after seeing it on real data:
  "make it fill, matching the header content").** Centring left a narrow island in a 1,900px
  window. The table is `w-full min-w-max`: the whole scroller, edge to edge with the toolbar
  (measured 32–1568 against the toolbar's 32–1568 at 1600px), and at least its content width so
  a 14-column term still scrolls (2,080px, 88px columns, no page overflow). The spare width goes
  to the SCORE columns only — gutter `w-8`, name `w-60`, computed `w-28`, Term grade `w-32`; in an
  auto-layout table the excess is handed to the columns without a fixed width (two columns
  measured 456px each). ⚠ **The old `max-w-22` on the header name had to go, and the guard it
  represented is kept differently:** a hard cap would stop the columns taking their share, so the
  name's box is `w-0 min-w-full truncate` — it contributes NOTHING to the column's intrinsic width,
  then stretches to whatever the column ends up with and truncates there. Verified: a 55-character
  column name leaves both columns at 456px. The scroller's `pb-2` was removed (it left an 8px strip under the pinned footer where rows
  showed through; it only existed for an OUTER focus ring, and the ring is `ring-inset` now).
- **Computed parts follow the data.** In So far a part nobody has a mark in is not a column, and
  the band says "Computed · N hidden" with the names in its tooltip; Official shows all five,
  because there an unmarked part counts as a zero. Which parts are on show is held as a STRING
  and split back, so the array's identity changes only when the SET does — a new mark in a part
  that already had marks must not hand all forty memoised rows a fresh array. A new part
  appears the moment its first mark COMMITS (the grid mirrors commits into a `live` map; the
  rows still take the ORIGINAL `scores` snapshot and a stable `handleCommit`, so a commit
  costs one grid-level render and re-renders no row). Anything that changes marks from
  outside still remounts the grid, re-seeding it.
- **Partial term grades** (`weightedComponents` / `componentShare` in `grading.ts`, 4 tests —
  the one place the product `csWeight × partWeight` is written; `explainTerm` now reads it too):
  a So-far grade missing at least one part that carries weight shows dimmed with a small
  "partial" and a tooltip ("from 2 of 4 parts"). A zero-weight part is not "missing".
- **Footer:** a pinned bottom row with each column's class average (of the MARKED scores, raw —
  not a percentage, blanks not counted as zeros) and "marked n/N" (amber while incomplete), and
  the class average of the Term grade itself from the same `termGrade` the rows call. Verified by
  hand: columns 23/19 and 41/32 average 21 and 36.5; term grades 63.84 and 63.06 average 63.45.
  Pinned at scrollTop 0, mid and end (footer bottom minus scroller bottom = 0 each time).
- **Flat cells + calmer band:** data cells take the SAME opaque surface as the frozen name beside
  them (they were `bg-transparent` over the canvas, which read as black holes next to the lighter
  frozen cells), with hairlines right and below. The component band is sentence-case muted text
  with NO bottom border, so it reads as the first line of one header block whose only rule is the
  hairline under the column names.
- **A latent bug fixed in passing:** the row crosshair tinted every cell with `bg-accent-solid/5`,
  which REPLACED the frozen name and Term-grade cells' opaque background with a translucent one,
  so while a cell was focused and the grid scrolled sideways the marks underneath showed straight
  through the name column. Both halves of the crosshair are an inset box-shadow now, which
  paints over a background instead of swapping it.
- Verified by probe (removed, residue-checked) with the REAL toolbar markup, grid and `Shell`:
  1600px dark and light, 2 columns and 7 columns × 26 students, So far and Official, scrolling
  with the header and footer both pinned, 1024px, and the mobile header at 375 / 320 / 600.
  **Not verified:** the full `GradeSheet` (its data calls need a login — the toolbar was mounted
  from the same markup, not the component), and any of it on real data.

**SQL syntax is now checkable without a database.** `libpg-query` (npm, installed into a
scratch directory, NOT the project) parses a migration's top-level statements AND each
`$$` function body as PL/pgSQL. 0060, 0061 and 0062 all parse clean, and the checker was
verified to fail on a deliberately broken body and a broken top-level statement — so
"clean" means something. **It checks syntax only**: a wrong column name or a type
mismatch still fails at runtime, which is why the verify block, not the parse, is the
test. It would have caught the `$$` → `$` slip that shipped in 0041.
**THE PASTE ORDER OF 0060 AND 0062 USED TO MATTER, AND NO LONGER DOES.** Both re-list
`audit_log_action_check`, and 0060 originally listed only sixteen values. Pasted AFTER 0062
it would have silently dropped `grade_boost` and `grade_visibility`, and every boost
approval, reversal and "open grades" switch would then have died on a check violation — the
third time that constraint has been at risk. It was found because the user pasted 0062 FIRST
(their BLOCK 6 screenshot showed 0062's body probes already `true` while 0060 was
unconfirmed). 0060 §6 now lists all eighteen too, with the reason. **`applied_state.sql`
BLOCK 7 is the guard: run it after pasting either file; ZERO ROWS means the live constraint
equals the eighteen the app writes.** It names which direction a mismatch goes ("MISSING from
live" → paste 0062; "LIVE but not listed" → add it to both files first).
**Run across ALL 62 migrations and both `supabase/queries/` files (2026-11-09): every one
parses clean except 0025**, and that one is a known false positive — `select … into
v_session.topic, v_session.started_at` assigns to fields of a `%rowtype` variable, which is
valid PL/pgSQL but which a catalog-less parser cannot resolve ("`v_session.topic` is not a
known variable"). 0025 has been applied and in daily use since long before this check
existed. **So a pending paste (0042–0062) is not going to die on a syntax error;** what can
still fail is a name or type that only the database knows, which is what each file's verify
block and `applied_state.sql` are for. To re-run it, install `libpg-query` in a scratch
directory (never the project) and feed it each file's top-level statements plus each
`create function … as $$ … $$;` body.

**Verified: 0 errors, 109 warnings (unchanged), 530 tests** (from 0/109/490). Probe
route (removed, residue-checked) at 375×812 with fixture data: the Grades screen with
every boost state side by side (boostable, capped, boosted, waiting, unmarked, no
terms offered) plus its hidden and error states — the empty and loading states were
not rendered — zero page overflow, the capped-gain confirm reads "17 becomes 20 out of 20 … you'd gain 3", the
Home card renders both subjects and nothing escapes. ⚠ A Dashboard screenshot comes
back BLACK while the pane is not compositing — framer's stagger leaves every item at
opacity 0; inject `*{opacity:1!important;transform:none!important}` to see it, and
read the DOM for numbers. **Not verified on a real login:** the instructor side (Ops
switch, Columns terms, the corner dot, the inbox, Reverse) and the whole write path —
`request_grade_boost`, `decide_point_redemption`'s grade branch and
`reverse_grade_boost` are typechecked and diffed, never run. 0062's verify block is the
test: **do a full request → approve → reverse on a scratch student before opening
grades to the class.**

Since 0065 (Scores and points stay available when the grade switch is OFF — Era 8.0 Phase 9).
Decision (instructor, 2026-11-11): **the switch hides the GRADE, not the screen.** **0065 is WRITTEN
AND NOT YET APPLIED** — paste it AFTER 0064, twice; paste it BEFORE deploying the client (the client
treats a missing `figures` as "figures shown when enabled", so deploying first is safe but keeps
the old all-or-nothing behaviour).

**"Student grades" now means "show students their GRADE".** Off used to mean "Grades aren't open
yet" and nothing else — not even their own quiz scores — and `request_grade_boost` refused. Now,
OFF: a student sees every column and their score on it ("23 / 40") and can use points on any of
them exactly as when it is on; they do NOT see the term "so far" figure, the part scores, "How is
this worked out?", or the Home Grades card. ON: as before. A student's own marks were never secret
from them, so the switch no longer gates the screen.

**HIDING IS REAL, NOT CSS.** While figures are hidden `get_my_grades` WITHHOLDS the weights
(`policies: []`) and the attendance counts (`attendance: {}`) — the two inputs besides the marks
that `grading.ts` needs — so a grade cannot be reconstructed from the payload, and `summarizeTerm`
returns null on its own. The new `figures` key is what the screen reads; the screen decides what to
SHOW from `figures`, not from an accident of what is missing. Only an ARCHIVED account is
`enabled: false` now. Recitation's attendance row disappears with the figures (its counts are
withheld) — an attendance rate IS the Recitation grade. `request_grade_boost` lost its
"Grades are not open yet" gate. Ownership moves 0064 → 0065, same signatures, bodies diffed.
Turning the switch ON still pushes "Your grades are open", which is now exactly true.

**"use points", not "up to +N · use points" (instructor).** The row link and the card header chip
no longer promise an amount: the maximum depends on the student's balance and the column, so a
number on a row read as a price. The amount is on the card's picker, where it is the student's choice.

**Grades screen polish (instructor's picks, 2026-11-11):** every score row has a thin progress bar
and a score coloured by `rateTone` (the same 70 / 85 bands attendance uses — one threshold
app-wide); the row action is a QUIET text link with a ticket icon ("Use points"), shown ONLY on a
column that can still gain (a perfect score has none, and neither does an absent, waiting or
unmarked one); a "In order / Lowest first" control sorts within each part (`sortItems` — weakest
SHARE of the maximum, not lowest raw mark; unmarked last; stable; pinned by tests); and while grades
are hidden the top card is a lock and one line ("Grades open soon — your scores are below"), not a
"0 of N marked" that reads as a failure. **Declined:** a balance chip in the header and two columns
on wide screens. Verified by probe (removed, residue-checked) at 320px: 23/40 reads 57% in danger,
38/40 and 20/20 in success, the link has no border and carries the column id, no link on the
perfect score, zero overflow.

Since 0064 (Points assist is AUTOMATIC — Era 8.0 Phase 8). Decisions (instructor, 2026-11-11):
**no terms to set** · **1 point = 1 mark** · **the student chooses how many points** ·
**never past the column's maximum** · **still approved by hand** · **only a per-column Off
survives**. **0064 is WRITTEN AND NOT YET APPLIED** — paste it AFTER 0063, twice, then run
`applied_state.sql` BLOCK 6 (three new rows). **Migration before client, always:** the client now
calls `request_grade_boost(item, points)` and reads `offered` from `get_my_grades`, so deploying it
before the paste makes every request fail and every column read "not offered".

**0064 REVERSES 0063's "the instructor sets the terms".** The per-part defaults, the per-column own
terms, `effectiveTerms`/`assistModeOf`, the Points-assist tab and its panel are all GONE. A column
is open the moment a student's mark is in; the only instructor control is `grade_items.assist_off`
("Students can use points on this column" switch in the Columns edit row). `grade_assist_defaults`
and `grade_items.points_cost/_bonus` are RETIRED, not dropped (their data is the record of what
was once set, the nightly backup still mirrors them, and dropping a column the mirror depends on
is exactly the drift the 0057 parking logic exists for) — nothing reads or writes them, and both
carry a `comment on` saying so. **Do not re-add terms** without asking: the instructor removed them
on purpose because setting a cost and a bonus per part was work with no payoff.

**THE RULE, in one place.** `src/lib/grade-boost.ts`: `maxPointsFor(score, max)` is the marks
still missing, rounded UP to a whole point (17.5/20 may use 3) and capped at 50 (a single
request's ceiling); `pointsGain(points, score, max)` is `min(points, max - score)` — so a mark
**can never pass the maximum** (3 points on 17.5/20 gains 2.5, and the screen says 2.5 before
they confirm). `request_grade_boost` re-checks all of it and stores the capped amount as the bonus
the student agreed to (`point_redemptions.grade_bonus`); **`decide_point_redemption` needed no
change** — it already applied that bonus, re-capped at the moment of approval. Change one side,
change the other, same commit. The signature changed, so 0064 drops `request_grade_boost(uuid)`
first (a `create or replace` with a new parameter list makes an OVERLOAD and PostgREST rejects
every call as ambiguous — the 0028 lesson). Still: once per column, absent refused (0063's rule),
mark must be in, approved by hand, reversible.

**The student's card** (`GradeColumns`) has a points picker: − / editable number / + (44px
targets, `text-base`), defaulting to the most they can use (`min(maxPoints, free points)`), clamped
if the balance or mark moves under it; the confirm states the REAL gain and the resulting mark,
and the button reads "Use N points". The Grades row link says "up to +N · use points".

**Verified by probe (removed, residue-checked)** with the real card at 320px: no overflow, 16px
input, 44px steppers; 17/20 defaults to 3 with + disabled and "That's full marks"; 17.5/20 with 2
free points defaults to 2 and shows 17.5→19.5; a typed 9 clamps to 3 and a typed 0 to 1; letters are
stripped; the button submits a typed-but-unblurred value; zero free points disables everything and
hides the "up to N" hint. **Not verified against a database** — 0064 is unpasted.

Since 0063 (Points assist, the Absent mark, Recitation from attendance — Era 8.0 Phase 7).
Decisions (instructor, 2026-11-09/11): **automatic by part, with defaults** · **fixed marks per
part** · **an Absent mark, tied to attendance** · **Recitation IS the attendance rate** ·
**"boost" becomes "points assist" everywhere a person reads it, server wording included**.
⚠ **The per-part terms, per-column own terms and the Points-assist tab described in this section were REMOVED by 0064 (above); the Absent mark, attendance Recitation and wording changes stand.**

**0063 is PASTED (the user, 2026-11-11 — "Success. No rows returned"); NOT YET CONFIRMED by
`applied_state.sql`.** Run BLOCK 1b (0063 should read ALL PRESENT) and BLOCK 6 (its two new rows
must read `true`), and paste the file a second time to prove idempotency, before trusting it. Had it
not been applied the client would have degraded rather than broken: the A marks, the Points-assist
tab and the class picker each fail in their own catch, and Recitation would read the 60 floor (no
attendance counts to read).

**"BOOST" IS NOW A WORD ONLY CODE USES.** Identifiers (`request_grade_boost`, `grade_boosts`,
`'grade_boost'` audit action, `grade-boost.ts`, `BoostState`) keep their names — renaming a function
or a CHECK value breaks every client already holding the old one for no reader's gain. Every STRING
a person reads says "points assist": the app, and 0063 re-issues `request_grade_boost`,
`decide_point_redemption` and `reverse_grade_boost` with the new push titles, ledger lines
("Used · Points assist · …", "Refund · Points assist reversed · …"), request note and errors. Old
ledger rows keep the old wording — they are history.

**A COLUMN IS OPEN WITHOUT THE INSTRUCTOR FLAGGING IT.** Terms live per SUBJECT and per PART in
`grade_assist_defaults` (Performance Tasks / Quizzes / Exam — Recitation has none: it is computed,
so there is no mark to add to). `cp_assist_terms(item)` is the ONE answer to "what are this column's
terms": off beats the column's own `points_cost/_bonus` beats the part's default. `assist_off` is the
new per-column switch. `src/lib/grade-boost.ts` `assistModeOf` / `effectiveTerms` mirror it for the
instructor's preview (pinned by tests; **change one side, change the other, same commit**).
Set up → **Points assist** edits the per-part terms (subject-wide, and the sheet says so); the
Columns edit row has Follow the part / Own terms / Off. Saving defaults has NO confirm on purpose —
it moves no grade, and requests already waiting carry the terms the student agreed to.

**THE ABSENT MARK.** A cell is a MARK, ABSENT (shown A) or BLANK. Two sources, one definition
(`cp_grade_absent(item, student)`): the instructor typed A (`grade_absences`), or the column is
tied to a class (`grade_items.session_id`) and the student is recorded **absent OR excused** there
(the instructor's call — an excused absence is still a class missed). **Arithmetically an A is a
BLANK**: out of "so far", a zero in Official — so `grading.ts` and `get_section_grade_sums` needed
NO change for it; only display and the assist rule differ. It blocks a points assist **even when a
mark was typed** (a 0 for an absentee must not be the easiest column to gain on) and the server
checks it twice: at the request and again at approval, because the class link can be added between.
A cell is one thing or the other: two triggers delete the other half, so no code path (grid,
importer, an approved assist) can leave a cell saying both. `src/lib/grade-cell.ts` is the one
definition of what a committed cell MEANS and is shared by the desktop grid and the phone entry:
typing A on a cell that already reads A writes NOTHING (tabbing over a derived A must not create a
manual row), a derived A cannot be cleared by erasing it, and a typed mark over a derived A keeps
the A (it is about the class). `parseScoreInput` accepts `A`/`ab`/`abs`/`absent` in any case;
`abc` is still a typo. The phone has an A button beside each field because the decimal pad has no
letters. Exports write the letter A (text — `AVERAGE()` ignores it exactly as it ignores a blank).

**RECITATION IS ATTENDANCE, AS-IS.** 97% attendance is a Recitation grade of 97 — **no 60 floor, no
transmutation**, so 0% is 0 (harsher than the other parts, by choice; pinned in `grading.test.ts`
because it is the number most likely to be "fixed"). It rides in the SAME `recitation` slot of
`TermSums` holding COUNTS (`sumScore = showed`, `sumMax = sumMaxMarked = counted`), so every
reader — grid, Overall, both exports, both prints, the weights preview — needed no change of its own.
`cp_term_attendance(section, subject, term)` returns counts only (late counts as present; excused and
irregular leave the denominator — the rule `lib/attendance.ts` states and `get_term_attendance` 0034
implements), **subject-scoped** (attendance is per subject; untagged sessions are not counted) and
compared in **Manila time**. `recitationScore` in grading.ts computes the rate — the ONE place, so
"no weighting arithmetic in a migration" still holds. With no class counted yet it reads the floor
and does not make a term "started" (`hasAnyItems` and `completionByTerm` ignore Recitation: classes
being held is not work being graded). Typed Recitation columns are RETIRED — hidden from every
screen (`listGradeItems` filters them, `sumsFromScores` skips them, `get_my_grades` omits them) but
the rows and marks stay in `grade_items` and the 365-day backup. Imported past terms that carried a
Recitation total therefore recompute from attendance: **check an imported term before trusting its
Recitation**.

**The grid.** Recitation is a computed column labelled "attendance". `CellEdit` gained `absent`;
`onCommit(edit, previous: CellState)`; `GradeSheet` keeps `absencesRef` beside `scoresRef`, loads
attendance and absences in their own catches, and flushes three kinds of write (mark / A / clear).
A column's class link is picked in the Columns edit row from THIS term's classes for the subject
(plus the linked one even if outside the list, so editing never silently drops it). Student side:
`MyGradeItem.absent`, `MyGradeSubject.attendance`; the Grades screen shows "Absent" and an
Attendance row under Recitation; `boostState` gained `absent` and answers it BEFORE "unmarked"
(absent first, as the server does — "you were absent" is the truer reason and tells them not to
wait for a mark that is not coming).

**Verified by probe (removed, residue-checked)** with the REAL `GradeGrid` and `GradeItemEntry` and
fixture data: every figure matches a hand calculation (Ana: quizzes 33/40 → 93, attendance 9/10 → 90,
class standing 75.75, term 69.45 "partial"; Ben with only attendance reads a dash, not a number);
typing `a` commits one write with `absent: true`; tabbing over or erasing a derived A commits
NOTHING; a number over a typed A commits value + `absent: false`; a mark over a derived A keeps the
"A" tag and its explanation; `abc` is refused with "…or A for absent". Phone entry at 320px: zero
overflow, inputs 16px, A buttons 44×44, the derived A's button disabled — but the name column is only
~94px wide beside the field, the A button and "/20", so a long name truncates early (its `title`
carries it); widen it if that reads badly on a real phone.

**NOT verified against a database:** the BEHAVIOUR of 0063 (it pasted clean; its bodies were
extracted, diffed and parsed, but the rules have never been exercised), the absent rules end to end, the attendance counts, the triggers. **Not built:** an
Absent mark on imported marks (the importer writes marks only); per-student overrides of a derived A.

Student Home, round 2 (2026-11-14, no migration). Decisions (user): **back to the reading
column, +4px** (`-mx-0.5` on the Home wrapper; the wide two-column Home and `isStudentHome` are
gone) · **slim greeting row** (`HomeGreeting`: a day-part sun/moon glyph, a message from
`lib/home-message.ts` that reads rank, then streak, then the hour, and a section pill; NO LIVE badge)
· **Orbit planet hero** (`HomeHero`: level is the planet, the XP ring is the orbit, the AVATAR is the moon
riding the end of the arc through a rotating wrapper with a counter-rotating avatar, so it is one
transform; no "all-time" line) · **Attendance = ring + last-8-classes dots** · **Use points = ticket
stub** (no balance quoted, same rule as before). `HomeScene` was deleted.

**Order is the user's, drawn in Paint (2026-11-14):** greeting, the three live banners, scoreboard,
Attendance, "Your grades are up" strip, Use points, Achievements, Recent points.
**`NextMilestone` is DELETED.** "X points to pass the student above you" now lives on the RANK card:
hover with a mouse, tap on a phone (tap again, tap elsewhere or Escape to put it away). The rank card is a
real `button` (`aria-expanded`, a chevron as the affordance) only when there is something to say; rank 1
says "You are on top", and an unranked student gets a plain card. The level gap is already in the hero.
**`HomeHero` has NO `overflow-hidden`**, deliberately: the popover hangs below the card and would be
clipped by it, so the glow, stars and sheen sit in their own clipped layer, and the Home wrapper for the
hero is `relative z-20` so the popover paints over the next card. Layout: from `sm` it is planet |
numbers | a 144px column of rank + streak (top-aligned); below `sm` the two cards drop under the planet
as an even pair, because a third column starves the points figure. The points figure is `w-fit` so its
mount-time scale spring cannot make a block-wide box overflow the page.
Measured by probe at 320, 375 and 1280 (removed, residue-checked): zero page overflow at all three,
popover inside the viewport and topmost, outside tap closes it, hover opens it. A 5-digit points figure at
320 overshoots its column by 8px (still inside the card); realistic scores are 2 to 3 digits.
**Not verified on a real authenticated Home.**

Impeccable audit batch (2026-11-14, no migration). **The aurora is GONE**: public and auth screens sit on the flat canvas plus the global grain (the ClaimDoor/AuthShell notes above that mention it are history). Light `--muted` is `#616774` (5.12:1 on canvas; `#6b7280` was 4.37). Reduced motion is no longer a global 0.01ms kill: loops stop and transforms do not travel, but a 120ms opacity/colour fade remains so state changes register. Seven flat-surface `backdrop-blur`s removed (scrims, QR pill, desktop sidebar); blur stays only where content scrolls behind a sticky bar. Seven raw inputs gained `aria-label`. Display face is **Bricolage Grotesque** (was Space Grotesk; Inter stays for body; ShareCard literals updated), so **check numerals and the ShareCard on a real device**. Landing is hero + ClaimDoor stub + a 3-step list + the fairness line + board preview; the feature-card grid is gone and Install shows only when `usePwaInstall` is installable/ios/inapp. ClaimDoor's label is `text-ink` (gold `text-warn` measured 4.06:1 on its tint). PRODUCT.md and `.impeccable/` exist now; commit them.

Leaderboard scoreboard-plate redesign (2026-11-14, no migration). Decisions (user): **keep top 10 as 1-2-3 + 4-10** · **scoreboard plate** · **tall rows with big numerals, no medals or crown** · **rows carry a points bar, avatar+level, movement/tenure, section dot** · **comments overlay unchanged** · **spend board = slate chrome + gold numerals** · **Share image matches**. `PodiumBoard` is ONE fixed dark plate (`from-plate-2 to-plate`, never themed, never `cp-lit`). Ranks 1-3 are taller rows told apart from 4-10 by size and ink weight only; each row's bottom hairline doubles as a bar (share of the leader's total, `scaleX`, so transform-only). The XP ring survives on the top three only. The podium stands, crown, TIER metal ramps and the `glow` prop are GONE; `metric="spent"` swaps the bar and ring to slate, adds a dashed ticket header, keeps gold numerals. **`RankDelta` / `RankTenure` take `onPlate`**, using the new fixed `--color-plate-up/down/hot` tokens: the themed success/danger/streak roles are dark-on-dark on a plate in light mode. ShareCard keeps its `podium` and `list` variants but both are plate rows now (gradient title text and the red/gold background washes removed). Measured by probe (removed): 320px, worst-case names and 4-digit points, zero overflow and 60-98px rows; plate signal contrast 9.7-12:1, white/55 6.1:1; share card fits 1920px with climber banner + you-chip (141px spare podium, 27px spare list). **`SilentBoard` is now the same plate with three outlined ghost rows** (CSS opacity pulse, `cp-silent-1..3`; its guards in `material.test.ts` were rewritten from the old SVG-stroke checks to plate + dashed-outline checks; measured 288x374 at 320px, no overflow); and none of this has been seen on a real authenticated screen or by eye (screenshots timed out in the hidden pane).

**The podium reveal plays on the first THREE opens only** (`lib/reveal-budget.ts`, +6 tests; key `cp_podium_reveal_v1_<studentId>`, `guest` where nobody is a student; corrupted or blocked storage means do not play). After that the finished podium is simply there; foil, tilt and parallax still work, the sun's corona still turns, and the replay button still plays the reveal on demand. `SpacePodium` takes `intro` (entrance) separately from `reduced` (OS setting), and `takeOnce` de-dupes React's double initialiser call in dev. **Ranks 4-10 are now a quiet crew manifest (2026-11-14, after a phone screenshot): no share bars, no gap figures, dotted dividers, your row a faint tint, no gold ring. Top-3 names use `FitName` in SpacePodium: a fixed two-line box, wrapped and balanced, font stepping down from 12-13px to a 10px floor until the name fits, re-fitting on resize and when the web font arrives (real 3-word names fit unclipped at 358px; a 50-character name still ends in an ellipsis). The sky panel and cards gave back a little side padding to widen each card to ~98px.** **The podium came BACK as a space podium (2026-11-14, supersedes the "tall rows" top three above; ranks 4-10, the plate, the share card and the silent board from that note stand).** Decisions (user): **collectible foil cards** · **space theme: #1 a star, #2 a ringed planet, #3 a moon** · **countdown reveal 3-2-1-champion** · **effects: foil that follows touch, docking ring on landing, odometer points, parallax starfield** · **no flavor text, no corner tag, numeral only** · **podium on the page, plate rows below**. `SpacePodium.tsx` is a fixed dark night-sky panel (NOT themed; it is a dark window even in light mode, because a starfield cannot read on a light canvas) holding three cards on launch-pad risers; `CelestialFrame.tsx` draws each body as geometry around the face (sun = rotating corona, planet = ring split into a back half behind the face and a front half over it, moon = craters + satellite dot), `Odometer.tsx` rolls digit drums, `lib/starfield.ts` (+4 tests) is a SEEDED sky so it never twitches. Each place has its own palette AND finish (prismatic, pearlescent, matte). Foil + tilt are CSS variables (`--fx/--fy/--rx/--ry`) set from pointer events with `touch-action: pan-y`, so a vertical swipe still scrolls and a drag under 6px is a tap (opens the profile); parallax is `--px/--py` through rAF. Reveal order is `AT` in SpacePodium (3rd at 0.7s, 2nd at 1.45s, champion at 2.45s); it replays on a changed top-three signature or the small replay button. **The ONLY loop is the sun's corona (`cp-corona`, 90s)**; reduced motion drops tilt, foil movement, rings, replay and the corona and shows the finished podium. Cards keep `grid-cols-3` equal widths (content-independent, measured 83px each at 320px with a 50-char name and a 4-digit score), champion raised by height only. The XP ring, level and section dot are gone from the top three (name and points only); rank movement/tenure chips remain on the cards under `rankSignals`, in a reserved row so card heights do not depend on data. **`confetti` prop REMOVED** from `PodiumBoard` and its three callers. Detector: 0 findings on `components/leaderboard` (the violet ramp is gone). **Not seen by eye or on a real login; the reveal choreography was only verified by logic and final-state measurement because animations do not advance in the hidden pane.** **ShareCard (podium variant) and SilentBoard now draw the same space podium** from `podiumPalette.ts` (the one place the palettes, riser heights and sky colour live; `CelestialFrame` lays itself out with inline styles so the capture context needs no stylesheet). ShareCard `podium` = static sky + three cards + risers + plate rows 4-10; `list` stays plate rows. Measured at story size with the worst case (long climber name + you outside the top 10): 74px spare podium, 35px spare list. SilentBoard = the same sky with dashed outlines of the three bodies on dashed risers, CSS opacity pulse; 288x358 at 320px. Its `material.test.ts` guards were rewritten again (sky + risers from the shared palette, dashed outline stays visible).

Student Grades redesign + grade card (2026-11-14, no migration). Decisions (user): **report card on the plate** · **neutral bars, colour only at the extremes** · **weighted breakdown bar** · **compact ledger rows** · **JPG card = term snapshot with figures** · **guardrails: "so far, not final" stamp, confirm before saving, name OFF, subject OFF** · **follows the existing Student grades switch (no new flag)** · **dark report-card plate look**. `components/grades/ReportPlate.tsx` is the fixed dark plate (the same object as Home and the leaderboard) with the eye, the term figure (dots until revealed; digits roll once via `DigitDrum`) and the BREAKDOWN BAR: one bar split by each part's weight, segment fill = `breakdownSegments()` in `lib/student-grades.ts`. **The fill is the share of the part's ATTAINABLE range, `(score - 60) / 40`, not score / 100**, because a transmuted part never scores under 60 and score / 100 would draw every part at least 60% full; recitation is the attendance rate as-is. The WEIGHTS are not secret, so the bar's outline and labels show while the figure is hidden. **`markTone` keeps a mark neutral except full marks (success) and under 50% (warn); red is never used for a mark** (the 70/85 bands are the instructor's ATTENDANCE at-risk line and were painting a 65/100 red). "Use points" is an ink label with a gold ticket (gold `text-reward` fails 4.5:1 in light mode for 14px text). Columns still waiting for a mark fold into one "Waiting for marks (N)" row; the order control gained "Can use points" (filters to `boostState === 'available'`, hides the recitation row). Recitation copy typo fixed. **Save as JPG:** `GradeShareCard` (1080x1920 token-free island, stamped SO FAR · NOT FINAL) + `GradeShareSheet`; the sheet starts private on EVERY open (name and subject off), and the confirm is INLINE in the sheet, not a `ConfirmDialog`, because a sheet opened from a sheet stacks two focus traps. A card is offered only when `figures && reveal && soFar !== null`. **`lib/share-image.ts` is now the one export path** (`renderJpeg`, `shareOrDownload`) for this card AND the leaderboard `ShareSheet`, which was refactored onto it. The new files are in `student-grades.test.ts`'s "never the official grade" list, plus a "grade card is private by default" block (stamp, name/subject off and reset, confirm before render, canShare condition, no themed tokens on the plate), each verified to fail on an injected violation. Measured by probe with the real screen and fixture data (probe + a temporary export of `StudentDataContext` removed and reverted): 320px no overflow, hand-checked fills (PT 65/100 -> 86 -> 0.65; quizzes 116/160 -> 89 -> 0.725; attendance 1/2 -> 50 -> 0.5; term 70.65), filter shows only Live production / Quiz 2 / Quiz 4, card fits 1920 with room to spare, desktop ledger and plate both 640px, muted on card 5.67:1 in light. **ESLint is now 94/94 (the cap is full).** **Not seen by eye, not exported through the real capture, not on a real login.**

Student Attendance makeover (2026-11-14, no migration). Decisions (user): **plate with a class trail** · **context-aware scan, thumb zone** · **a "Needs action" strip with a real closing date** · **ledger grouped by week** · **rate is a plain white number with a "Below 70%" chip only when `rateTone` says danger** · **last 10 classes, excused/irregular as a RING** · **docking ring on a successful scan**. `AttendancePlate` (the same fixed dark plate as Home / Grades / the board) leads with the rate and a streak (`achievementProgress.present_streak`, never recomputed), then a trail of dots (`trailOf`, oldest to newest, ties broken by record id so the order never shuffles; `trailKind` keeps excused/irregular NEUTRAL so they draw as a ring) that each jump to and flash that class in the log, then the counts and `Stats ›`. 20px dots at `gap-1` have 24px centres (WCAG 2.5.8 spacing) and are NOT given the 44px expansion: it would overlap neighbours. **`LiveScanBar` exists only while a class is live and unscanned**: fixed above the tab bar on a phone (`bottom-19`), inline on desktop; it renders UI only so mounting it once per breakpoint is safe. Once you are in, the plain `LiveClassBanner` shows "you're in"; with nothing live the plate carries a quiet Scan button, and the page gets `pb-20` only while the bar is up. `AbsenceExcuses`: the permanent "How excuses work" card is now a link beside **Needs action**, and the label is `excuseClosesLabel` ("closes Nov 19" / "closes tomorrow" / "closes today" / "closed"), **a real date, never "N days left"**, matching the nudge notification. The log is `WeekLog` (`groupByWeek` + a term heading when the term changes): a status dot, topic or subject, "Thu, Nov 12", status text, and the time ONLY for present/late (an absent row no longer says "in at"). `StreakFlame` full variant is no longer on this screen. ESLint is 94/94. Measured by probe (removed; a temporary export of `StudentDataContext` and `WeekLog` reverted): 320px no overflow, plates 288px, ten 20px dots fit, rows 61px, live bar 76px above the bottom edge, 1440px bar inline and dots hit-testable. **Not seen by eye, the scan flow and ring not exercised, nothing on a real login.**

## DB map (migrations 0001–0016 are the source of truth)

Tables: `sections`, `students` (cached `lifetime_points` = trigger-maintained
`greatest(0, SUM(point_events.points))`; structured name columns `last_name` /
`first_name` / `middle_name` / `suffix` added by 0059 — NULL for all 208 existing
students until 0059 is applied; `full_name` = official sort key `"Dela Cruz, Juan M."`,
`display_name` = social `"Juan Dela Cruz"`), `student_secrets`, `point_events` (the
ledger — awards, penalties, and future spending all flow through it), `instructors`
(allowlist, checked via `is_instructor()`), `leaderboard_snapshot` + `leaderboard_meta`
(frozen rank, pg_cron refresh 12:30 + 19:30 Manila), `push_subscriptions`,
`class_sessions` + `class_session_secrets` + `attendance_records`, `profile_views`,
`achievements` + `student_achievements`.

**Leveling curve: DO NOT change without asking.** `cp_level` (owner: 0002, `50 / ×1.5`)
and its mirror in `src/lib/leveling.ts` stay as they are. A data-backed rebalance to
`10 / ×1.35` was proposed and **declined by the instructor on 2026-08-14**. The numbers
behind the proposal, so nobody re-derives them: measured at the first semester's halfway
point across 208 active students, median 22 pts / p90 40 / top 65, against thresholds of
50 for Level 2 and 125 for Level 3 — i.e. 90%+ had not levelled up. The instructor
reviewed the exact point bands and chose to keep the curve. If it is ever revisited,
`BASE_REQUIREMENT`/`GROWTH` and the pinned ladder in `leveling.test.ts` must change in
the SAME commit as the migration, or students see one level on the dashboard and another
in achievement progress.

Since 0032 (Rewards catalog): `reward_catalog_items` (`label`, `points` 1–50, `kind`
mirroring `point_redemptions.kind`, `sort_order`, `archived_at`) — the instructor's price
list, fixing an economy that had no prices. **Deliberately NOT semester-scoped**: a price
list is standing policy, so reprice/retire via `archived_at` rather than recreating it
each rollover. **The redemption RPCs are untouched** — a catalog tap only pre-fills
`request_point_redemption`, so 0019/0029's `for update` locking and overspend checks are
unchanged, and an approved catalog request is indistinguishable downstream from a
free-form one. Ships EMPTY by design (no seed rows). Retire, never delete: students'
past redemptions must keep their meaning. `points` is capped at 50 by CHECK because the
RPC itself refuses more, so a pricier item could be displayed but never requested.
Student shop = card grid atop `UsePoints` (unaffordable items shown greyed with the gap
— the reason to keep earning); instructor UI = a third tab on `/teach/redemptions`
(Points | Excuses | Rewards). **Ownership move: `cp_nightly_backup` 0027 → 0032** (moved again to 0051).

Since 0031 (Attendance aggregates — the 1000-row truncation fix): PostgREST caps any
response at 1000 rows and truncates SILENTLY; a two-subject section crosses that in
`attendance_records` around week 12. Tallies the client only aggregates moved into SQL:
**`get_section_session_tallies(section_id)`** (per-session status counts, feeds
`listSessions`) and **`get_section_attendance_stats(section_id, subject_id?)`**
(per-active-student counts + `penalty_points` via the `penalty_event_id → point_events`
join — which also replaced the client's full penalty-event scan; doubles as the Phase G
risk-overview backend). Both plpgsql stable definer, instructor-raise inside, granted to
authenticated, drop-first. True row-matrix needs page instead: `fetchAllPages` in api.ts
(fresh builder per page + `.range()`, unique-column order tiebreaker) backs
`getSectionRegister` and `listMyAttendance` (the printable report's feed). Ride-alongs:
`student_secrets` reads are scoped `.in('student_id', …)` (chunked in `getSectionStats`,
which now takes the on-screen `sectionIds`) — the old unfiltered scans shipped every
semester's claim tokens on every roster/grid open. `supabase/queries/leveling_audit.sql`
(NOT a migration) is the Phase E rebalance input — run block-by-block.

Since 0030 (Per-subject metrics): **Ownership move `cp_achievement_metrics` 0021 → 0030**
(drop-first, plus drop-first `get_achievement_progress` and recreated
`sync_achievements`, all re-granted — the return type didn't change, but the discipline
is what keeps the file re-runnable). Two different rules, both the user's call:
**counts** (`present_count`, `attended_count`) are `max()` grouped by `subject_id` —
BEST SUBJECT, which makes those two badges harder and visibly drops progress bars, so
the changelog says so; **streaks** (`streak`, `early_streak`) are
`greatest(combined_run, best_per_subject_run)` — best-of, so a run spanning two classes
is never punished and nobody's progress can regress. Per-subject can EXCEED combined (an
absence in IT 32 breaks the combined run but not an Elective 1 run), which is why it's a
real `greatest()` and not just "combined". Untagged sessions form their own group rather
than being dropped. Metrics still read `lifetime_points` (achievements are lifetime —
see 0029). Client: `MyAttendanceEntry` gains `subjectId`/`subjectCode`;
`getAttendanceAnalytics(sectionId, subjectId?)` scopes the instructor's Class history via
a subject toggle; per-subject rate cards on the student Attendance screen and
StudentRecord; StudentReport gained a print-time subject picker (and a Subject column
only when the register mixes subjects).

Since 0029 (Per-semester points): `point_events.semester_id` (stamped by the
`trg_stamp_semester` BEFORE INSERT trigger — a trigger, not a column default, because
`awardPoints` inserts directly and a default is skipped on an explicit null) +
`students.semester_points` + `leaderboard_snapshot.semester_points`. **`semester_points`
is the app's "points"**: XP, level, rank, and the spendable balance. `lifetime_points`
keeps its old meaning (career total) and is what ACHIEVEMENTS still read — badges are
lifetime by the user's decision, so a student can show "Level 1" this semester while
holding the "Reach Level 3" badge. In app types the DB's `lifetime_points` is renamed
`all_time_points` (StudentSelf) so nothing confuses the two; `LeaderboardEntry.points`
and `LeaderboardRow.points` are semester points. **Ownership moves:**
`cp_recompute_points` 0007 → 0029 (maintains BOTH caches),
`refresh_leaderboard_snapshot` 0023 → 0029 (ranks by semester_points),
`request_point_redemption` + `decide_point_redemption` 0019 → 0029 (spend against
semester_points; lock order untouched). Student level/rank celebration baselines in
StudentData are keyed `cp_seen_level_${studentId}_${semesterId}` — an un-scoped
baseline would suppress every level-up after a reset until the old peak was passed.
**Two things the rollover migration MUST do** (documented at the foot of 0029):
`set_active_semester` has to bulk-recompute `semester_points` (the trigger is
active-semester-relative and can't see a semester CHANGE), and its pre-flight must
refuse while any redemption is pending (a request made in one semester, approved in the
next, would debit the wrong pool).

Since 0028 (Subject-scoped attendance): `class_sessions.subject_id` (nullable —
pre-subject sessions are "untagged" and the instructor re-tags them from Class history;
a one-time banner counts them). **Ownership move: `start_class_session` 0014 → 0028 —
the SIGNATURE changed** (new `p_subject_id` second), so it drops the exact old signature
first; a `create or replace` with a different parameter list creates an OVERLOAD and
PostgREST then rejects every call as ambiguous. It validates the section is in the
ACTIVE semester and that the subject is assigned to it, but requires a subject only when
the section has any assigned — a setup gap must never block a live class. The resume
path is checked before all validation for the same reason. `updateSessionSubject` is a
direct client update (mirrors `updateSessionTopic`). `scan_attendance` deliberately does
NOT get its active-semester guard here — that belongs to the rollover migration, where a
past-semester section can first exist. Attendance embeds `subjects(code, name)`; use
`oneEmbed()` in api.ts, since supabase-js infers an array for a many-to-one embed that
PostgREST actually returns as an object.

Since 0027 (Academic structure): `semesters` (one active at a time, enforced by the
partial unique index `(is_active) where is_active`), `semester_terms`
(prelim|midterm|finals with EDITABLE `starts_on`/`ends_on` — six-week arithmetic is only
the seeded default; real calendars move), `subjects` (per semester), `section_subjects`
(link table; pickers only offer valid combos), `sections.semester_id` (defaults to
`cp_active_semester_id()`). **`sections.name` lost its GLOBAL unique constraint** —
uniqueness is now `(semester_id, lower(name))`, which is what lets "BSIT 2A" exist in
several semesters. The section_subjects seed is guarded on "the table is completely
empty" so unticking a combination survives a re-run. **Ownership move:
`cp_nightly_backup` 0023 → 0027** (four new tables; mirrors self-create via its existing
exception handler). `src/lib/term.ts` is now DB-driven but still SYNCHRONOUS, with the
old hardcoded dates as a fallback: `configureTermCalendar()` swaps in the real calendar,
`termStart()` replaces the old `TERM_START` const, and `weekOf`/`weekRange`/`weekLabel`/
`groupByWeek` keep their signatures (so their call sites didn't change); new `termOf`,
`termLabel`, `termRanges`, `groupByTerm`, and a `term` field on each week group.
InstructorLayout configures it for the whole instructor area; **StudentReport must call
`loadTermCalendar()` itself** because it renders OUTSIDE that layout. term.ts imports no
Supabase — the fetch lives in api.ts (`loadTermCalendar`, memoized, fails soft).
Instructor screen: `/teach/semesters` (`ManageSemesters`).

Since 0026 (Security): `auth_events` — every claim / PIN-reset attempt (`kind`,
`success`, `ip`, `user_agent`, `student_id` with no FK, coarse `detail`). It is BOTH
the audit trail and the rate-limit counter: the two public edge functions count an
IP's recent failures before touching a token (**30 per 15 min** — deliberately
generous because a whole class shares one NAT IP; rows with `detail = 'rate_limited'`
are excluded from the count so retries can't extend a lockout). Instructor-select
only, no write policy — the functions insert with the service role. Weekly prune cron
`classpoint-auth-events-prune` (180-day retention). **Ownership move:
`cp_generate_token` 0002 → 0026** — claim/reset tokens are now 16 hex chars (64 bits);
EXISTING shorter tokens stay valid, so mixed lengths in `student_secrets` are expected.
Shared edge helpers live in `supabase/functions/_shared/security.ts` (CORS allowlist
via the `ALLOWED_ORIGINS` secret, rate limit, logging) — all of it fails OPEN on
infrastructure errors so a logging or counter failure never blocks a real student.
`send-push` now rejects any caller that isn't the service role (it previously accepted
any signed-in student's JWT, since the gateway's `verify_jwt` is satisfied by any valid
token); it accepts an exact service-key match OR a `service_role` JWT so a rotated
Vault secret can't silently kill push. Claim/reset error messages are uniform
("not valid **or** already used/expired") so a guesser can't distinguish token states;
the archived-student message stays specific because it is only reachable after a valid
unclaimed token matched. `vercel.json` serves HSTS, `X-Frame-Options: DENY`, nosniff,
`Referrer-Policy`, and `Permissions-Policy` (`camera=(self)` — the QR scanner needs it).
**No CSP yet** — deferred by the user; adding one requires moving the inline
`beforeinstallprompt` script out of `index.html` and allowlisting the Google Fonts and
Supabase (https + wss) origins.

Since 0024: `attendance_records.synced_late` (offline check-in flag). Offline
check-in: the QR now encodes `{origin}/scan#CP1|…` so native cameras work (public
`/scan` route captures the proof, then routes by auth); `parsePayload` accepts both
the URL and legacy `CP1|…` forms. Proofs queue in localStorage (`cp_offline_scans_v1`,
`lib/offline-scans.ts`, capture-first), sync on app-start/`online`/Attendance-mount.
`submit_offline_scan` re-validates the HMAC, computes status from the CAPTURE window
(48h expiry), and UPGRADES to a better status (present>late>absent) via the shared
`cp_apply_attendance_status` core — never worsens, never overwrites excused/irregular.
**Ownership move: `set_attendance_status` 0018 → 0024** (now a thin instructor-gate
over `cp_apply_attendance_status`, which is revoked from all API roles). `vite.config`
gained `navigateFallback: '/index.html'` (offline deep links) with a REST/functions/auth
denylist.

Phase C (frontend-only, no migration): instructor per-student record page at
`/teach/student/:id` (`StudentRecord`) — reached via the "View ›" button on each
roster row; reuses `listMyAttendance`/`listStudentEvents`/`listMyRedemptions`/
`getMyAchievements`/`getMyRank` (all instructor-RLS-readable) + new `getStudent`
(joins `sections(name)`). Printable "Attendance Record" at
`/teach/student/:id/report` (`StudentReport`) is registered UNDER the `/teach`
RequireRole node but OUTSIDE `InstructorLayout` (no Shell/tabs); it renders
hardcoded light styles (no theme tokens → dark mode can't leak) + a `print:hidden`
toolbar and `@page { size: A4 }`. Never call it "Parent Report" in UI. Register
matrix export (`exportSectionRegister`, P/L/A/E/I cells via `aoa_to_sheet`) and
"Backup all" workbook (`lib/export-all.ts` → `fetchFullBackup`, paged `.range`)
both dynamic-import xlsx. Award deep-link: `/teach/award?student=<id>` preselects
via a ref that applies once the section's roster loads.

Since 0023 (Reliability Era): `audit_log` (full-JSON record of every destructive
action; instructor-select only, written by the `cp_audit_delete` AFTER DELETE trigger
on students/point_events/attendance_records/class_sessions + by the archive RPCs).
`backup` schema (one table per critical source, `snapshot_date`-keyed; nightly
`cp_nightly_backup()` at 02:00 Manila, 14-day retention, self-heals on schema drift;
no API-role grants). `students.archived_at` (archive-instead-of-delete): archive via
`archive_student`/`restore_student`/`hard_delete_student` RPCs (hard delete refuses
unless already archived; the app double-confirms with a typed-name challenge).
**Ownership moved to 0023 (all same-signature `create or replace`):**
`refresh_leaderboard_snapshot` (0006→0023, `where archived_at is null`),
`end_class_session` + `scan_attendance` (0014→0023, archived guards),
`get_achievement_rarity` (0021→0023, archived denominator). Client reads of active
rosters filter `.is('archived_at', null)`; `listSessionAttendance` instead keeps an
archived student's row ONLY when they have a record in that session (history stays
truthful). `deleteSection` counts archived students too. `claim-token` edge function
rejects archived roster rows (redeploy after 0023).

Since 0025: `absence_excuses` (DCT-CCS admission-slip flow) — student
`request_absence_excuse` (own absent record, 7-day window, absent-only,
`has_slip` flag) / `set_excuse_slip_status` / `cancel_absence_excuse`; instructor
`decide_absence_excuse` (approve → `set_attendance_status(record,'excused')`
reconciles the penalty; queues one `'excuse'` notification). **Ownership move:
`cp_notify_point_event` 0017 → 0025** (absence penalty push gains the
admission-slip line; still ONE push). Instructor inbox is the ONE tabbed
`/teach/redemptions` "Requests" page (Points | Excuses); badge = pending
redemptions + pending excuses, both counts + channels hoisted in InstructorLayout
(`uniqueChannel('redemptions-badge')` + `'excuses-badge'`). Student surface:
`AbsenceExcuses` above the attendance history (guidance card, per-record dismiss
in localStorage `cp_excuse_guide_dismissed_v1`, request sheet + slip toggle).

Since 0017–0020: `notifications` (the push outbox AND the in-app bell's history),
`point_redemptions` (spend requests), `leaderboard_comments` +
`leaderboard_banned_words` (24h flying comments). Attendance statuses are
`present|late|absent|excused|irregular`. `point_events.category` is
`recitation|activity|penalty|redeem`.

Gotchas:
- `cp_achievement_metrics` has ONE owner: migration **0021** (drops + recreates it).
  0018 deliberately does NOT recreate it — two migrations recreating a function
  whose return type changes clash on re-run (`ERROR 42P13: cannot change return
  type`, since `create or replace` can't change the signature). Any future change
  goes in a single new migration that does `drop function if exists` first, then
  recreates dependents `sync_achievements` + `get_achievement_progress` (also
  drop-first) and re-grants. Never let two migrations own it.
- Event-granted badges (`town_crier`, `window_shopper`) are set by TRIGGERS
  (`trg_town_crier` on leaderboard_comments, `trg_window_shopper` on
  point_redemptions), NOT by `sync_achievements` — they're not in its satisfied
  list. `granted_by='system'` but no metric. Don't add them to sync.
- pg_net `http_post` is fire-and-forget — never mark push work "sent" from SQL.
  Only the `send-push` edge function transitions `notifications.push_status`.
- `end_class_session` inserts absents with `on conflict do nothing` — records that
  already exist (any status) are never overwritten. Intentional; don't "fix".
- **Every attendance status change must go through `set_attendance_status`** (via
  `updateAttendanceStatus` in api.ts). A direct `.update({status})` bypasses penalty
  reconciliation and leaves a stale penalty in the ledger. The direct upserts
  (`markAttendanceManually`/`markAttendanceBulk`/`resetAttendance`) are LIVE-SESSION
  ONLY, where nothing is committed yet.
- `commit_attendance_penalties` deliberately queues no notifications: its
  `point_events` insert already fires `cp_notify_point_event`. Adding one = double push.
- 'excused'/'irregular' are NEUTRAL everywhere: no penalty, excluded from streaks,
  show-up rate, and achievement metrics (`NEUTRAL_STATUSES` in types.ts).
- **Spending = ONE BALANCE** (user's decision): an approved redemption inserts a
  negative `point_events` row (category `redeem`), so it lowers XP/level/rank like
  any loss. Overspend prevention = `select students … for update` in BOTH
  `request_point_redemption` and `decide_point_redemption` (same lock order —
  student row first — so they can't deadlock); available = `lifetime_points` minus
  pending. Validating against `lifetime_points` is safe because it's
  `greatest(0, sum)` and therefore always ≥ the raw sum.
- `listRecentAwards` filters out `redeem` events: deleting one there would refund
  the points while the redemption still reads "approved" (a silent desync).
- `cp_notify_point_event` skips `redeem`; `decide_point_redemption` sends the
  single richer notification instead. Don't add a second.
- `leaderboard_comments` denormalizes `display_name`/`avatar_url` at post time so
  a realtime INSERT payload can render a pill with no extra fetch. Rows live 24h,
  so staleness is a non-issue. `student_id is null` ⇒ posted by the instructor.
- The floating-comment keyframe (`.cp-rise`) needs **`container-type: size`** on
  the track — `cqh` resolves against it. ⚠ **`inline-size` is NOT enough, and the
  failure is not the one you would guess.** It establishes a query container on
  the INLINE axis only, so `cqh` skips the track and falls back to the small
  VIEWPORT: measured, a 206px track moves a 38px pill −244px correctly and
  **−849px** under `inline-size`. The pill does not sit still — it travels about
  four times too far in the duration `flightDurationMs` computed from the track's
  height, so every pill moves four times too fast and the no-overlap guarantee in
  `danmaku.ts` silently stops holding. On screen it reads as "a bit fast".
  Keep it as `cqh`, never `vh`: `cqh` measures the TRACK, which is what keeps the
  animation correct when the track changes shape.
  **The deck is a FULL-SCREEN overlay** containing a narrow TRACK, centred to the
  app's own `max-w-2xl` reading column so comments rise beside the board on a wide
  screen rather than against the far edge of the window. `pointer-events-none` on
  the deck is LOAD-BEARING: without it the layer swallows every tap on the board,
  the section picker and the tab bar. Verified with `elementFromPoint` — over a
  plain pill the tap reaches the control beneath; over a tappable pill it hits the
  pill. ⚠ Re-verify that with **`elementsFromPoint`** (plural, index 0): the
  singular API returns a stale node while the pane is not compositing. The track
  is inset from the header and the tab bar (`TOP_INSET` / `BOTTOM_INSET`) so
  comments never cover the app's own chrome — and as the TRACK's geometry rather
  than a per-lane Y position, which is the stronger guarantee: a pill travelling
  vertically crosses every Y it passes, so "stay off the chrome" cannot be a
  starting position. Tapping a student pill fires `onOpenProfile` up to the
  leaderboard (which owns the profile sheet); instructor moderation lives only in
  the Recent comments list.
- **`src/lib/danmaku.ts` owns the floating-comment timing, and it is TESTED.** The
  old code was capped at `LANES = 1` — one comment on screen at a time, roughly
  seven a minute, with only the newest six of twenty ever flying — and it
  reserved a lane from an ESTIMATED width (`96 + chars * 6.6`). That estimate WAS
  the anti-overlap guarantee, and it could not account for wrapping, the width
  cap, emoji or a long name, so it was wrong in both directions at once. A pill
  now mounts parked outside the track, is MEASURED at its real size, and only
  then gets a duration. `danmaku.test.ts` simulates two pills sharing a lane at
  the earliest instant the rules allow and asserts their boxes stay disjoint.
  **The module is AXIS-AGNOSTIC** since the column rewrite (2026-11-08): its
  parameters are `travelPx` / `pillPx`, not `deckWidth` / `pillWidth`, because the
  guarantee is about a distance and a size and never cared which axis they were
  measured on. ⚠ The caller must pass the size **on the axis of travel** —
  `offsetHeight` for the rising column. Passing the width while the pill rises
  holds the column for the wrong duration and lets a tall comment be overtaken,
  which nothing else would catch. `laneCount` was DELETED with that rewrite: it
  derived a lane count from the viewport height, which only means something when
  lanes are stacked vertically, and one column needs no such answer.
  **Pills wrap to three lines rather than truncating** — the clamp sits on the
  WRAPPER, not the body: `line-clamp` makes its element a `-webkit-box`, so on
  the body alone the sender's name breaks onto its own line. In a column a taller
  pill costs nothing, where in the old horizontal lanes it risked the lane below.
- `get_profile_visitors` (0022) returns the viewer's `student_id` + section/points/
  rank so a tapped visitor row opens their profile. VisitorsSheet bubbles the row
  up via `onOpenViewer` (Profile owns the preview) to avoid a component→feature
  import cycle.
- **`npm run lint` used to typecheck NOTHING** (bare `tsc --noEmit` against a
  references-only tsconfig resolves zero files and always exits 0). Fixed in Era 6.0
  Phase 4 to `tsc -b --noEmit`. If a typecheck ever passes suspiciously fast on a
  suspiciously broken file, check that the command is `-b`.

## Era 5.0 Phase B fixes (2026-08-14) — conventions worth keeping

- **Ticks never cross a roster.** `Students.openSection()` and the back button clear
  `selected`/`lastAwarded`. Carrying them meant the award bar stayed docked over a
  DIFFERENT section and awarded the wrong students' ids, with nothing on screen to show it.
- **`AwardBar` labels the real action** ("Deduct −5 from 3"), turns the whole bar red
  while deducting, and routes any bulk penalty — or a single one over 5 — through
  ConfirmDialog. Custom points REJECT rather than clamp (typing 500 no longer silently
  becomes 100). Three bulk selectors live above the roster: all (filtered) / unclaimed /
  last class's attendees.
- **`createAttendanceRecord`** (api.ts) fills a missing record two-step ON PURPOSE:
  insert as `excused` (the one status with no penalty), then apply the real status via
  `set_attendance_status`, the single path that reconciles the ledger. Inserting the
  final status directly would record attendance but skip the deduction every other
  student in that session took.
- **`withAuthRetry` is safe blanket-wide** and now wraps the mutating calls via the thin
  `rpc()` helper: it retries ONLY auth-layer rejections (401/PGRST301/JWT/refresh), which
  are rejected before PostgREST touches the table — so a non-idempotent insert cannot
  double-fire. A dropped response after a commit does not match and rethrows.
- **`src/lib/errors.ts`** owns `errorText(e, fallback)` — six identical copies existed.
  Server messages ≤160 chars are shown verbatim (they're deliberate and useful); longer
  ones are raw Postgres dumps and fall back.
- **Student false-empties are gone.** Attendance / UsePoints / Achievements each have an
  error+retry card; a failed fetch no longer reads as "you have no record". StudentData
  exposes `achievementsError` + `retryAchievements`, and `attendanceTick` — bumped by a
  new `attendance_records` subscription on the durable `student-self-*` channel, so an
  instructor's correction reaches the student live.
- **`load()` returns the in-flight promise** instead of resolving instantly, or
  pull-to-refresh snaps back having done nothing. `listSections` on the student side is
  scoped to the active semester (post-rollover the picker would otherwise list dead
  semesters' sections). `loadTermCalendar` clears its memo on failure rather than
  caching the rejection forever.
- Notification types: `'excuse'` added (0025 queues it), dead `'attendance_penalty'`
  removed (absence penalties arrive as `'deduct'`).

## Instructor information architecture (reworked 2026-08-13)

**Four bottom tabs: Students · Attendance · History · Ranks.** Requests stays in the
Shell's `actions` slot with its badge. What moved and why:

- **Awarding lost its tab** and lives in the section roster (`Students.tsx`): the row
  body ticks a student (avatar doubles as the checkbox), the icon buttons and `View ›`
  stay explicit. `AwardBar.tsx` docks above the mobile tab bar when anything is ticked
  and carries the full controls. **The bulk flow is the reason this component exists** —
  tick several, choose the amount once, award together — plus the "select the same N
  again" shortcut. Do not regress it to one-student-at-a-time.
- **`History.tsx` is a tabbed page** (Points | Attendance) in the Requests-page style,
  hosting `AwardHistory` and `SessionHistory`, which each take an `embedded` prop that
  hides their own page header. Class attendance stats used to be a text link on the
  Attendance screen, which the live/review views replace outright — so they were
  unreachable exactly while a class was running. The active tab mirrors to `?tab=`.
- **Redirects keep old links alive** (router.tsx): `/teach/award` → `/teach`,
  `/teach/attendance/history` → `/teach/history?tab=attendance`. The record page's Award
  button now goes to `/teach?student=<id>`, which opens that student's section and
  pre-ticks them.
- `src/features/instructor/Award.tsx` is **orphaned** by this change and kept only until
  the user confirms deletion.

## Auth model

Students: username + PIN → synthetic email `@students.classpoint.app`; onboard via
claim tokens (edge function `claim-token`). Instructors: real email + `is_instructor()`
allowlist check; sign-in lives at the unlisted route `/macalesideauth`. Student area
`/app` (`AppLayout`), instructor area `/teach` (`InstructorLayout`); RLS is the real
security boundary. Since 0026 **all four** auth forms wire `useLockout` (5 failures →
60s, doubling, 15m cap): `cp_instr_login`, `cp_student_login`, `cp_claim`,
`cp_reset_pin`. Only SERVER rejections call `registerFailure()` — a local `validate()`
typo must not count. This is a speed bump, not a boundary (localStorage is clearable);
for claim/reset the server-side per-IP limit in `auth_events` is the real gate, and
failed PASSWORD sign-ins are not server-observable at all (they go straight to GoTrue),
which is why there is deliberately no server-side failed-login log.

## Working agreements with the user

- **Per-phase decision checkpoints (HARD RULE, never skip):** before implementing any
  overhaul phase or large feature, present its real design forks via AskUserQuestion —
  copy/tone, layout variants, limits, colors, placement. The user decides; never
  silently pick defaults on user-visible choices.
- **Warn on everything risky:** any new destructive action gets a ConfirmDialog.
- **Playful tone:** game content (achievements, flavor text, notification copy) should
  be playful/inside-joke flavored, not sanitized corporate copy — but the user reviews
  drafts (see decision checkpoints).
- **Keep this file updated** whenever architecture, conventions, or agreements change.
- The approved overhaul master plan lives at
  `C:\Users\kobym\.claude\plans\this-is-planning-phase-swift-wilkes.md` (6 phases,
  one migration per phase, 0017+).


# Token diet
most of my usage is you re-reading this chat. keep it short.
wait for background jobs to ping you. never check on them in a loop.
never wake an idle agent to ask for status. send it a real next step.
when a job is done, tell me to run /compact or write a handoff for a fresh chat.
max 2 helper agents at a time. use a cheaper model for jobs that only read files.”