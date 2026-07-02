# ClassPoint

> A gamified classroom points system — an instructor awards 1–5 points to students, and students track their points, level up RPG-style, and climb a cross-section leaderboard. Built as an installable PWA for college IT students.

**"RPG-grind meets academic professionalism."** Red / gray / white palette with a gold accent reserved for XP and rewards. Light + dark themes.

---

## Table of contents

1. [Overview](#1-overview)
2. [Feature list](#2-feature-list)
3. [Tech stack](#3-tech-stack)
4. [How the app is structured (modules)](#4-how-the-app-is-structured-modules)
5. [Core concepts you must understand](#5-core-concepts-you-must-understand)
6. [Code tutorial — follow the data end to end](#6-code-tutorial--follow-the-data-end-to-end)
7. [The database (Supabase / Postgres)](#7-the-database-supabase--postgres)
8. [Authentication & the claim flow](#8-authentication--the-claim-flow)
9. [Setup from scratch](#9-setup-from-scratch)
10. [The build journey — phase by phase](#10-the-build-journey--phase-by-phase)
11. [Common tasks & troubleshooting](#11-common-tasks--troubleshooting)
12. [Roadmap (remaining work)](#12-roadmap-remaining-work)

---

## 1. Overview

ClassPoint has **two kinds of users**:

| Role | What they do |
|------|--------------|
| **Instructor** (one account) | Manages the roster of students per section, generates a one-time **claim token** for each student, and awards points (1–5) for recitation or activities. |
| **Student** (many accounts) | Claims their account once with the token (chooses a username + PIN), then logs in to see their points, level/XP bar, global rank, and points history. |

**The loop:** Instructor adds a student → hands them a token → student claims it and picks a username + PIN → instructor awards points in class → points become XP → students level up and rank up on the leaderboard.

### Leveling rules
- **XP = cumulative lifetime points** = `SUM(point_events.points)`, clamped at 0. Awards raise it; **penalties** (negative events) lower it, but it never drops below 0 (so level math never breaks).
- Clearing **Level 1 → 2 costs 50 XP.**
- Each next level costs **1.5× the previous requirement, rounded**: `50 → 75 → 113 → 170 → 255 → …`
- Leftover XP overflows naturally into the next level.
- This math lives in **one place on the client** (`src/lib/leveling.ts`) and is **mirrored exactly in the database** (`cp_level()` SQL function), so the two never disagree.

### Live vs. settled (important model)
- A student's **dashboard is live** — points, XP, level, and the feed update in real time via Supabase Realtime as the instructor awards.
- The **leaderboard is "settled" twice a day** — a `pg_cron` job snapshots the ranking at **7:30 AM and 7:30 PM Philippine Time**. Between snapshots the board (and a student's official rank) is frozen, with a "next update in Xh Ym" countdown. This creates anticipation and a stable ranking.

---

## 2. Feature list

**Instructor**
- **Section-card landing** — the Students tab opens on a grid of section cards (each showing student + claimed counts), plus a dashed "New section" card for quick creation. Tap a card to open that section's roster; a "← Sections" link returns to the grid.
- **Install button** — an "Install app" button (on the section grid) with live states: installs via the native prompt where supported, shows "Installed ✓" once installed, and gives Add-to-Home-Screen steps on iOS. Shares the one-shot `beforeinstallprompt` event with the bottom install banner via a small `PwaInstallProvider`.
- Roster management per section, add/remove students.
- **Editable sections** — create, rename, and delete sections from the UI ("Manage" on the section grid). A section can only be deleted once it has no students (deleting would cascade-remove the whole roster).
- **Excel / CSV import** — upload an `.xlsx`/`.xls`/`.csv` of names to bulk-add students to the selected section; the parser auto-detects a "Name" column (falls back to the first column) and shows the generated tokens to copy.
- **Roster export** — download the current section (names, usernames, claim status, level, points, tokens) as `.xlsx`.
- One-time claim token generated per student; copy a single token or bulk-copy all unclaimed tokens.
- **Roster search** — filter the list by name or @username.
- See claim status (claimed → @username, level, points; unclaimed → the token).
- Award points: multi-select students (or "select all"), category (Recitation / Activity), +1…+5, optional note, batch-award.
- **Penalties (minus points)** — flip the award panel to "Penalty" to deduct −1…−5 for violations (a dedicated `penalty` category; a student's total never drops below 0).
- **Activity log + undo** — a "Activity" tab lists the last 40 awards/penalties; revert any mistaken one (the total recomputes automatically).
- Frozen leaderboard (with avatars) with a per-section filter, "as of 7:30" stamp, and animated reordering.

**Student**
- Dashboard: level + animated XP bar, total points (live), official rank (settles 7:30 AM/PM), live points feed (deductions render in red).
- **Profile picture** — upload your own avatar in Profile (JPG/PNG/WebP/GIF, max 5 MB); it appears on the dashboard, leaderboard, and the instructor's roster.
- **Level-up burst**: a full-screen celebration fires when you level up — live if you're watching, or the next time you open the app after a missed level-up.
- **Leaderboard podium** — the top 3 sit on an animated winners' podium (crown, gold glow, count-up); the rest follow as ranked rows. Global **Top 10** with your own row pinned if you're outside it, plus the settle stamp + countdown.
- **Tap-to-preview profiles** — tap any player on the leaderboard to open a profile sheet: avatar, level + XP, rank, points, their bio/interests, and their recent points history (via the `public_point_events` SECURITY DEFINER function, since RLS otherwise hides other students' history).
- Profile: edit your public **display name, bio, and interests** (roster name stays private); a **"Preview"** button shows exactly what classmates see.
- **Notifications** — opt-in **push notifications** (points, level-ups, rank changes) delivered even when the app is closed (installed PWA; iOS 16.4+), plus in-app **sound + vibration** you can toggle in Profile.

**Cross-cutting**
- Installable **PWA** with a custom "Install ClassPoint" banner (native prompt where available; iOS Add-to-Home-Screen hint otherwise).
- **Web Push** — a `send-push` Edge Function (VAPID) delivers OS-level notifications while the app is closed; a `public/push-sw.js` handler (imported into the Workbox service worker) shows them. Postgres triggers (`pg_net`) fire the function on point events and twice-daily rank changes.
- **"What's new" release notes** — a sheet shown on app open when there are unseen updates, driven by a single appendable `src/lib/changelog.ts`.
- **"New version available" prompt** — the service worker waits for the user to reload instead of refreshing mid-task.
- **Offline indicator** — the cached app shell loads offline with a "You're offline" pill.
- **Code-split routes** — each screen is a separate lazy-loaded chunk for a smaller first load.
- **Light / dark theme** toggle.
- **Mobile-first & responsive** — bottom tab bar on mobile, left sidebar on desktop; bottom sheets **swipe down to dismiss** and cap to the viewport with internal scroll.
- Framer Motion animations (entrance staggers, spring XP bar, swipe-to-dismiss sheets, toasts, level-up burst, winners' podium, leaderboard reorder).
- Role-based routing guards.

---

## 3. Tech stack

| Layer | Choice |
|-------|--------|
| Build tool | **Vite 8** |
| UI | **React 19** + **TypeScript 6** |
| Styling | **Tailwind CSS v4** (via `@tailwindcss/vite`, configured in CSS not a JS config) |
| Animation | **Framer Motion 12** |
| Routing | **React Router v7** (`createBrowserRouter`) |
| Backend | **Supabase** — Postgres + Auth + Realtime + Edge Functions (Deno) + pg_cron |
| PWA | **vite-plugin-pwa** (Workbox `generateSW`) |

Scripts (`package.json`):
```bash
npm run dev      # start the Vite dev server (localhost:5173)
npm run build    # tsc -b && vite build  → production bundle in dist/
npm run preview  # preview the production build
npm run lint     # tsc --noEmit (type-check only)
```

---

## 4. How the app is structured (modules)

```
ClassPoint App/
├─ index.html                 # Vite entry HTML
├─ vite.config.ts             # Vite + React + Tailwind + PWA config
├─ tsconfig*.json             # TS config; "@/*" path alias → ./src/*
├─ .env                       # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (gitignored)
├─ .env.example               # template for the above
├─ public/                    # PWA icons (shield + star SVGs)
│
├─ src/
│  ├─ main.tsx                # React root
│  ├─ App.tsx                 # Provider tree: Theme → Toast → Auth → Router
│  ├─ router.tsx              # All routes + role guards
│  │
│  ├─ lib/                    # Framework-agnostic logic ("the brain")
│  │  ├─ supabase.ts          # Supabase client (reads env, safe placeholders)
│  │  ├─ auth.tsx             # AuthProvider: session, role detection, sign-in, claim
│  │  ├─ api.ts               # ALL database queries live here (one layer)
│  │  ├─ types.ts             # Shared TypeScript interfaces
│  │  ├─ leveling.ts          # Level/XP math (mirrors the SQL cp_level())
│  │  ├─ time.ts              # "2h ago" feed time + snapshot countdown helpers
│  │  ├─ theme.tsx            # Light/dark provider
│  │  ├─ cn.ts                # className merge helper
│  │  ├─ push.ts              # Web Push subscribe/unsubscribe + SW notifications
│  │  ├─ sound.ts             # In-app sound effects (mutable)
│  │  ├─ haptics.ts           # Vibration patterns (mutable)
│  │  └─ changelog.ts         # "What's new" entries + seen-version tracking
│  │
│  ├─ components/
│  │  ├─ layout/
│  │  │  ├─ Shell.tsx         # Responsive shell: sidebar (desktop) / tabs (mobile)
│  │  │  ├─ AppLayout.tsx     # Student shell: StudentDataProvider + level-up overlay
│  │  │  └─ Splash.tsx        # Full-screen loading state
│  │  ├─ ui/                  # Reusable primitives
│  │  │  ├─ Button, Card, Input, Select, Sheet (swipe-to-dismiss), Toast
│  │  │  ├─ Avatar.tsx        # Picture with initials fallback
│  │  │  ├─ XpBar.tsx         # Animated gold XP bar
│  │  │  ├─ LevelUpBurst.tsx  # Full-screen level-up celebration
│  │  │  ├─ SnapshotStamp.tsx # "Updated 7:30 AM · next in 5h 12m"
│  │  │  ├─ Logo.tsx, ThemeToggle.tsx, icons.tsx
│  │  ├─ leaderboard/
│  │  │  └─ PodiumBoard.tsx   # Animated top-3 podium + ranked rows (shared by both leaderboards)
│  │  └─ pwa/                 # Install banner/button, update prompt, offline indicator
│  │
│  ├─ features/
│  │  ├─ Landing.tsx          # Public landing page
│  │  ├─ WhatsNew.tsx         # "What's new" sheet shown on app open
│  │  ├─ auth/
│  │  │  ├─ SignIn.tsx        # Student login (username + PIN)
│  │  │  ├─ Claim.tsx         # Claim account with token
│  │  │  ├─ InstructorSignIn.tsx
│  │  │  └─ guards.tsx        # RequireRole, RedirectIfAuthed
│  │  ├─ student/
│  │  │  ├─ StudentData.tsx           # Context: loads "me" + snapshot + feed; realtime; level-up
│  │  │  ├─ Dashboard.tsx             # Live level/XP/points + official rank + feed
│  │  │  ├─ Leaderboard.tsx           # Podium Top 10, self pinned; tap → profile preview
│  │  │  ├─ StudentProfilePreview.tsx # Tap-a-classmate profile sheet (bio, interests, recent points)
│  │  │  └─ Profile.tsx               # Edit display name + bio + interests; preview public profile
│  │  └─ instructor/
│  │     ├─ InstructorLayout.tsx       # Context: sections + selected section
│  │     ├─ Students.tsx               # Section grid + roster (add/remove, tokens, import/export)
│  │     ├─ Award.tsx                  # Award points / penalties
│  │     ├─ AwardHistory.tsx           # Last 40 awards + undo
│  │     └─ InstructorLeaderboard.tsx  # Frozen snapshot podium + section filter
│  └─ styles/index.css        # Tailwind import + design tokens + theme vars
│
└─ supabase/
   ├─ migrations/             # SQL you paste into the Supabase SQL Editor
   │  ├─ 0001_schema.sql                 # tables + indexes
   │  ├─ 0002_functions_triggers.sql     # functions, triggers, RPCs
   │  ├─ 0003_security.sql               # Row-Level Security policies + grants
   │  ├─ 0004_realtime.sql               # realtime on students / point_events
   │  ├─ 0005_seed.sql                   # instructor allowlist + sections 2A–2E
   │  ├─ 0006_leaderboard_snapshot.sql   # frozen board + pg_cron (7:30 AM/PM PHT)
   │  ├─ 0007_avatars_import_minus.sql   # avatars bucket + minus points + bulk import RPC
   │  ├─ 0008_push_notifications.sql     # push_subscriptions + pg_net triggers → send-push
   │  ├─ 0009_public_profiles.sql        # students.bio/interests + public_point_events()
   │  └─ 0010_push_vault.sql             # push config via Vault (replaces app.settings GUCs)
   └─ functions/
      ├─ claim-token/                    # Deno Edge Function (account claim)
      └─ send-push/                      # Deno Edge Function (signs + delivers Web Push)
```

### The golden rule of this codebase
**`src/lib/` is the brain; `src/features/` and `src/components/` are the face.**
Anything that touches the database goes through **`src/lib/api.ts`**. UI components never call Supabase directly — they call an `api.ts` function or read from a context provider. (Realtime subscriptions live in `StudentData.tsx`, the student data provider.)

---

## 5. Core concepts you must understand

### a) Provider tree (`App.tsx`)
```
ThemeProvider          → light/dark
  └ ToastProvider      → useToast() pop-up notifications
     └ AuthProvider    → who is logged in, what role
        └ RouterProvider
```
Everything below `AuthProvider` can call `useAuth()`. The student area adds a `StudentDataProvider` (in `AppLayout`) that holds the student's live data + the level-up signal.

### b) Roles are detected, not stored in a column
A student's email is synthetic: `username@students.classpoint.app`. So:
- If the logged-in email ends with `@students.classpoint.app` → **student**.
- Otherwise, the client calls the `is_instructor()` SQL function (checks the `instructors` allowlist) → **instructor** or rejected.

See `resolveRole()` in `src/lib/auth.tsx`.

### c) Points are never written directly to a total
You never `UPDATE students SET lifetime_points = …`. Instead you **insert a row into `point_events`**, and a database trigger (`cp_recompute_points`) recomputes `students.lifetime_points = SUM(points)`. The total is always derived from history → no drift, deletions auto-correct.

### d) Live dashboard vs. frozen leaderboard
- The **dashboard** subscribes (Supabase Realtime) to the student's own `students` row (points) and `point_events` (feed) → instant updates.
- The **leaderboard** does NOT read live points. It reads `leaderboard_snapshot`, a table refilled by `refresh_leaderboard_snapshot()` on a `pg_cron` schedule (7:30 AM/PM PHT). The "official rank" shown on the dashboard also comes from this snapshot, so rank only moves twice a day even though points are live.

### e) RLS (Row-Level Security) is the real security boundary
The anon/auth keys are public and shipped to the browser. Security is enforced **in Postgres** by RLS policies, not in the React code:
- A student can read everyone's public student rows + the snapshot (for the leaderboard) but only their **own** `point_events`.
- A student can update only their own row, and a trigger (`cp_guard_student_update`) blocks them from changing anything except `display_name` / `avatar_url`.
- `student_secrets` (tokens, usernames) is **instructor-only**; the snapshot tables are read-only to clients (only the cron job writes them).

### f) The service role never touches the browser
Creating auth accounts requires the service-role key, which bypasses RLS. That only happens inside the **`claim-token` Edge Function** (server-side Deno), never in the client bundle.

---

## 6. Code tutorial — follow the data end to end

The fastest way to understand the app is to trace one feature from click to database and back.

### Walkthrough A: "Student opens their dashboard"
1. **Route guard** — `router.tsx` maps `/app` to `RequireRole role="student"`. `guards.tsx` checks `useAuth()`; non-students get redirected.
2. **Layout + data load** — `AppLayout.tsx` wraps the `Shell` in **`StudentDataProvider`** (`features/student/StudentData.tsx`). On mount it runs, via `api.ts`: `getMyStudent(user.id)`, `listSections()`, `getLeaderboardSnapshot()`, then `listStudentEvents(me.id)`.
3. **Realtime** — the provider opens a Supabase channel for `students` (id = me) and `point_events` (student_id = me). New awards update points/feed instantly.
4. **Render** — `Dashboard.tsx` calls `useStudentData()`, computes `getLevelProgress(me.lifetime_points)`, feeds `progressPct` into `<XpBar>`, and shows total points (live) + `#rank` (snapshot, labeled "as of 7:30").
5. **States** — loading skeleton, error-with-retry, and "no student record" all handled.

### Walkthrough B: "Instructor awards +3 to 5 students"
1. `Award.tsx` → `awardPoints({ studentIds, points: 3, category, note })` in `api.ts`.
2. `api.ts` inserts **one `point_events` row per student** in a single insert (RLS `points_write` allows it because `is_instructor()`).
3. `trg_points_recompute` recomputes each student's `lifetime_points`.
4. Each affected student who is **online** gets a realtime push → their dashboard points/feed update, and if they crossed a threshold the **level-up burst** fires.
5. The leaderboard does **not** change yet — it updates at the next 7:30 snapshot.

### Walkthrough C: "A level-up is celebrated"
1. `StudentData.tsx` tracks the last-seen level (in `localStorage`, per student).
2. On a realtime points change OR on app open, it recomputes the level; if it rose above the baseline it sets `levelUp`.
3. `AppLayout`'s `LevelUpOverlay` reads `levelUp` and renders `<LevelUpBurst>` — full-screen, gold particle burst, auto-dismiss.

> **Tip for new readers:** open `src/lib/api.ts` first (every DB call is a function there), then `src/router.tsx` (every screen). Those two files are the map.

---

## 7. The database (Supabase / Postgres)

### Tables
- **`sections`** — `id, name`. Readable by all signed-in users.
- **`students`** — roster + points. `full_name` (private), `display_name` (public, editable), `bio` + `interests` *(0009, public, editable, length-capped)*, `avatar_url`, `lifetime_points` (derived), `user_id` (links to `auth.users` once claimed). Broadly readable.
- **`student_secrets`** — `claim_token, username, claimed_at`. **Instructor-only.**
- **`point_events`** — history/feed. `points (−5…5, never 0), category (recitation/activity/penalty), note, created_at`.
- **`instructors`** — email allowlist. No client access.
- **`leaderboard_snapshot`** *(0006)* — frozen ranking: `student_id, display_name, section_id, lifetime_points, rank`. Read-only to clients.
- **`leaderboard_meta`** *(0006)* — single row holding `captured_at` (when the snapshot last ran).
- **`push_subscriptions`** *(0008)* — one row per browser/device a student enabled push on (`endpoint, p256dh, auth`). A student manages only their own; the `send-push` function reads them with the service role.

### Functions & triggers
- **`is_instructor()`** — `SECURITY DEFINER`; checks the allowlist. Used throughout RLS.
- **`cp_level(total_points)`** — mirrors `leveling.ts` (50, ×1.5 rounded).
- **`cp_generate_token()`** — 8-char uppercase hex token.
- **`cp_recompute_points()`** — trigger keeping `students.lifetime_points` in sync (`SUM(points)`, clamped at 0 so penalties can't make it negative).
- **`cp_guard_student_update()`** — trigger blocking students from editing protected columns (bypasses for instructor + service role). Students may edit `display_name`, `avatar_url`, `bio`, `interests`.
- **`public_point_events(student_id, limit)`** *(0009)* — `SECURITY DEFINER` reader returning a classmate's recent points for the profile preview (RLS otherwise restricts `point_events` reads to the owner + instructor).
- **`cp_notify_point_event()` / `refresh_leaderboard_snapshot_notify()`** *(0008/0010)* — fire the `send-push` Edge Function via `pg_net` on awards and twice-daily rank changes. The service-role bearer is read from **Supabase Vault** (`edge_service_key`); the functions URL is hardcoded. *(0010 replaces 0008's `app.settings.*` GUC approach, which the hosted `postgres` role can't set.)*
- **`create_student(section_id, full_name)`** — instructor-only RPC: insert student + token.
- **`create_students(section_id, full_names[])`** *(0007)* — instructor-only bulk RPC for Excel/CSV import; inserts many students + tokens in one call.
- **`refresh_leaderboard_snapshot()`** *(0006)* — rebuilds the snapshot + stamps `captured_at`. Run by `pg_cron`.
- **`force_leaderboard_refresh()`** *(0006)* — instructor-only RPC to settle the board early (optional; not surfaced in the UI).

### Schedule (0006)
`pg_cron` runs `refresh_leaderboard_snapshot()` at **23:30 and 11:30 UTC** = **7:30 AM and 7:30 PM Asia/Manila**. The migration also seeds an initial snapshot so the board isn't empty before the first run.

### Realtime (0004)
Realtime is enabled on `students` and `point_events` — this powers the live student dashboard.

### Storage — avatars (0007)
Migration `0007` creates a **public `avatars` Storage bucket** (5 MB cap, image MIME types only) and Storage RLS policies: everyone may read; a signed-in user may upload/replace/delete only within a folder named after their own `auth.uid()`. Uploads are pathed `…/<uid>/avatar-<ts>.<ext>`, and the public URL is saved to `students.avatar_url`. No manual dashboard step is needed — the SQL provisions the bucket.

---

## 8. Authentication & the claim flow

**Instructor login** (`InstructorSignIn.tsx` → `signInInstructor`): email + password, then `is_instructor()` is checked; non-allowlisted accounts are signed out immediately.

**Student claim** (`Claim.tsx` → `claim()` → `claim-token` Edge Function):
1. Student enters token + chosen username + PIN (≥6 chars).
2. The Edge Function (service role) verifies the token is valid + unclaimed and the username is free.
3. It creates an auth user with synthetic email `username@students.classpoint.app` and the PIN as password.
4. It links `students.user_id` + stamps `student_secrets.claimed_at`. If linking fails, it **rolls back** the orphan auth user.
5. The client auto-signs-in.

**Student login afterwards** (`SignIn.tsx`): username + PIN (mapped to the synthetic email behind the scenes).

**Forgot PIN** (`ResetPin.tsx` → `resetPin()` → `reset-pin` Edge Function): students have synthetic emails, so Supabase's email reset link can't work. Instead the instructor issues a one-time reset code from the roster (the key icon on a claimed student → `reset_student_pin` RPC, code valid 24 h). The student enters the code + a new PIN on `/reset`; the Edge Function (service role) verifies the code, calls `auth.admin.updateUserById` to set the new PIN, burns the code, and the client auto-signs-in. The student's old PIN keeps working until the code is redeemed. A self-service change for students who *still know* their PIN is not built yet (roadmap).

> ⚠️ Both the `claim-token` **and** `reset-pin` functions must have **JWT verification turned OFF** in the Supabase dashboard (callers don't have a session yet).

---

## 9. Setup from scratch

### Prerequisites
- Node.js + npm
- A Supabase project (project ref `cxfxstazlwjijozkglgx`)

### Steps
1. **Install**
   ```bash
   npm install
   ```
2. **Environment** — copy `.env.example` to `.env`:
   ```
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-publishable-anon-key>
   VITE_VAPID_PUBLIC_KEY=<your-vapid-public-key>   # Web Push (optional)
   ```
3. **Database** — in the Supabase **SQL Editor**, run the migrations **in order**, `0001` → `0010`. Notes:
   - `0006` — enable the **pg_cron** extension first (Database → Extensions) if `CREATE EXTENSION` is blocked.
   - `0007` — provisions the avatars Storage bucket, enables minus points, adds the bulk-import RPC.
   - `0008` — push plumbing (`pg_net`, `push_subscriptions`, triggers). Ignore its `app.settings.*` header note — the hosted `postgres` role can't set those; `0010` supersedes it with Vault.
   - `0009` — adds `bio`/`interests` + `public_point_events`. **Apply before deploying the matching frontend** (the student load reads the new columns).
   - `0010` — run **after** storing the Vault secret in step 5. All migrations are idempotent / safe to re-run.
4. **Edge Functions** — deploy the Deno functions (`npx supabase functions deploy <name>`):
   - `claim-token` — **disable JWT verification** (callers have no account yet).
   - `reset-pin` — **disable JWT verification** (a student resetting a forgotten PIN has no session).
   - `send-push` — leave JWT verification **on** (the DB calls it with the service role).
5. **Push notifications (optional)** — generate keys with `npx web-push generate-vapid-keys`, put the **public** key in `.env` / Vercel as `VITE_VAPID_PUBLIC_KEY`, and set the function secrets `VAPID_PUBLIC_KEY` (same value), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Store the **service-role key** in Vault as `edge_service_key` (`select vault.create_secret('<key>','edge_service_key','send-push bearer');`), then run migration `0010`. Push only reaches a device once the PWA is **installed** and the student enables it in Profile (iOS 16.4+).
6. **Instructor account** — create your instructor auth user in **Authentication → Users → Add user** (set a password). The email must match the one in `instructors` (`koby.macale@dct.edu.ph`).
7. **Run**
   ```bash
   npm run dev      # → http://localhost:5173
   ```

> **Why "Add user", not raw SQL?** Inserting into `auth.users` by hand leaves GoTrue's token columns `NULL`, which causes *"Database error loading user"* on login/delete. Repair with:
> ```sql
> update auth.users set
>   confirmation_token = coalesce(confirmation_token,''),
>   recovery_token = coalesce(recovery_token,''),
>   email_change_token_new = coalesce(email_change_token_new,''),
>   email_change = coalesce(email_change,''),
>   email_change_token_current = coalesce(email_change_token_current,''),
>   phone_change = coalesce(phone_change,''),
>   phone_change_token = coalesce(phone_change_token,''),
>   reauthentication_token = coalesce(reauthentication_token,'');
> ```

> **Test the leaderboard without waiting for 7:30:** run `select public.refresh_leaderboard_snapshot();` in the SQL Editor to settle the board on demand.

---

## 10. The build journey — phase by phase

| Phase | What was built | Status |
|-------|----------------|--------|
| **0 — Scaffold** | Vite + React + TS, Tailwind v4 tokens, Framer Motion, light/dark, PWA manifest/icons, routing + app shell. | ✅ Done |
| **1 — Database** | Migrations: schema, functions/triggers, RLS, realtime, seed. | ✅ Done |
| **2 — Auth** | Instructor login; student claim → username + PIN → login; `claim-token` Edge Function; route guards. | ✅ Done |
| **3 — Instructor tools** | Roster (add/remove, tokens, copy-all), Award (multi-select, category, +1–5, note), instructor leaderboard. | ✅ Done |
| **4 — Student dashboard** | Live data provider, dashboard (level/XP/points/rank/feed), leaderboard, profile edit. Mock data removed. | ✅ Done |
| **Responsive pass** | Shared `Shell` — sidebar (desktop) / bottom tabs (mobile). | ✅ Done |
| **5 — Leaderboard + polish** | Realtime dashboard; frozen twice-daily leaderboard snapshot (`pg_cron`, 7:30 AM/PM PHT) with countdown; global Top 10 + pinned self; animated reorder; full-screen level-up burst (live + on next open). | ✅ Done |
| **6 — PWA polish & QA** | Custom install banner (+ iOS hint), "update available" prompt, offline indicator, route-level code-splitting (initial bundle 668 → 496 KB), empty/error states across screens. | ✅ Done |
| **7 — Profiles, import & penalties** | Student avatar upload (public `avatars` bucket, 5 MB cap) shown everywhere; Excel/CSV roster import + export (`xlsx`, lazy-loaded chunk); editable sections (create/rename/delete-when-empty); minus points / penalties with totals clamped at 0; instructor activity log + undo; roster search. | ✅ Done |
| **8 — Notifications** | Web Push (VAPID `send-push` Edge Function + `pg_net` triggers; config via Vault), in-app sound + vibration toggles, and a "What's new" release-notes screen (`changelog.ts`). | ✅ Done |
| **9 — Classmate profiles & mobile polish** | Tap-a-classmate profile preview (bio + interests + recent points via `public_point_events`); winners' podium on the student leaderboard (tap to preview); swipe-to-dismiss bottom sheets with viewport-aware scrolling. | ✅ Done |

### Design system (`src/styles/index.css`)
Tailwind v4 `@theme` tokens — red brand scale (`brand-50…950`), gold/amber XP scale (`gold-*`), and semantic CSS vars (`--canvas`, `--card`, `--ink`, `--muted`, `--line`, `--ring`) swapped by `.dark`. Fonts: **Inter** (body), **Space Grotesk** (display). The XP bar shimmer is a **CSS `@keyframes`** (not a JS animation) on purpose — a JS infinite loop blocks tooling.

---

## 11. Common tasks & troubleshooting

**Add a query** → add a function in `src/lib/api.ts`, type it in `src/lib/types.ts`, call it from a component/provider. Never call `supabase.from(...)` in a component.

**Add a screen** → create it under `src/features/...`, register the route in `src/router.tsx`, add a nav item in `AppLayout.tsx` or `InstructorLayout.tsx`.

**Change the leveling curve** → edit `BASE_REQUIREMENT` / `GROWTH` in `src/lib/leveling.ts` **and** `cp_level()` in `0002`. They must match.

**Change the snapshot times** → edit the two `cron.schedule` cron strings in `0006` (remember pg_cron is UTC) **and** `SNAPSHOT_HOURS` in `src/lib/time.ts` (local clock, for the countdown).

| Symptom | Likely cause / fix |
|---------|--------------------|
| Console: "Supabase env not set" | `.env` missing → copy from `.env.example`. |
| Student can't claim | `claim-token` not deployed, or JWT verification still ON. |
| Instructor logs in then bounced out | Email not in `instructors`, or `is_instructor()` false. |
| "Database error loading user" | Auth user made via raw SQL with NULL token columns — run the repair UPDATE in §9. |
| Leaderboard empty | No snapshot yet → run `select public.refresh_leaderboard_snapshot();` or wait for 7:30. |
| Dashboard updates but leaderboard doesn't | Expected — the board only settles at 7:30 AM/PM. |
| Points awarded but total unchanged | `trg_points_recompute` not installed (re-run `0002`). |
| `cron`/`pg_cron` errors on 0006 | Enable the pg_cron extension in Database → Extensions, then re-run `0006`. |

---

## 12. Roadmap (remaining work)

Phases 0–9 are complete. Possible next steps:

- **End-to-end push test** — on a physical phone with the installed PWA, enable push in Profile, fully close the app, award a point, and confirm the lock-screen notification arrives (requires `send-push` deployed, VAPID keys matched, and the Vault secret + `0010` applied).
- **End-to-end walkthrough** — run the full instructor→student flow once against live Supabase (import a roster, award + penalize, upload an avatar, watch the dashboard update live, settle the board, confirm the level-up burst, undo an award).
- **Future leaderboard views** (scaffolded, not yet surfaced) — own-section board, a chosen-section board, and a Top-N toggle. The snapshot already carries every student + section, so these are filters over existing data, no new queries needed.
- **Avatar cleanup** — replacing a picture leaves the old object in the bucket. A periodic job (or an Edge Function on update) could prune stale `avatars/<uid>/…` files.
- **Further bundle trimming** — the initial chunk still includes `@supabase/supabase-js`; defer or slim if first-load size matters on slow connections. (`xlsx` is already split into its own on-demand chunk.)

---

*ClassPoint · early build. Instructor: `koby.macale@dct.edu.ph` · Sections are editable (seeded 2A–2E).*
