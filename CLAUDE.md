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
- **Migration before client, always.** A migration adding a column the client selects
  must land in the database BEFORE the build that selects it, or every read 400s.
  **ALL migrations 0001–0041 are APPLIED as of 2026-09-02** (confirmed by the user; 0041 was pasted twice to prove idempotency). **0042 and 0043 are WRITTEN AND NOT YET APPLIED** — until they are, /app/space/lounge and /app/space/chats show their error states and every Lounge/messaging RPC 404s. Paste them in order.
  The long "0033–0040 are unapplied / this one is LOUD" warning that used to live here
  is gone because it was describing a state that no longer exists — and a stale warning
  is worse than none, since the next reader cannot tell which half is still true.
  **Next number: 0044.**

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
  off the right edge. Keep it as `cqw`, never `vw`: `cqw` measures the DECK, and
  that is what kept the animation correct when the deck changed shape.
  **The deck is now a FULL-SCREEN overlay** (it used to be a sticky band above
  the podium — reversed on the user's instruction, 2026-08-31). `pointer-events-none`
  on it is LOAD-BEARING: without it the layer swallows every tap on the board,
  the section picker and the tab bar. Verified with `elementFromPoint` — over a
  plain pill the tap reaches the control beneath; over a tappable pill it hits
  the pill. Lanes stop short of the header and the tab bar (`TOP_INSET` /
  `BOTTOM_INSET`) so comments never cover the app's own chrome. Tapping a student
  pill fires `onOpenProfile` up to the leaderboard (which owns the profile
  sheet); instructor moderation lives only in the Recent comments list.
- **`src/lib/danmaku.ts` owns the flying-comment timing, and it is TESTED.** The
  old code was capped at `LANES = 1` — one comment on screen at a time, roughly
  seven a minute, with only the newest six of twenty ever flying — and it
  reserved a lane from an ESTIMATED width (`96 + chars * 6.6`). That estimate WAS
  the anti-overlap guarantee, and it could not account for wrapping, the width
  cap, emoji or a long name, so it was wrong in both directions at once. A pill
  now mounts parked off the right edge, is MEASURED at its real size, and only
  then gets a lane. `danmaku.test.ts` simulates two pills sharing a lane at the
  earliest instant the rules allow and asserts their boxes stay disjoint.
  **Pills wrap to three lines rather than truncating** — the clamp sits on the
  WRAPPER, not the body: `line-clamp` makes its element a `-webkit-box`, so on
  the body alone the sender's name breaks onto its own line. Measured at 375px:
  a 3-line pill is 78px in a 90px lane, and both a 400-word comment and a
  204-character unbroken string stay inside it (`[overflow-wrap:anywhere]`).
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
