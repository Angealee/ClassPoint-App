# ClassPoint — Complete System Guide
> A full breakdown of how this app was built, how every layer works,
> and what every important piece of code does. Written so you can read
> top-to-bottom and understand the entire system from scratch.

---

## Table of Contents
1. [What the app does](#1-what-the-app-does)
2. [Tech stack and why](#2-tech-stack-and-why)
3. [Project file structure](#3-project-file-structure)
4. [Database design](#4-database-design)
5. [Security model](#5-security-model)
6. [Authentication flows](#6-authentication-flows)
7. [The claim-token Edge Function](#7-the-claim-token-edge-function)
8. [Frontend architecture](#8-frontend-architecture)
9. [Leveling math](#9-leveling-math)
10. [Realtime and live updates](#10-realtime-and-live-updates)
11. [Leaderboard and the snapshot system](#11-leaderboard-and-the-snapshot-system)
12. [PWA features](#12-pwa-features)
13. [How data flows end-to-end](#13-how-data-flows-end-to-end)
14. [Deployment](#14-deployment)
15. [Key patterns to understand](#15-key-patterns-to-understand)

---

## 1. What the app does

ClassPoint is a **Progressive Web App (PWA)** for IT college students at DCT-CCS.

**The problem it solves:**
The instructor wants to award class participation points in real time. Students want to see their score, level up, and compete on a leaderboard — like an RPG.

**Two user types:**

| Role | What they do |
|------|-------------|
| **Instructor** (`koby.macale@dct.edu.ph`) | Manages roster, awards 1–5 points per student per event, views the leaderboard |
| **Student** | Claims their account once using a token, then logs in to see their dashboard: level, XP bar, point history, leaderboard rank |

**Core rules:**
- The instructor awards 1–5 points per event. Points are labeled as "recitation" or "activity."
- Points are **also EXP**. Same number. They accumulate forever (never decrease).
- Level is computed from cumulative EXP using a ladder formula (explained in section 9).
- A cross-section **leaderboard** ranks all students by lifetime points, refreshed twice daily.

---

## 2. Tech stack and why

```
Frontend        Vite + React 19 + TypeScript
Styling         Tailwind CSS v4 (utility classes)
Animation       Framer Motion
Backend         Supabase (hosted Postgres + Auth + Realtime + Edge Functions)
Database lang   PostgreSQL with Row-Level Security (RLS)
Serverless fn   Deno (Supabase Edge Functions runtime)
Scheduling      pg_cron (Postgres extension, runs inside the DB)
PWA             vite-plugin-pwa (service worker, manifest)
Hosting         Vercel (frontend) + Supabase (backend, always-on)
```

**Why Supabase?**
- Gives you a real Postgres database with a REST API and real-time subscriptions built in.
- Handles authentication (users, sessions, JWTs) so you don't build it yourself.
- Edge Functions run code server-side (like AWS Lambda) — needed for the account-creation flow.
- Free tier is sufficient for a class of ~100–200 students.

**Why Vite?**
- Extremely fast development server with hot-module replacement.
- Builds a small, optimized bundle for production.

**Why TypeScript?**
- Catches mistakes at compile time rather than at runtime in class.
- Makes the data shapes (`SectionStudent`, `PointEvent`, etc.) explicit and self-documenting.

---

## 3. Project file structure

```
ClassPoint App/
│
├── src/                          ← All frontend React code
│   ├── main.tsx                  ← App entry point (mounts React)
│   ├── App.tsx                   ← Root: wraps everything in providers
│   ├── router.tsx                ← All routes (pages) and their guards
│   │
│   ├── lib/                      ← Shared logic (not UI)
│   │   ├── supabase.ts           ← Creates the Supabase client (1 instance)
│   │   ├── auth.tsx              ← Auth state + signIn/signOut/claim functions
│   │   ├── api.ts                ← Every database query the frontend makes
│   │   ├── types.ts              ← TypeScript types for all data shapes
│   │   ├── leveling.ts           ← Level math (points → level + XP bar)
│   │   ├── theme.tsx             ← Light/dark toggle
│   │   ├── time.ts               ← Date formatting helpers
│   │   └── cn.ts                 ← Tailwind class merging utility
│   │
│   ├── features/                 ← Screen-level components
│   │   ├── Landing.tsx           ← Home page (before login)
│   │   ├── auth/
│   │   │   ├── AuthShell.tsx     ← Shared card wrapper for auth screens
│   │   │   ├── SignIn.tsx        ← Student login screen
│   │   │   ├── InstructorSignIn.tsx
│   │   │   ├── Claim.tsx         ← First-time student account setup
│   │   │   └── guards.tsx        ← Route protection (RequireRole, RedirectIfAuthed)
│   │   ├── student/
│   │   │   ├── StudentData.tsx   ← Context/provider: loads + streams all student data
│   │   │   ├── Dashboard.tsx     ← XP bar, level, point feed
│   │   │   ├── Leaderboard.tsx   ← Frozen top-10 + self row
│   │   │   └── Profile.tsx       ← Display name editor
│   │   └── instructor/
│   │       ├── InstructorLayout.tsx ← Nav sidebar/header for instructor
│   │       ├── Students.tsx      ← Roster: add students, copy tokens
│   │       ├── Award.tsx         ← Award points form
│   │       └── InstructorLeaderboard.tsx
│   │
│   └── components/               ← Reusable UI pieces
│       ├── ui/                   ← Buttons, inputs, cards, XP bar, icons, toasts…
│       ├── layout/               ← App shells, splash screen
│       └── pwa/                  ← Install prompt, update banner, offline banner
│
├── supabase/
│   ├── migrations/               ← SQL files; run in order in SQL Editor
│   │   ├── 0001_schema.sql       ← Create all tables
│   │   ├── 0002_functions_triggers.sql ← PG functions + triggers
│   │   ├── 0003_security.sql     ← Row-Level Security policies
│   │   ├── 0004_realtime.sql     ← Enable Realtime on tables
│   │   ├── 0005_seed.sql         ← Insert instructor email + sections
│   │   └── 0006_leaderboard_snapshot.sql ← Snapshot tables + pg_cron
│   └── functions/
│       └── claim-token/
│           └── index.ts          ← Deno function: student account creation
│
├── public/                       ← PWA icons, manifest
├── vercel.json                   ← Vercel deployment config (SPA rewrite)
├── vite.config.ts                ← Build config + PWA plugin
└── .env                          ← VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
```

---

## 4. Database design

The database has **6 tables**. Here they are in dependency order:

### `sections`
```sql
id          uuid  PRIMARY KEY
name        text  UNIQUE  -- "2A", "2B", "2C", "2D", "2E"
created_at  timestamptz
```
Simple lookup table. Every student belongs to exactly one section.

---

### `students`
```sql
id              uuid  PRIMARY KEY
section_id      uuid  → sections.id
full_name       text  -- set by instructor; never changes
display_name    text  -- shown on leaderboard; student can edit this
lifetime_points integer  DEFAULT 0  -- auto-maintained by a trigger
user_id         uuid  → auth.users.id  -- NULL until the student claims their account
created_at      timestamptz
```
This is the central table. A row exists here **before** the student creates an account.
The instructor creates it. `user_id` starts as NULL and gets filled in after the student claims.

---

### `student_secrets`
```sql
student_id   uuid  PRIMARY KEY → students.id
claim_token  text  UNIQUE  -- 8-char hex code, e.g. "9F3A1C7B"
username     text  -- chosen at claim time; used to build the login email
claimed_at   timestamptz  -- NULL = unclaimed; filled in after claim
```
**Students can never see this table.** Only the instructor and the server-side Edge Function can read it.
The `claim_token` is what the instructor hands to the student on paper or verbally.

---

### `point_events`
```sql
id          uuid  PRIMARY KEY
student_id  uuid  → students.id
points      integer  CHECK (1 <= points <= 5)
category    text  CHECK (category IN ('recitation', 'activity'))
note        text  -- optional comment from instructor
created_at  timestamptz
```
Every time the instructor awards points, a row is inserted here.
A **trigger** fires on every insert/delete and recomputes `students.lifetime_points` automatically.

---

### `leaderboard_snapshot`
```sql
student_id      uuid PRIMARY KEY
display_name    text
section_id      uuid
lifetime_points integer
rank            integer  -- computed at snapshot time
```
A frozen copy of rankings. Refreshed twice daily by pg_cron. Students read from this — not live points — so the leaderboard rank only "settles" at 7:30 AM and 7:30 PM.

---

### `leaderboard_meta`
```sql
id           boolean  PRIMARY KEY DEFAULT true  -- only 1 row ever
captured_at  timestamptz  -- when the current snapshot was taken
```
Single-row table. Stores the timestamp of the last snapshot, which the app displays as "Updated 7:30 AM · next in 5h 12m".

---

### `instructors`
```sql
email text PRIMARY KEY
```
Simple allowlist. If your email is here, you are the instructor. There's only one row: `koby.macale@dct.edu.ph`.

---

## 5. Security model

This is the most important thing to understand. The whole system is protected by three layers:

### Layer 1 — Row-Level Security (RLS)

Every table has RLS enabled. This means **the database itself enforces who can see or modify each row**, regardless of what code calls it.

Think of RLS as filters applied to every query automatically. Even if a student somehow ran a direct SQL query, they'd only get the rows they're allowed to see.

**Key policies:**

| Table | Who can SELECT | Who can INSERT/UPDATE/DELETE |
|-------|---------------|------------------------------|
| `sections` | Any signed-in user | Instructor only |
| `students` | Any signed-in user (for leaderboard) | INSERT: instructor; UPDATE: instructor OR the row's own student; DELETE: instructor |
| `student_secrets` | Instructor only | Instructor only (service role for Edge Fn) |
| `point_events` | Instructor OR the student it belongs to | Instructor only |
| `leaderboard_snapshot` | Any signed-in user | Nobody directly (pg_cron uses service role) |

### Layer 2 — The `is_instructor()` function

```sql
create or replace function public.is_instructor()
returns boolean
language sql
stable
security definer  -- runs as postgres, not the calling user
as $$
  select exists (
    select 1
    from public.instructors i
    where lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
```

`auth.jwt()` reads the JWT (login token) of whoever is currently making the request.
`->> 'email'` extracts the email claim from it.
If that email is in the `instructors` table → returns `true`.

This function is used **inside every RLS policy** that needs to check instructor access.

`SECURITY DEFINER` means it runs with the privileges of the function owner (postgres role), not the calling user — so it can read the `instructors` table even though RLS would otherwise block the student from reading it.

### Layer 3 — The column-level trigger

Even though RLS lets a student `UPDATE` their own `students` row (needed so they can change their display name), the trigger prevents them from touching protected columns:

```sql
-- src: supabase/migrations/0002_functions_triggers.sql
create or replace function public.cp_guard_student_update()
returns trigger language plpgsql security definer as $$
begin
  -- Instructor and service role (Edge Function) bypass entirely
  if public.is_instructor() or auth.uid() is null then
    return NEW;
  end if;
  -- For a regular student: block changes to protected columns
  if NEW.lifetime_points is distinct from OLD.lifetime_points
     or NEW.section_id   is distinct from OLD.section_id
     -- ... (other protected columns)
  then
    raise exception 'You can only update your display name and avatar.';
  end if;
  return NEW;
end;
$$;
```

So even if a clever student ran `UPDATE students SET lifetime_points = 9999 WHERE id = '...'`, Postgres would throw an error and reject it.

### Why `auth.uid() IS NULL` means service role

When the Edge Function calls Supabase using the **service role key**, there is no end-user session — the request is from the server. Supabase sets `auth.uid()` to NULL in this case. The trigger checks for this to let the Edge Function link `user_id` to a student row during the claim process.

---

## 6. Authentication flows

### Instructor sign-in

```
1. Instructor enters email + password on /instructor/signin
2. supabase.auth.signInWithPassword({ email, password })
3. Supabase Auth checks credentials → returns a JWT session
4. App calls supabase.rpc('is_instructor') to verify the email is in the allowlist
5. If not in allowlist → sign out immediately, show error
6. If yes → store session, redirect to /teach
```

The instructor account is a regular Supabase Auth user. Their email is also in the `instructors` table — that double-presence is the verification. Just because someone has an Auth account does not make them the instructor.

### Student claim (first-time, one-time)

```
1. Student goes to /claim
2. Enters: token (from instructor), username (chosen by student), PIN (chosen by student)
3. Frontend calls: supabase.functions.invoke('claim-token', { body: {...} })
4. Edge Function runs on the server with service role access (see section 7)
5. On success: Edge Function returns { ok: true, email, username }
6. Frontend auto-signs in: supabase.auth.signInWithPassword({ email, password: pin })
7. Student is redirected to /app
```

After this, the token is marked as `claimed_at` and can never be reused.

### Student sign-in (subsequent)

```
1. Student enters username + PIN on /signin
2. Frontend builds a synthetic email: username@students.classpoint.app
3. supabase.auth.signInWithPassword({ email: synthetic, password: pin })
4. Supabase Auth verifies → session returned
5. Role detection: email ends with @students.classpoint.app → role = 'student'
6. Redirect to /app
```

### Role detection in code

```tsx
// src/lib/auth.tsx
function isStudentEmail(email: string | undefined): boolean {
  return !!email && email.toLowerCase().endsWith('@students.classpoint.app')
}

// In resolveRole():
if (isStudentEmail(next.user.email)) {
  setRole('student')
  return
}
// If not student email, check if instructor:
const { data } = await supabase.rpc('is_instructor')
setRole(data === true ? 'instructor' : null)
```

### Route guards

```tsx
// src/features/auth/guards.tsx

// Blocks unauthenticated users and wrong-role users from protected routes
export function RequireRole({ role }: { role: Role }) {
  const { loading, session, role: current } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/signin" replace />
  if (current !== role) return <Navigate to={homeFor(current)} replace />
  return <Outlet />  // render the protected children
}

// Redirects already-logged-in users away from the login pages
export function RedirectIfAuthed() {
  const { loading, role } = useAuth()
  if (loading) return <Splash />
  if (role) return <Navigate to={homeFor(role)} replace />
  return <Outlet />  // render the public page
}
```

`<Outlet />` is a React Router concept. It means "render whatever child route matched here."

The back-button fix: The landing page `/` is nested **inside** `<RedirectIfAuthed>`. So if you're logged in and press Back, the guard immediately bounces you to `/app` instead of showing the landing page.

---

## 7. The claim-token Edge Function

**File:** `supabase/functions/claim-token/index.ts`

This is the most critical piece of server-side code. Here's why it exists:

**The problem:** To create a Supabase Auth account, you need the **service role key** — a secret key that bypasses all RLS. You can **never** put the service role key in the frontend (it would be visible to anyone). So account creation must happen on the server.

**The solution:** A Supabase Edge Function — server-side code that Supabase runs in Deno (a JavaScript/TypeScript runtime). It receives the student's claim request, uses the service role key (available as an environment variable automatically), and does everything needed.

### Why JWT verification must be OFF

When a student first arrives at `/claim`, they have no account yet — they are **unauthenticated**. Supabase Edge Functions can optionally verify that the request comes with a valid JWT (login token). But an unauthenticated student has no JWT. So if JWT verification is ON, Supabase rejects the request before the function code even runs — and the student can never claim. Turn it OFF.

### Step-by-step what the function does

```ts
Deno.serve(async (req) => {
  // Step 0: Handle browser CORS preflight (OPTIONS request)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Step 1: Parse the request body
  const { token, username, pin, display_name } = await req.json()

  // Step 2: Create an admin client using the service role key
  // (Supabase auto-injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Step 3: Look up the token in student_secrets
  const { data: secret } = await admin
    .from('student_secrets')
    .select('student_id, claimed_at')
    .eq('claim_token', token)
    .maybeSingle()

  if (!secret) return json({ ok: false, error: 'That token is not valid.' })
  if (secret.claimed_at) return json({ ok: false, error: 'This token has already been used.' })

  // Step 4: Check if username is taken
  const { data: taken } = await admin
    .from('student_secrets')
    .select('student_id')
    .eq('username', username)
    .maybeSingle()
  if (taken) return json({ ok: false, error: 'That username is taken.' })

  // Step 5: Create the Supabase Auth account
  // Email is synthetic: username@students.classpoint.app
  const email = `${username}@students.classpoint.app`
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,  // skip email verification step
    user_metadata: { role: 'student', student_id: secret.student_id, username },
  })

  // Step 6: Link the auth account to the student's roster row
  await admin
    .from('students')
    .update({ user_id: created.user.id })
    .eq('id', secret.student_id)

  // Step 7: Mark the token as claimed so it can't be reused
  await admin
    .from('student_secrets')
    .update({ username, claimed_at: new Date().toISOString() })
    .eq('student_id', secret.student_id)

  // Step 8: If linking failed, delete the orphan auth account (cleanup)
  // (see actual code for this rollback logic)

  return json({ ok: true, email, username })
})
```

After returning `{ ok: true }`, the **frontend** does the sign-in using the normal password flow — the Edge Function itself does not issue a session.

---

## 8. Frontend architecture

### The provider tree

```tsx
// src/App.tsx
<ThemeProvider>          ← light/dark theme (CSS class on <html>)
  <ToastProvider>        ← global toast notifications
    <AuthProvider>       ← auth state (session, role, sign in/out functions)
      <RouterProvider /> ← all pages/routes
      <OfflineBanner />  ← "you're offline" ribbon
      <UpdatePrompt />   ← "new version available" banner
      <InstallPrompt />  ← "add to home screen" prompt
    </AuthProvider>
  </ToastProvider>
</ThemeProvider>
```

**Providers** are a React pattern for sharing data across the whole app without passing props down through every component. You `useContext()` to read from them anywhere.

### Routing

```tsx
// src/router.tsx
createBrowserRouter([
  {
    element: <RedirectIfAuthed />,     // bounces logged-in users
    children: [
      { path: '/',                element: <Landing /> },
      { path: '/signin',          element: <SignIn /> },
      { path: '/claim',           element: <Claim /> },
      { path: '/instructor/signin', element: <InstructorSignIn /> },
    ],
  },
  {
    path: '/app',
    element: <RequireRole role="student" />,  // blocks non-students
    children: [
      { element: <AppLayout />,
        children: [
          { index: true,        element: <Dashboard /> },
          { path: 'leaderboard', element: <Leaderboard /> },
          { path: 'profile',    element: <Profile /> },
        ]
      }
    ],
  },
  {
    path: '/teach',
    element: <RequireRole role="instructor" />,  // blocks non-instructors
    children: [
      { element: <InstructorLayout />,
        children: [
          { index: true,         element: <Students /> },
          { path: 'award',       element: <Award /> },
          { path: 'leaderboard', element: <InstructorLeaderboard /> },
        ]
      }
    ],
  },
])
```

**Code splitting:** Every `lazy(() => import(...))` means that page's code is only downloaded when the user navigates to it. The initial app bundle stays small (~500 KB instead of loading everything upfront).

### The StudentData context

This is the student-side data hub (`src/features/student/StudentData.tsx`). When a student logs in, this provider:

1. Loads their own student row (`getMyStudent`)
2. Loads all sections (to resolve section names)
3. Loads the frozen leaderboard snapshot
4. Loads their recent point events (feed)
5. Opens two Supabase Realtime channels (live updates)
6. Detects level-ups and triggers the celebration burst

Everything is exposed via `useStudentData()` hook so any child component can access it without prop drilling.

---

## 9. Leveling math

**File:** `src/lib/leveling.ts` (mirrored in SQL as `cp_level()`)

### The formula

- Level 1 → 2 requires **50 EXP**
- Each subsequent level requires **1.5× the previous**, rounded to the nearest integer

```
Level 1 → 2:  50 EXP
Level 2 → 3:  75 EXP   (50 × 1.5)
Level 3 → 4: 113 EXP   (75 × 1.5, rounded)
Level 4 → 5: 169 EXP   (113 × 1.5, rounded)
Level 5 → 6: 253 EXP   ...
```

There is **no level cap**. The ladder is infinite.

### How it's computed

```ts
export function getLevelProgress(totalExp: number): LevelProgress {
  let level = 1
  let remaining = totalExp  // start with everything

  // Keep subtracting the requirement for each level until you can't anymore
  while (remaining >= requirementForLevel(level)) {
    remaining -= requirementForLevel(level)
    level++
  }

  // Whatever is left is your progress in the current level
  const expForLevel = requirementForLevel(level)
  return {
    level,
    expIntoLevel: remaining,     // how far into current level
    expForLevel,                 // total needed for this level
    progressPct: (remaining / expForLevel) * 100,  // XP bar fill percentage
  }
}
```

**Example:** A student with 140 points:
- Subtract 50 (clear level 1) → 90 remaining, now level 2
- Subtract 75 (clear level 2) → 15 remaining, now level 3
- 15 < 113 (requirement for level 3) → stop
- Result: Level 3, 15/113 EXP into level (13.3% XP bar filled)

### Why it's mirrored in SQL

The `cp_level()` Postgres function does the **identical** calculation. This way, if the backend ever needs to know a student's level (e.g., for a future badge system), it uses the same formula the frontend uses. They will never disagree.

---

## 10. Realtime and live updates

Supabase Realtime lets the server push database changes to the browser instantly, without the browser polling (asking repeatedly "any updates?").

### How it works

Supabase uses a WebSocket connection. When a row changes in Postgres, Supabase pushes a message to all subscribers.

### Student dashboard subscription

```ts
// src/features/student/StudentData.tsx
const channel = supabase
  .channel(`student-self-${me.id}`)
  // Listen for changes to THIS student's row in the students table
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'students', filter: `id=eq.${me.id}` },
    (payload) => {
      // payload.new contains the updated row
      setMe(prev => ({ ...prev, ...payload.new }))
      // Check if the new points crossed a level threshold
      considerLevelUp(me.id, payload.new.lifetime_points)
    }
  )
  // Listen for new point events awarded to THIS student
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'point_events', filter: `student_id=eq.${me.id}` },
    (payload) => {
      // Add the new event to the top of the feed
      setEvents(prev => [payload.new, ...prev])
    }
  )
  .subscribe()
```

**The flow when the instructor awards points:**
1. Instructor submits the award form
2. `supabase.from('point_events').insert(...)` runs
3. Postgres trigger `trg_points_recompute` fires → updates `students.lifetime_points`
4. Supabase Realtime detects the `point_events INSERT` and the `students UPDATE`
5. Pushes both to the student's WebSocket
6. Student's dashboard updates instantly — no page refresh needed

---

## 11. Leaderboard and the snapshot system

### The design decision

**Why not just show live rankings?** Because live rankings would flip and reorder every time any student gets a point — constantly jumping around. Instead, rankings "settle" twice a day, giving students stable competition windows.

### How it works

**Live:** `students.lifetime_points` is always accurate (updated by trigger in real time).

**Snapshot:** `leaderboard_snapshot` is a frozen copy taken at 7:30 AM and 7:30 PM Philippine Time.

### pg_cron — the scheduler

`pg_cron` is a Postgres extension that runs SQL on a schedule (like a cron job, but inside the database itself).

```sql
-- 7:30 AM Manila = 23:30 UTC (previous day in UTC)
select cron.schedule(
  'classpoint-leaderboard-am',   -- job name (unique, upserts if re-run)
  '30 23 * * *',                  -- cron expression: minute hour * * *
  $$select public.refresh_leaderboard_snapshot();$$
);

-- 7:30 PM Manila = 11:30 UTC
select cron.schedule(
  'classpoint-leaderboard-pm',
  '30 11 * * *',
  $$select public.refresh_leaderboard_snapshot();$$
);
```

### The refresh function

```sql
create or replace function public.refresh_leaderboard_snapshot()
returns void language plpgsql as $$
begin
  -- Wipe the old snapshot
  delete from public.leaderboard_snapshot;

  -- Re-rank everyone by current lifetime_points
  -- row_number() OVER (ORDER BY ...) assigns 1, 2, 3... based on ranking
  insert into public.leaderboard_snapshot
    (student_id, display_name, section_id, lifetime_points, rank)
  select
    s.id,
    s.display_name,
    s.section_id,
    s.lifetime_points,
    row_number() over (order by s.lifetime_points desc, s.display_name asc)
  from public.students s;

  -- Update the single-row metadata so the UI knows when it was taken
  insert into public.leaderboard_meta (id, captured_at)
       values (true, now())
  on conflict (id) do update set captured_at = excluded.captured_at;
end;
$$;
```

### What the student sees

- **Dashboard:** live points (updates instantly), but snapshot **rank** (labeled "as of 7:30 AM")
- **Leaderboard:** top 10 from the snapshot + if the student is outside top 10, their own row pinned at the bottom

---

## 12. PWA features

A **Progressive Web App** is a website that can be installed like a native app and works offline.

### How installation works

1. The browser detects that the site meets PWA criteria (HTTPS, manifest, service worker)
2. It fires a `beforeinstallprompt` event
3. The app captures that event and shows a custom "Add to home screen" button
4. On iOS Safari, there's no install event — the app instead shows "Tap Share → Add to Home Screen" instructions

```tsx
// src/components/pwa/InstallPrompt.tsx
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()     // stop the browser's default prompt
  setPrompt(e)           // save it so we can trigger it on button click
})
```

### Service worker and offline support

`vite-plugin-pwa` generates a service worker automatically during `npm run build`.

The service worker:
- Caches the app shell (HTML, JS, CSS) so the app loads even with no internet
- On next visit with a new version: shows an "Update available" banner

```tsx
// src/components/pwa/UpdatePrompt.tsx
const { needRefresh, updateServiceWorker } = useRegisterSW()
// needRefresh = true when a new service worker is waiting
// updateServiceWorker() activates it (reloads the page with new code)
```

### Offline banner

```tsx
// src/components/pwa/OfflineBanner.tsx
window.addEventListener('online', () => setOnline(true))
window.addEventListener('offline', () => setOnline(false))
// Shows an amber ribbon at top when offline
```

---

## 13. How data flows end-to-end

### Scenario: Instructor awards 3 points to a student

```
[Instructor clicks "Award" button]
         ↓
[Award.tsx calls awardPoints({ studentIds: [...], points: 3, category: 'recitation' })]
         ↓
[api.ts: supabase.from('point_events').insert([{ student_id, points: 3, ... }])]
         ↓
[Postgres: INSERT INTO point_events ...]
         ↓
[Postgres trigger: trg_points_recompute fires]
         ↓
[cp_recompute_points(): UPDATE students SET lifetime_points = SUM(points) WHERE id = ...]
         ↓
[Supabase Realtime: detects UPDATE on students table]
         ↓
[WebSocket push to the student's browser]
         ↓
[StudentData.tsx: .on('postgres_changes', ...) callback fires]
         ↓
[React state updated: setMe({ ...me, lifetime_points: newTotal })]
         ↓
[Dashboard re-renders: XP bar animates, point feed updates]
         ↓ (if points crossed a level threshold)
[LevelUpBurst.tsx: full-screen gold celebration fires]
```

### Scenario: Student claims their account

```
[Student enters token + username + PIN on /claim]
         ↓
[Claim.tsx validates fields client-side first]
         ↓
[auth.tsx: supabase.functions.invoke('claim-token', { body: {...} })]
         ↓
[HTTP POST to https://...supabase.co/functions/v1/claim-token]
         ↓
[Deno Edge Function runs on Supabase servers]
  → Verifies token exists and is unclaimed
  → Checks username availability
  → Creates auth.users row (admin API, service role)
  → Links students.user_id = new auth user id
  → Marks student_secrets.claimed_at = now()
  → Returns { ok: true, email, username }
         ↓
[auth.tsx: signInStudent(username, pin)]
  → supabase.auth.signInWithPassword({ email: username@students.classpoint.app, password: pin })
  → Returns session JWT
         ↓
[AuthProvider: session stored, role = 'student']
         ↓
[Router: navigate('/app', { replace: true })]
         ↓
[StudentData provider loads: getMyStudent, listSections, getLeaderboardSnapshot]
         ↓
[Dashboard renders with student's data]
```

---

## 14. Deployment

### Frontend — Vercel

Vercel hosts the built React app as static files on a CDN.

**`vercel.json`** (SPA rewrite):
```json
{
  "rewrites": [
    { "source": "/((?!assets/|.*\\..*).*)", "destination": "/index.html" }
  ]
}
```

Without this, navigating directly to `/app/leaderboard` would give a 404 because Vercel looks for an actual file at that path. The rewrite sends all non-file paths to `index.html`, letting React Router handle routing client-side.

**Environment variables on Vercel:**
```
VITE_SUPABASE_URL=https://cxfxstazlwjijozkglgx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

These are embedded into the JS bundle at build time (they're public — the anon key is safe to expose; RLS protects the data).

**Build settings on Vercel:**
- Framework: Vite
- Build command: `npm run build` (default)
- Output directory: `dist` (default for Vite)

### Backend — Supabase (always on)

Supabase runs 24/7 on their servers. You don't deploy it — you just configure it:
- Tables via SQL migrations (copy-paste into SQL Editor)
- Edge Functions via the Edge Functions editor in the dashboard
- pg_cron jobs are part of migration 0006 (they're set up in the database)

---

## 15. Key patterns to understand

### Pattern 1 — The `supabase.ts` singleton

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
```

One instance of the Supabase client, shared everywhere. `import.meta.env.VITE_*` is Vite's way of reading environment variables at build time.

### Pattern 2 — The anon key vs. service role key

| Key | Lives where | Can do |
|-----|-------------|--------|
| `anon key` | Frontend `.env`, Vercel env vars | Query the database — but RLS limits what it sees |
| `service role key` | Only on the server (Edge Function env) | Bypass RLS entirely — unlimited power |

**Never put the service role key in the frontend.** Anyone who opens DevTools would see it.

### Pattern 3 — TypeScript types as documentation

```ts
// src/lib/types.ts
export interface SectionStudent {
  id: string
  section_id: string
  full_name: string       // set by instructor; never changes
  display_name: string    // shown publicly; student-editable
  lifetime_points: number
  user_id: string | null  // null = not yet claimed
  claim_token: string     // only visible to instructor
  username: string | null // null = not yet claimed
  claimed_at: string | null // null = not yet claimed
}
```

The `| null` on fields tells you: this field might not be set yet. It forces you to handle both cases in your code.

### Pattern 4 — Optimistic UI

When a student saves their display name, the app updates the UI immediately without waiting for the server to confirm:

```ts
// src/features/student/StudentData.tsx
await updateDisplayName(me.id, trimmed)
setMe((m) => (m ? { ...m, display_name: trimmed } : m))  // update UI instantly
```

If the server call fails, you'd roll it back. This makes the app feel instant.

### Pattern 5 — The `useCallback` + dependency array pattern

```ts
const load = useCallback(async () => {
  const data = await getMyStudent(user.id)
  setMe(data)
}, [user])  // ← re-creates this function only when `user` changes

useEffect(() => {
  load()
}, [load])  // ← runs load() only when load() changes (i.e., when user changes)
```

`useCallback` memoizes a function — it only creates a new version when its dependencies change. `useEffect` runs when its dependencies change. Together, they prevent infinite re-renders.

### Pattern 6 — SQL window functions for ranking

```sql
row_number() OVER (ORDER BY s.lifetime_points DESC, s.display_name ASC)
```

`OVER (ORDER BY ...)` is a SQL window function. It assigns a sequential number to each row based on the ordering, without grouping the rows together. This is how `rank = 1, 2, 3...` is computed in one query across all students.

---

## Quick reference: which file does what

| Question | File |
|----------|------|
| How do students log in? | `src/features/auth/SignIn.tsx` + `src/lib/auth.tsx` |
| How do students claim their account? | `src/features/auth/Claim.tsx` + `supabase/functions/claim-token/index.ts` |
| How are points awarded? | `src/features/instructor/Award.tsx` + `src/lib/api.ts` → `awardPoints()` |
| How does lifetime_points stay accurate? | `supabase/migrations/0002_functions_triggers.sql` → `cp_recompute_points()` trigger |
| How does the level/XP bar compute? | `src/lib/leveling.ts` → `getLevelProgress()` |
| How does the leaderboard stay frozen? | `supabase/migrations/0006_leaderboard_snapshot.sql` → pg_cron + `refresh_leaderboard_snapshot()` |
| How do live updates work? | `src/features/student/StudentData.tsx` → Supabase Realtime channels |
| How is security enforced? | `supabase/migrations/0003_security.sql` (RLS) + `0002` (triggers) |
| How does routing/navigation work? | `src/router.tsx` + `src/features/auth/guards.tsx` |
| How does the app install on phones? | `src/components/pwa/InstallPrompt.tsx` + `vite.config.ts` |
| How is Vercel deployment configured? | `vercel.json` |
