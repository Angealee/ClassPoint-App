/**
 * Database schema types — HAND-WRITTEN, transcribed from supabase/migrations.
 *
 * ── REPLACE ME ───────────────────────────────────────────────────────────────
 * This file exists because generating types needs an authenticated CLI. Once you
 * can run it, throw this away and generate the real thing:
 *
 *   npx supabase login
 *   npx supabase gen types typescript --project-id cxfxstazlwjijozkglgx \
 *     > src/lib/database.types.ts
 *
 * The generated file is authoritative and cannot drift. This one can, so treat
 * any disagreement between it and a migration as THIS FILE being wrong.
 *
 * ── WHAT IT ACTUALLY BUYS (measured, 2026-08-14) ─────────────────────────────
 * Tested against supabase-js 2.108 with this hand-written schema:
 *
 *   ✅ WRITES are checked. An insert/upsert with a column that isn't in the
 *      table below is a compile error — this immediately caught a genuinely
 *      wrong `push_subscriptions` shape in THIS file.
 *   ✅ Mappers can take real row types instead of `Record<string, unknown>` +
 *      `as string` casts (see mapSection in api.ts for the pattern to copy).
 *   ❌ READS are NOT checked. `.from('nonexistent_table')` and
 *      `.select('bogus_column')` both compile clean. The select-string parser
 *      does not engage with a hand-written schema the way it does with a
 *      generated one.
 *
 * So this does NOT yet deliver "a query written before its migration ran fails
 * the build". Getting that requires the GENERATED types — which is the strongest
 * argument for running the CLI command above when you get a chance.
 *
 * ── PENDING MIGRATIONS ───────────────────────────────────────────────────────
 * Every column and table below marked `PENDING <nnnn>` is written in a migration
 * that has NOT been run against the live database yet (0026–0031 as of
 * 2026-08-14). They're typed because the client already queries them and the
 * build must stay green — but until those migrations are pasted, a query
 * touching one WILL 400 at runtime. Delete the annotations as each lands.
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────────
 * Tables are typed precisely (that's where a missing column bites). RPC
 * signatures are deliberately permissive: there are ~40 of them, they change
 * with every migration, and hand-transcribing their argument shapes buys far
 * less than it costs. `gen types` will fill them in properly.
 */

type Timestamp = string
type UUID = string

/** A table's columns as they come back from a select. */
interface Row<T> {
  Row: T
  Insert: Partial<T>
  Update: Partial<T>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      sections: Row<{
        id: UUID
        name: string
        created_at: Timestamp
        /** PENDING 0027 */
        semester_id: UUID
      }>

      students: Row<{
        id: UUID
        section_id: UUID
        full_name: string
        display_name: string
        avatar_url: string | null
        /** Career total. Achievements read this (badges are lifetime). */
        lifetime_points: number
        /** PENDING 0029 — this semester's balance: XP, level, rank, spendable. */
        semester_points: number
        user_id: UUID | null
        created_at: Timestamp
        /** 0023 — archive instead of delete. */
        archived_at: Timestamp | null
        bio: string | null
        interests: string | null
        banner_urls: string[] | null
        display_title: string | null
        pinned_achievements: string[] | null
      }>

      student_secrets: Row<{
        student_id: UUID
        claim_token: string
        username: string | null
        claimed_at: Timestamp | null
        reset_token: string | null
        reset_expires_at: Timestamp | null
      }>

      point_events: Row<{
        id: UUID
        student_id: UUID
        points: number
        category: 'recitation' | 'activity' | 'penalty' | 'redeem'
        note: string | null
        created_at: Timestamp
        /** PENDING 0029 — stamped by the trg_stamp_semester trigger. */
        semester_id: UUID | null
      }>

      instructors: Row<{ email: string }>

      leaderboard_snapshot: Row<{
        student_id: UUID
        display_name: string
        section_id: UUID
        lifetime_points: number
        /** PENDING 0029 — the board ranks on this. */
        semester_points: number
        rank: number
      }>

      leaderboard_meta: Row<{ id: boolean; captured_at: Timestamp }>

      class_sessions: Row<{
        id: UUID
        section_id: UUID
        topic: string | null
        status: 'active' | 'ended'
        started_at: Timestamp
        ended_at: Timestamp | null
        late_after_min: number
        absent_after_min: number
        late_penalty: number
        absent_penalty: number
        apply_penalties: boolean
        penalties_committed: boolean
        created_by: UUID | null
        created_at: Timestamp
        /** PENDING 0028 — null means "untagged" (predates subjects). */
        subject_id: UUID | null
      }>

      class_session_secrets: Row<{ session_id: UUID; qr_secret: string }>

      attendance_records: Row<{
        id: UUID
        session_id: UUID
        student_id: UUID
        status: 'present' | 'late' | 'absent' | 'excused' | 'irregular'
        scanned_at: Timestamp | null
        committed: boolean
        penalty_event_id: UUID | null
        created_at: Timestamp
        /** 0024 — recorded via the offline queue. */
        synced_late: boolean
      }>

      achievements: Row<{
        code: string
        category: 'points' | 'attendance' | 'growth' | 'social' | 'fun' | 'recognition'
        name: string
        description: string
        secret: boolean
        granted_by: 'system' | 'instructor'
        title_text: string | null
        metric: string | null
        threshold: number | null
        sort_order: number
      }>

      student_achievements: Row<{
        id: UUID
        student_id: UUID
        achievement_code: string
        unlocked_at: Timestamp
        granted_by: UUID | null
      }>

      notifications: Row<{
        id: UUID
        student_id: UUID
        type: string
        title: string
        body: string
        url: string
        created_at: Timestamp
        read_at: Timestamp | null
        push_status: string
        attempts: number
        last_attempt_at: Timestamp | null
      }>

      point_redemptions: Row<{
        id: UUID
        student_id: UUID
        points: number
        kind: 'quiz' | 'activity' | 'exam' | 'other'
        note: string | null
        status: 'pending' | 'approved' | 'rejected' | 'cancelled'
        requested_at: Timestamp
        decided_at: Timestamp | null
        decided_by: UUID | null
        decision_note: string | null
        point_event_id: UUID | null
      }>

      absence_excuses: Row<{
        id: UUID
        record_id: UUID
        student_id: UUID
        reason: string
        has_slip: boolean
        slip_updated_at: Timestamp | null
        status: 'pending' | 'approved' | 'rejected' | 'cancelled'
        requested_at: Timestamp
        decided_at: Timestamp | null
        decided_by: UUID | null
        decision_note: string | null
      }>

      leaderboard_comments: Row<{
        id: UUID
        /** Null means the instructor posted it. */
        student_id: UUID | null
        display_name: string
        avatar_url: string | null
        body: string
        created_at: Timestamp
      }>

      /** PENDING 0027 — the academic structure. */
      semesters: Row<{
        id: UUID
        name: string
        starts_on: string
        is_active: boolean
        created_at: Timestamp
      }>

      /** PENDING 0027 — editable prelim/midterm/finals dates. */
      semester_terms: Row<{
        id: UUID
        semester_id: UUID
        term: 'prelim' | 'midterm' | 'finals'
        starts_on: string
        ends_on: string
      }>

      /** PENDING 0027 */
      subjects: Row<{
        id: UUID
        semester_id: UUID
        code: string
        name: string
        created_at: Timestamp
      }>

      /** PENDING 0027 — which sections take which subject. */
      section_subjects: Row<{ section_id: UUID; subject_id: UUID }>

      /** PENDING 0032 — the instructor's price list. Ships empty. */
      reward_catalog_items: Row<{
        id: UUID
        label: string
        /** Capped at 50 to match request_point_redemption's own limit. */
        points: number
        kind: 'quiz' | 'activity' | 'exam' | 'other'
        sort_order: number
        /** Retired rather than deleted, so past redemptions still make sense. */
        archived_at: Timestamp | null
        created_at: Timestamp
      }>

      push_subscriptions: Row<{
        id: UUID
        student_id: UUID
        endpoint: string
        p256dh: string
        auth: string
        user_agent: string | null
        created_at: Timestamp
        /** 0017 — subscription health bookkeeping, written by send-push. */
        fail_count: number
        last_seen_at: Timestamp | null
      }>

      /** 0023 — instructor-select only; written by triggers and archive RPCs. */
      audit_log: Row<{
        id: number
        at: Timestamp
        actor: UUID | null
        action: string
        table_name: string
        row_id: UUID | null
        student_id: UUID | null
        summary: string | null
        row_data: unknown
      }>

      /** PENDING 0026 — the auth trail AND the rate-limit counter. */
      auth_events: Row<{
        id: number
        at: Timestamp
        kind: 'claim' | 'pin_reset'
        success: boolean
        ip: string | null
        user_agent: string | null
        student_id: UUID | null
        detail: string | null
      }>
    }

    Views: Record<string, never>

    /**
     * Deliberately permissive — see SCOPE in the header. Typing ~40 RPC
     * signatures by hand costs more than it returns when `gen types` will
     * replace them wholesale.
     */
    Functions: {
      [name: string]: {
        Args: Record<string, unknown>
        Returns: unknown
      }
    }

    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
