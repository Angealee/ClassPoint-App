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
 * A column or table marked `PENDING <nnnn>` is written in a migration that has
 * NOT been run against the live database yet. It's typed because the client
 * already queries it and the build must stay green — but until that migration
 * is pasted, a query touching it WILL 400 at runtime. Delete the annotation as
 * each one lands.
 *
 * Everything through 0032 is applied (2026-08-14), so those annotations are
 * gone. Currently pending: **0033** (student presence) and **0034** (instructor
 * ops). Neither adds a column this file types — both are functions plus a
 * publication add — so nothing here is marked for them; the failure mode is a
 * missing RPC at runtime, which these types don't catch anyway.
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
        /** 0027 */
        semester_id: UUID
        /** 0041 — the Student Space beta roster. */
        space_enabled: boolean
      }>

      students: Row<{
        id: UUID
        section_id: UUID
        full_name: string
        display_name: string
        avatar_url: string | null
        /** Career total. Achievements read this (badges are lifetime). */
        lifetime_points: number
        /** 0029 — this semester's balance: XP, level, rank, spendable. */
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
        /** PENDING 0039 — wide cover image at the top of the profile. */
        header_url: string | null
        /** PENDING 0040 — vertical focal point of header_url, 0-100. */
        header_pos: number
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
        category: 'recitation' | 'activity' | 'penalty' | 'redeem' | 'event'
        note: string | null
        created_at: Timestamp
        /** 0029 — stamped by the trg_stamp_semester trigger. */
        semester_id: UUID | null
      }>

      instructors: Row<{ email: string }>

      leaderboard_snapshot: Row<{
        student_id: UUID
        display_name: string
        section_id: UUID
        lifetime_points: number
        /** 0029 — the board ranks on this. */
        semester_points: number
        rank: number
        /** PENDING 0037 — rank at the previous refresh; null on a first board. */
        previous_rank: number | null
        /** PENDING 0037 — when the current "this rank or better" run began. */
        rank_since: Timestamp
        /** PENDING 0038 — points cashed out this semester (the spend board). */
        spent_points: number
        /** PENDING 0038 — place on the spend board; NULL means "hasn't spent". */
        spend_rank: number | null
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
        /** 0028 — null means "untagged" (predates subjects). */
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

      /** 0027 — the academic structure. */
      semesters: Row<{
        id: UUID
        name: string
        starts_on: string
        is_active: boolean
        created_at: Timestamp
      }>

      /** 0027 — editable prelim/midterm/finals dates. */
      semester_terms: Row<{
        id: UUID
        semester_id: UUID
        term: 'prelim' | 'midterm' | 'finals'
        starts_on: string
        ends_on: string
      }>

      /** 0027 */
      subjects: Row<{
        id: UUID
        semester_id: UUID
        code: string
        name: string
        created_at: Timestamp
      }>

      /** 0027 — which sections take which subject. */
      section_subjects: Row<{ section_id: UUID; subject_id: UUID }>

      /** 0032 — the instructor's price list. Ships empty. */
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

      /** 0043 — chat rooms. Section and global membership is DERIVED, not stored. */
      space_rooms: Row<{
        id: UUID
        kind: 'section' | 'global' | 'dm'
        section_id: UUID | null
        semester_id: UUID
        /** Canonical sorted participant key, so a pair can only ever have one room. */
        dm_key: string | null
        slow_mode_seconds: number
        announce_only: boolean
        pinned_message_id: UUID | null
        /** Trigger-maintained, so the room list is one query. */
        last_message_at: Timestamp | null
        last_message_by: string | null
        last_message_body: string | null
        created_at: Timestamp
      }>

      /** 0043 — DM membership only. `student_id` null = the instructor. */
      space_room_members: Row<{
        room_id: UUID
        student_id: UUID | null
        created_at: Timestamp
      }>

      /** 0043 — chat messages. Soft-deleted; the row is the tombstone. */
      space_messages: Row<{
        id: UUID
        room_id: UUID
        author_student_id: UUID | null
        display_name: string
        avatar_url: string | null
        body: string
        reply_to_id: UUID | null
        reply_to_name: string | null
        reply_to_excerpt: string | null
        hidden_at: Timestamp | null
        deleted_at: Timestamp | null
        created_at: Timestamp
      }>

      /**
       * 0043 — reactions, stored as CODES not emoji (a variation selector
       * would fail a CHECK against the glyph). `room_id` is denormalized so a
       * realtime filter can be scoped to one room.
       */
      space_message_reactions: Row<{
        message_id: UUID
        room_id: UUID
        student_id: UUID
        code: 'like' | 'lol' | 'fire' | 'wow' | 'sad' | 'love'
        created_at: Timestamp
      }>

      /** 0043 — resolved by the CLIENT when sending; validated server-side. */
      space_mentions: Row<{
        message_id: UUID
        student_id: UUID
      }>

      /** 0043 — per-room mute. A table, not localStorage: push is server-side. */
      space_room_prefs: Row<{
        student_id: UUID
        room_id: UUID
        muted: boolean
      }>

      /**
       * 0044 — reports. No FK on `target_id`: it points into one of three
       * tables, and a report must survive the thing it is about being deleted.
       */
      space_reports: Row<{
        id: UUID
        target_type: 'post' | 'reply' | 'message'
        target_id: UUID
        reporter_student_id: UUID
        reason: 'harassment' | 'inappropriate' | 'spam' | 'other'
        note: string | null
        resolved_at: Timestamp | null
        resolved_by: UUID | null
        resolved_action: 'delete' | 'restore' | 'dismiss' | null
        created_at: Timestamp
      }>

      /** 0042 — the Lounge feed. Select-only; every write goes through an RPC. */
      lounge_posts: Row<{
        id: UUID
        semester_id: UUID
        kind: 'text' | 'shoutout' | 'pulse'
        /** Null = the instructor. On a pulse card, the student it is about. */
        author_student_id: UUID | null
        display_name: string
        avatar_url: string | null
        body: string
        target_student_id: UUID | null
        target_display_name: string | null
        target_avatar_url: string | null
        pulse_kind: 'level' | 'podium' | null
        pulse_value: number | null
        /** Trigger-maintained. Never written from the client. */
        w_count: number
        reply_count: number
        pinned_at: Timestamp | null
        hidden_at: Timestamp | null
        deleted_at: Timestamp | null
        created_at: Timestamp
      }>

      /** 0042 — one row per (post, student). The PK is the "one W each" rule. */
      lounge_ws: Row<{
        post_id: UUID
        student_id: UUID
        created_at: Timestamp
      }>

      /** 0042 — replies. Soft-deleted so a thread never loses its parent. */
      lounge_replies: Row<{
        id: UUID
        post_id: UUID
        author_student_id: UUID | null
        display_name: string
        avatar_url: string | null
        body: string
        hidden_at: Timestamp | null
        deleted_at: Timestamp | null
        created_at: Timestamp
      }>

      /**
       * 0041 — feature flags. NO RLS policy at all: reachable only through the
       * SECURITY DEFINER functions, like leaderboard_banned_words. Declared
       * here for completeness; the client never selects from it.
       */
      app_flags: Row<{
        key: string
        enabled: boolean
        note: string | null
        updated_at: Timestamp
        updated_by: UUID | null
      }>

      /** 0041 — Student Space mutes. Own rows selectable; writes via RPC only. */
      space_timeouts: Row<{
        id: UUID
        student_id: UUID
        until: Timestamp
        reason: string | null
        created_by: UUID | null
        created_at: Timestamp
      }>

      /** 0026 — the auth trail AND the rate-limit counter. */
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
