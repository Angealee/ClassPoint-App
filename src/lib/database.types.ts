
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
        last_name: string | null
        first_name: string | null
        middle_name: string | null
        suffix: string | null
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
        category: 'recitation' | 'activity' | 'penalty' | 'redeem' | 'event' | 'event_attend'
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
        previous_rank: number | null
        rank_since: Timestamp
        spent_points: number
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

      event_sessions: Row<{
        id: UUID
        semester_id: UUID
        name: string
        points_per_scan: number
        status: 'active' | 'ended'
        started_at: Timestamp
        ended_at: Timestamp | null
        created_by: UUID | null
        created_at: Timestamp
      }>

      event_session_secrets: Row<{ event_id: UUID; qr_secret: string }>

      event_attendance: Row<{
        id: UUID
        event_id: UUID
        student_id: UUID
        section_id: UUID | null
        scanned_at: Timestamp
        point_event_id: UUID | null
        manual: boolean
        created_at: Timestamp
      }>

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
        status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'reversed'
        requested_at: Timestamp
        decided_at: Timestamp | null
        decided_by: UUID | null
        decision_note: string | null
        point_event_id: UUID | null
        /** 0062 — set when the request is a grade boost. */
        grade_item_id: UUID | null
        grade_bonus: number | null
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
        farewell_message: string | null
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
        fail_count: number
        last_seen_at: Timestamp | null
      }>

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

      space_rooms: Row<{
        id: UUID
        kind: 'section' | 'global' | 'dm'
        section_id: UUID | null
        semester_id: UUID
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

      space_room_members: Row<{
        room_id: UUID
        student_id: UUID | null
        created_at: Timestamp
      }>

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

      space_message_reactions: Row<{
        message_id: UUID
        room_id: UUID
        student_id: UUID
        code: 'like' | 'lol' | 'fire' | 'wow' | 'sad' | 'love'
        created_at: Timestamp
      }>

      space_mentions: Row<{
        message_id: UUID
        student_id: UUID
      }>

      space_room_prefs: Row<{
        student_id: UUID
        room_id: UUID
        /** 0048 — 'all' | 'mentions' | 'none'. The only writable one. */
        level: string
        muted: boolean
      }>

      space_pins: Row<{
        id: UUID
        room_id: UUID
        message_id: UUID
        pinned_by: UUID | null
        created_at: Timestamp
      }>

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

      lounge_posts: Row<{
        id: UUID
        semester_id: UUID
        kind: 'text' | 'shoutout' | 'pulse'
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

      lounge_ws: Row<{
        post_id: UUID
        student_id: UUID
        created_at: Timestamp
      }>

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

      app_flags: Row<{
        key: string
        enabled: boolean
        note: string | null
        updated_at: Timestamp
        updated_by: UUID | null
      }>

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

      peer_groups: Row<{
        id: UUID
        section_id: UUID
        name: string
        sort_order: number
        archived_at: Timestamp | null
        created_at: Timestamp
      }>

      peer_group_members: Row<{
        group_id: UUID
        student_id: UUID
        section_id: UUID
        created_at: Timestamp
      }>
      peer_evaluations: Row<{
        id: UUID
        semester_id: UUID
        subject_id: UUID
        title: string
        instructions: string | null
        scope: 'section' | 'group'
        status: 'open' | 'closed'
        closes_at: Timestamp | null
        closed_at: Timestamp | null
        results_released_at: Timestamp | null
        created_at: Timestamp
      }>

      peer_evaluation_sections: Row<{
        evaluation_id: UUID
        section_id: UUID
      }>

      peer_criteria: Row<{
        id: UUID
        evaluation_id: UUID
        label: string
        scale: unknown
        sort_order: number
        created_at: Timestamp
      }>

      peer_submissions: Row<{
        id: UUID
        evaluation_id: UUID
        evaluator_id: UUID
        section_id: UUID
        group_id: UUID | null
        submitted_at: Timestamp
      }>

      peer_ratings: Row<{
        id: UUID
        submission_id: UUID
        evaluation_id: UUID
        evaluator_id: UUID
        ratee_id: UUID
        criterion_id: UUID
        score: number
        created_at: Timestamp
      }>

      peer_evaluation_groups: Row<{
        evaluation_id: UUID
        group_id: UUID
      }>

      peer_comments: Row<{
        submission_id: UUID
        ratee_id: UUID
        evaluator_id: UUID
        evaluation_id: UUID
        body: string
        hidden_at: Timestamp | null
        /** 0054 — the banned-word filter matched at submit. Permanent. */
        flagged: boolean
        created_at: Timestamp
      }>

      grade_policies: Row<{
        subject_id: UUID
        term: 'prelim' | 'midterm' | 'finals'
        pt_weight: number
        quiz_weight: number
        recit_weight: number
        cs_weight: number
        exam_weight: number
        final_weight: number
        transmute_base: number
        transmute_span: number
        updated_at: Timestamp
      }>

      grade_items: Row<{
        id: UUID
        section_id: UUID
        subject_id: UUID
        term: 'prelim' | 'midterm' | 'finals'
        component: 'performance_task' | 'quiz' | 'recitation' | 'exam'
        name: string
        max_score: number
        position: number
        /** Retired: leaves the denominator, keeps its scores. */
        archived_at: Timestamp | null
        created_at: Timestamp
        /** 0062 — "spend this many points…" */
        points_cost: number | null
        /** 0062 — "…to add this many marks". Both set or both null. */
        points_bonus: number | null
        /** 0063 — switched off even though its part is offered. */
        assist_off: boolean
        session_id: UUID | null
      }>

      /** 0063 — the subject's points-assist terms for one PART. */
      grade_assist_defaults: Row<{
        subject_id: UUID
        component: 'performance_task' | 'quiz' | 'exam'
        points_cost: number
        points_bonus: number
        updated_at: Timestamp
      }>

      grade_absences: Row<{
        item_id: UUID
        student_id: UUID
        created_at: Timestamp
      }>

      grade_boosts: Row<{
        item_id: UUID
        student_id: UUID
        redemption_id: UUID
        score_before: number
        score_after: number
        marks_granted: number
        points_spent: number
        applied_at: Timestamp
      }>

      grade_scores: Row<{
        item_id: UUID
        student_id: UUID
        score: number
        updated_at: Timestamp
      }>
    }

    Views: Record<string, never>

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
