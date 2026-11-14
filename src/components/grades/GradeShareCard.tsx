import { forwardRef } from 'react'
import { CARD_H, CARD_W } from '@/components/leaderboard/ShareCard'
import type { BreakdownSegment } from '@/lib/student-grades'

export { CARD_H, CARD_W }

/*
 * The grade card a student can save as a JPG. Like the leaderboard card it is a deliberate
 * token-free island: every value is a literal, because var(--x) does not resolve inside
 * modern-screenshot's cloned capture context.
 *
 * It carries the SO FAR figure and each part's score, never an official grade (a student is
 * never shown one), and it stamps "so far, not final" on the image itself so a screenshot
 * cannot be passed off as a final grade. Name and subject are OFF unless the student turns
 * them on: this is private data about one person.
 */
const C = {
  bg: '#0d0d10',
  line: 'rgba(255,255,255,0.10)',
  ink: '#ffffff',
  muted: 'rgba(255,255,255,0.58)',
  brand: '#e11d2a',
  brandDeep: '#8f0f18',
  gold: '#ffba1f',
  goldSoft: '#fde08a',
  plate: '#14141c',
  plate2: '#1e1e2b',
}

const FONT = '"Bricolage Grotesque", "Inter", sans-serif'

export interface GradeShareProps {
  termTitle: string
  /** The so-far figure, already formatted. */
  figure: string
  marked: number
  total: number
  segments: BreakdownSegment[]
  /** Null unless the student chose to show it. */
  subjectLabel: string | null
  studentName: string | null
  dateLabel: string
}

export const GradeShareCard = forwardRef<HTMLDivElement, GradeShareProps>(function GradeShareCard(
  { termTitle, figure, marked, total, segments, subjectLabel, studentName, dateLabel },
  ref,
) {
  const who = [studentName, subjectLabel].filter(Boolean).join('  ·  ')

  return (
    <div
      ref={ref}
      style={{
        width: CARD_W,
        height: CARD_H,
        boxSizing: 'border-box',
        padding: 64,
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: C.ink,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: `linear-gradient(145deg, ${C.brand}, ${C.brandDeep})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 30,
            }}
          >
            C
          </div>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 36, letterSpacing: '-0.02em' }}>
            ClassPoint
          </span>
        </div>
        <div style={{ fontSize: 22, color: C.muted }}>{dateLabel}</div>
      </div>

      <div style={{ marginTop: 56 }}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 92,
            lineHeight: 1,
            letterSpacing: '-0.03em',
          }}
        >
          {termTitle}
        </div>
        {who && <div style={{ fontSize: 28, color: C.muted, marginTop: 14 }}>{who}</div>}
      </div>

      <div
        style={{
          marginTop: 44,
          borderRadius: 36,
          background: `linear-gradient(145deg, ${C.plate2}, ${C.plate})`,
          border: `2px solid ${C.line}`,
          padding: '44px 48px 48px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 230,
              lineHeight: 0.95,
              color: C.goldSoft,
              letterSpacing: '-0.02em',
            }}
          >
            {figure}
          </div>
          <div style={{ fontSize: 26, color: C.muted, paddingBottom: 14 }}>
            {marked} of {total} marked
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 40 }}>
          {segments.map((s) => (
            <div key={s.component} style={{ flex: `${s.weightPct} 1 0`, minWidth: 0 }}>
              <div
                style={{
                  height: 36,
                  borderRadius: 8,
                  background: C.line,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round((s.fill ?? 0) * 100)}%`,
                    height: '100%',
                    background: C.gold,
                  }}
                />
              </div>
              <div style={{ marginTop: 12, fontSize: 28, fontWeight: 700 }}>{s.short}</div>
              <div style={{ fontSize: 24, color: C.muted }}>{s.weightPct}%</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {segments.map((s) => (
          <div
            key={s.component}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '32px 8px',
              borderBottom: `1px solid ${C.line}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 40, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 24, color: C.muted, marginTop: 2 }}>
                {s.weightPct}% of the term
              </div>
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 58,
                color: s.score === null ? C.muted : C.goldSoft,
              }}
            >
              {s.score === null ? '-' : s.score.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          alignSelf: 'center',
          padding: '16px 34px',
          borderRadius: 16,
          border: '2px dashed rgba(255,255,255,0.4)',
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '0.16em',
          color: C.ink,
        }}
      >
        SO FAR · NOT FINAL
      </div>

      <div
        style={{
          marginTop: 28,
          paddingTop: 24,
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 20, color: C.muted }}>
          Marks so far. Unmarked parts count at the 60 minimum.
        </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: C.gold }}>#ClassPoint</span>
      </div>
    </div>
  )
})
