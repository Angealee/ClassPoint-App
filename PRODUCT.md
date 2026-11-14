# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Students** (~208, DCT): use it on their own phones, often installed as a PWA, in short glances between classes. Jobs: check in to class, see points/level/rank, spend points, read grades, chat in Student Space.
- **The instructor** (one person, the owner): runs live classes, awards points, enters grades, approves requests, moderates Space. Works on a phone in class and a laptop for grades.

Audience is one class for the foreseeable future (confirmed). Not designed as multi-tenant SaaS.

## Product Purpose
A mobile-first gamified classroom app. The instructor awards points; students level up, climb a leaderboard, check in via rotating HMAC QR codes, collect achievements, and spend points. Success (confirmed): students show up, stay engaged, the instructor saves time over paper/Excel, and students trust that grades, points and moderation are fair.

## Positioning
It is one instructor's own classroom, not a generic LMS: attendance is per subject, points are one shared pool reset each semester, and points are never turned into a grade except through an individually approved redemption.

## Operating Context
Data is organised semester → term (prelim/midterm/finals) → subject → section. First semester: 1st Sem AY 2026–2027 from June 15 2026. Supabase backend, Vercel deploy, Manila time. Migrations pasted manually into the SQL editor.

## Capabilities and Constraints
Attendance (live QR, offline proofs, excuses), points ledger and spending, leaderboards (points and spend), achievements, grades with points assist, peer evaluation, Student Space (Lounge, chat, events, moderation), semester rollover and archive. Hard constraints: Tailwind v4 CSS-first tokens in `src/styles/index.css`, custom UI primitives in `src/components/ui/`, the leveling curve is not to change without asking, every destructive action goes through ConfirmDialog, form controls are 16px.

## Brand Commitments
Name "ClassPoint". Playful, inside-joke tone in game content (the user reviews copy drafts). UI chrome uses icons, not emoji. Brand red is an accent for identity; semantic role tokens carry meaning (success, warn, danger, reward, info). Gold means points/XP/good things.

## Evidence on Hand
Live app with real roster. No testimonials, case studies or external customers; do not fabricate any. Nothing has been verified on a real authenticated screen in the design-tooling environment (see `REAL_DEVICE_PASS.md`).

## Product Principles
- Fairness must be visible: show the rule or the number behind any grade, rank or decision.
- Speed under pressure: live-class and grading flows favour few taps and clear state over decoration.
- Meaning over decoration: colour, motion and elevation each signal something, and stay rare.
- Never lie by omission: empty, loading and error states are different things and are never confused.
- Playful, never childish: game energy for students, calm precision for the instructor.

## Accessibility & Inclusion
No formal standard beyond the measured bar already in place: 4.5:1 body contrast, 44px tap targets, reduced-motion respected, 16px form controls. No known specific user needs recorded.
