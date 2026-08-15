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
- **UI:** modals = `src/components/ui/Sheet.tsx` (bottom sheet). Toasts = `useToast()`.
  Confirmations = `src/components/ui/ConfirmDialog.tsx` — **every destructive or
  hard-to-undo action must go through it** (deletes, bulk marks, end session, commit
  penalties). The one exception: single-student taps during a LIVE attendance session
  stay one-tap for speed.
- **Components:** function components, named exports, PascalCase files. Lazy imports
  destructure the named export: `.then(m => ({ default: m.Foo }))`.
- **Verify: `npm run verify`** — typecheck (`tsc --noEmit`) → ESLint → 77 unit tests →
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
  WARNINGS for now: 47 remain, dominated by react-hooks v7's `set-state-in-effect` and
  `purity` performance opinions (the purity hits are all `Math.random()` in decorative
  confetti). It already earned its place by catching a real ordering smell in
  `Students.tsx`. Tighten to errors once the backlog is read.
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
"What's new" sheet; version-gated by localStorage). **Current mode: the 4.0.0
"Semesters & Subjects" draft** (3.0.0 shipped 2026-07-19). During overhaul phases,
accumulate sections into the exported `DRAFT_4_0_0` entry (NOT in the `CHANGELOG`
array — `LATEST_VERSION` reads `CHANGELOG[0]`, so a draft is invisible to users) and
only move it into the array as `4.0.0` when the user says the era is ready to announce.

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
  edge function secrets; pg_cron + pg_net enabled. **Pending since 0026:** set the
  `ALLOWED_ORIGINS` edge-function secret (comma-separated origins, no trailing slash)
  and redeploy `claim-token`, `reset-pin`, `send-push`. Until it is set the two public
  functions stay on the old permissive CORS — by design, so a missing secret can never
  take the app down.
- The user pastes migrations whole into the SQL editor — test idempotency by running twice.
- **Migration before client, always.** A migration adding a column the client selects
  must land in the database BEFORE the build that selects it, or every read 400s.
  **All migrations through 0032 are applied as of 2026-08-14.** Next number: 0033.

## DB map (migrations 0001–0016 are the source of truth)

Tables: `sections`, `students` (cached `lifetime_points` = trigger-maintained
`greatest(0, SUM(point_events.points))`), `student_secrets`, `point_events` (the
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
(Points | Excuses | Rewards). **Ownership move: `cp_nightly_backup` 0027 → 0032.**

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
- The danmaku keyframe (`.cp-fly`) needs `container-type: inline-size` on the
  deck — `cqw` resolves against it. Without it pills start mid-board instead of
  off the right edge. Never swap `cqw` for `vw`: the deck is a centred column.
  The deck is a `sticky top-[52px]` band ABOVE the podium (not an absolute
  overlay on it) so it never covers the crown and stays visible while scrolling
  the rankings. Tapping a student pill fires `onOpenProfile` up to the leaderboard
  (which owns the profile sheet); instructor moderation lives only in the Recent
  comments list.
- `get_profile_visitors` (0022) returns the viewer's `student_id` + section/points/
  rank so a tapped visitor row opens their profile. VisitorsSheet bubbles the row
  up via `onOpenViewer` (Profile owns the preview) to avoid a component→feature
  import cycle.
- `npm run lint` (`tsc --noEmit`) misses unused locals; **`npm run build` (`tsc -b`)
  is the stricter gate** — run it before declaring done.

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
