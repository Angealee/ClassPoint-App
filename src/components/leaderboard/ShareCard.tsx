import { forwardRef } from 'react'
import { CelestialFrame } from '@/components/leaderboard/CelestialFrame'
import { BODY, SKY, type Place } from '@/components/leaderboard/podiumPalette'
import { makeStars } from '@/lib/starfield'
import type { LeaderboardEntry } from '@/lib/types'

export const CARD_W = 1080
export const CARD_H = 1920

export type ShareVariant = 'podium' | 'list'

const C = {
  bg: '#0d0d10',
  bgSoft: '#16161b',
  line: 'rgba(255,255,255,0.10)',
  ink: '#ffffff',
  muted: 'rgba(255,255,255,0.55)',
  brand: '#e11d2a',
  brandDeep: '#8f0f18',
  gold: '#ffba1f',
  goldDeep: '#b97d00',
  goldSoft: '#fde08a',
  plate: '#14141c',
  plate2: '#1e1e2b',
}

interface ShareCardProps {
  variant: ShareVariant
  entries: LeaderboardEntry[]
  /** The sharer, if they're a student — highlighted / called out. */
  meId?: string | null
  /** Their position in this view (1-based). Null when unranked. */
  myPos?: number | null
  myPoints?: number | null
  /** "Global" or a section name. */
  scopeLabel: string
  capturedAt?: string | null
  climber?: { name: string; places: number } | null
}

const dateText = (iso?: string | null) =>
  new Date(iso ?? Date.now()).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function Face({ url, name, size }: { url: string | null; name: string; size: number }) {
  const ring = Math.max(3, Math.round(size * 0.035))
  if (url) {
    return (
      <img
        src={url}
        crossOrigin="anonymous"
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: `${ring}px solid ${C.bgSoft}`,
          display: 'block',
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${ring}px solid ${C.bgSoft}`,
        background: `linear-gradient(145deg, ${C.goldSoft}, ${C.gold})`,
        color: '#3d2600',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Bricolage Grotesque", "Inter", sans-serif',
        fontWeight: 700,
        fontSize: Math.round(size * 0.36),
        lineHeight: 1,
      }}
    >
      {initials(name)}
    </div>
  )
}

function Header({ scopeLabel, capturedAt }: { scopeLabel: string; capturedAt?: string | null }) {
  return (
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
            fontFamily: '"Bricolage Grotesque", "Inter", sans-serif',
            fontWeight: 700,
            fontSize: 30,
            color: C.ink,
          }}
        >
          C
        </div>
        <span
          style={{
            fontFamily: '"Bricolage Grotesque", "Inter", sans-serif',
            fontWeight: 700,
            fontSize: 36,
            color: C.ink,
            letterSpacing: '-0.02em',
          }}
        >
          ClassPoint
        </span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.muted }}>{scopeLabel}</div>
        <div style={{ fontSize: 20, color: C.muted, marginTop: 2 }}>{dateText(capturedAt)}</div>
      </div>
    </div>
  )
}

function Title({ sub }: { sub: string }) {
  return (
    <div style={{ marginTop: 44 }}>
      <div
        style={{
          fontFamily: '"Bricolage Grotesque", "Inter", sans-serif',
          fontWeight: 700,
          fontSize: 78,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          color: C.ink,
        }}
      >
        LEADERBOARD
      </div>
      <div style={{ fontSize: 24, color: C.muted, marginTop: 10 }}>{sub}</div>
    </div>
  )
}

function YouChip({ pos, points }: { pos: number; points: number | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '28px 36px',
        borderRadius: 26,
        background: 'rgba(255,255,255,0.07)',
        border: '2px solid rgba(253,224,138,0.35)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: C.muted,
          }}
        >
          RANK
        </div>
        {points !== null && (
          <div style={{ fontSize: 24, color: C.muted, marginTop: 6 }}>{points} points</div>
        )}
      </div>
      <div
        style={{
          fontFamily: '"Bricolage Grotesque", "Inter", sans-serif',
          fontWeight: 700,
          fontSize: 72,
          lineHeight: 1,
          color: C.ink,
        }}
      >
        #{pos}
      </div>
    </div>
  )
}

function Footer() {
  return (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: 28,
        borderTop: `1px solid ${C.line}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span style={{ fontSize: 20, color: C.muted }}>Earn points. Climb the board.</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: C.gold }}>#ClassPoint</span>
    </div>
  )
}

function ClimberBanner({ climber }: { climber: { name: string; places: number } }) {
  return (
    <div
      style={{
        marginTop: 28,
        padding: '22px 28px',
        borderRadius: 22,
        background: 'rgba(16,185,129,0.12)',
        border: '2px solid rgba(16,185,129,0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
      }}
    >
      <div style={{ fontSize: 40, lineHeight: 1, color: '#34d399' }}>▲</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.muted }}>
          Biggest climb this settle
        </div>
        <div
          style={{
            fontFamily: '"Bricolage Grotesque", "Inter", sans-serif',
            fontWeight: 700,
            fontSize: 34,
            color: C.ink,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {climber.name} · {climber.places} place{climber.places === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}

type Size = 'roomy' | 'compact'

const SIZE: Record<Size, { padY: number; num: number; numW: number; face: number; name: number; pts: number; bar: number }> = {
  roomy: { padY: 20, num: 48, numW: 60, face: 80, name: 34, pts: 40, bar: 4 },
  compact: { padY: 12, num: 36, numW: 54, face: 56, name: 30, pts: 34, bar: 3 },
}

const FONT = '"Bricolage Grotesque", "Inter", sans-serif'

function Row({
  e,
  pos,
  isMe,
  size,
  share,
}: {
  e: LeaderboardEntry
  pos: number
  isMe: boolean
  size: Size
  share: number
}) {
  const z = SIZE[size]
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: `${z.padY}px 40px`,
        background: isMe ? 'rgba(255,255,255,0.07)' : 'transparent',
        boxShadow: isMe ? 'inset 0 0 0 2px rgba(253,224,138,0.35)' : 'none',
      }}
    >
      <div
        style={{
          width: z.numW,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: z.num,
          lineHeight: 1,
          textAlign: 'center',
          color: C.muted,
        }}
      >
        {pos}
      </div>
      <Face url={e.avatar_url} name={e.display_name} size={z.face} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: 600,
          fontSize: z.name,
          color: C.ink,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {e.display_name}
        {isMe && <span style={{ color: C.goldSoft, fontWeight: 700 }}> · you</span>}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: z.pts,
          lineHeight: 1,
          color: C.goldSoft,
        }}
      >
        {e.points}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: z.bar,
          background: C.line,
        }}
      >
        <div style={{ width: `${Math.round(share * 100)}%`, height: '100%', background: C.gold }} />
      </div>
    </div>
  )
}

function Plate({
  rows,
  startPos,
  leader,
  meId,
  size,
}: {
  rows: LeaderboardEntry[]
  startPos: number
  leader: number
  meId?: string | null
  size: Size
}) {
  return (
    <div
      style={{
        borderRadius: 36,
        overflow: 'hidden',
        background: `linear-gradient(145deg, ${C.plate2}, ${C.plate})`,
        border: `2px solid ${C.line}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '16px 40px',
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '0.14em',
          color: C.muted,
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <span>RANK</span>
        <span>POINTS</span>
      </div>
      {rows.map((e, i) => (
        <Row
          key={e.student_id}
          e={e}
          pos={startPos + i}
          isMe={e.student_id === meId}
          size={size}
          share={e.points / leader}
        />
      ))}
    </div>
  )
}

/* The space podium, drawn statically at story size. Same bodies, palettes and risers as the
   live board (podiumPalette.ts), so a screenshot and the app agree. */
const STARS = makeStars(5, 70, 1, 2.8, 0.3, 0.9)
const COL_W = 277
const RISER: Record<Place, number> = { 1: 118, 2: 86, 3: 60 }

function StageColumn({
  e,
  place,
  isMe,
}: {
  e: LeaderboardEntry
  place: Place
  isMe: boolean
}) {
  const body = BODY[place]
  const champ = place === 1
  const frameW = Math.round((COL_W - 36) * (champ ? 1 : 0.88))
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 28,
          border: `2px solid ${body.border}`,
          background: `linear-gradient(170deg, ${body.cardTop}, ${body.cardBot})`,
          padding: '16px 16px 20px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: body.foilRest + 0.1,
            background: `radial-gradient(circle at 28% 18%, rgba(255,255,255,0.4), transparent 42%), ${body.foil}`,
          }}
        />
        {isMe && (
          <div
            style={{
              position: 'absolute',
              left: 14,
              top: 14,
              padding: '3px 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.15)',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: C.ink,
            }}
          >
            YOU
          </div>
        )}
        <div style={{ width: frameW, margin: '0 auto' }}>
          <CelestialFrame place={place} reduced>
            <Face url={e.avatar_url} name={e.display_name} size={Math.round(frameW * 0.56)} />
          </CelestialFrame>
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: 6,
            fontWeight: 700,
            fontSize: champ ? 34 : 29,
            color: C.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {e.display_name}
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: 4,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 8,
            fontFamily: FONT,
            fontWeight: 700,
            lineHeight: 1,
            fontSize: champ ? 68 : 54,
            color: body.ink,
          }}
        >
          {e.points}
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 22, fontWeight: 500, color: C.muted }}>
            pts
          </span>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          height: RISER[place],
          borderRadius: '14px 14px 0 0',
          border: `2px solid ${body.border}`,
          borderBottom: 'none',
          background: `linear-gradient(180deg, ${body.standTop}, ${body.standBot})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: champ ? 60 : 48,
          color: body.ink,
          boxShadow: `inset 0 2px 0 ${body.ink}66`,
        }}
      >
        <span style={{ position: 'absolute', left: 12, top: 12, width: 8, height: 8, borderRadius: 4, background: body.ink, opacity: 0.45 }} />
        <span style={{ position: 'absolute', right: 12, top: 12, width: 8, height: 8, borderRadius: 4, background: body.ink, opacity: 0.45 }} />
        {place}
      </div>
    </div>
  )
}

function SpaceStage({ entries, meId }: { entries: LeaderboardEntry[]; meId?: string | null }) {
  const [first, second, third] = entries
  const slots: Array<{ e: LeaderboardEntry; place: Place } | null> = [
    second ? { e: second, place: 2 } : null,
    first ? { e: first, place: 1 } : null,
    third ? { e: third, place: 3 } : null,
  ]
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 36,
        background: SKY,
        border: `2px solid ${C.line}`,
      }}
    >
      {STARS.map((st, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${st.x}%`,
            top: `${st.y}%`,
            width: st.r * 2,
            height: st.r * 2,
            borderRadius: '50%',
            background: '#fff',
            opacity: st.o,
          }}
        />
      ))}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 22,
          padding: '40px 36px 0',
        }}
      >
        {slots.map((slot, i) =>
          slot ? (
            <StageColumn key={slot.e.student_id} e={slot.e} place={slot.place} isMe={slot.e.student_id === meId} />
          ) : (
            <div key={i} style={{ flex: 1 }} />
          ),
        )}
      </div>
      <div style={{ height: 14, borderTop: '2px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)' }} />
    </div>
  )
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { variant, entries, meId, myPos, myPoints, scopeLabel, capturedAt, climber },
  ref,
) {
  const top = entries.slice(0, 10)
  const meInTop = !!meId && top.some((e) => e.student_id === meId)
  const leader = Math.max(1, ...top.map((e) => e.points))

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
      <Header scopeLabel={scopeLabel} capturedAt={capturedAt} />
      <Title sub={`Top ${top.length} this settle`} />

      <div style={{ marginTop: 36 }}>
        {variant === 'podium' ? (
          <>
            <SpaceStage entries={top.slice(0, 3)} meId={meId} />
            {top.length > 3 && (
              <div style={{ marginTop: 24 }}>
                <Plate rows={top.slice(3)} startPos={4} leader={leader} meId={meId} size="compact" />
              </div>
            )}
          </>
        ) : (
          <Plate rows={top} startPos={1} leader={leader} meId={meId} size="roomy" />
        )}
      </div>

      <div style={{ flex: 1 }} />

      {climber && <ClimberBanner climber={climber} />}

      {myPos != null && !meInTop && (
        <div style={{ marginTop: 20 }}>
          <YouChip pos={myPos} points={myPoints ?? null} />
        </div>
      )}

      <Footer />
    </div>
  )
})
