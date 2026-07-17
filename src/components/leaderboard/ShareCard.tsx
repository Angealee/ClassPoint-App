import { forwardRef } from 'react'
import type { LeaderboardEntry } from '@/lib/types'

/** Instagram/Facebook-friendly 4:5. Rendered at full size, previewed scaled. */
export const CARD_W = 1080
export const CARD_H = 1350

export type ShareVariant = 'podium' | 'list'

/**
 * Hardcoded palette — NOT the app's CSS variables.
 *
 * The capture must look the same regardless of the viewer's theme, and
 * `var(--…)` doesn't reliably resolve inside a cloned capture context anyway.
 * Dark is deliberate: it reads better on a social feed.
 */
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
  silver: '#c8ccd4',
  bronze: '#cd7f45',
}

const RANK_COLOR = [C.gold, C.silver, C.bronze]

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

/**
 * One avatar. `crossOrigin="anonymous"` matters: Supabase storage serves
 * `access-control-allow-origin: *`, and without the attribute the image taints
 * the capture and the export fails.
 */
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
        background: `linear-gradient(145deg, ${C.brand}, ${C.brandDeep})`,
        color: C.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Space Grotesk", sans-serif',
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
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: 30,
            color: C.ink,
          }}
        >
          C
        </div>
        <span
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
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
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 700,
          fontSize: 78,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          background: `linear-gradient(100deg, ${C.gold}, #fff 55%, ${C.gold})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        LEADERBOARD
      </div>
      <div style={{ fontSize: 24, color: C.muted, marginTop: 10 }}>{sub}</div>
    </div>
  )
}

/** Your standing, called out at the bottom. Null-safe for unranked students. */
function YouChip({ pos, points }: { pos: number; points: number | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '28px 36px',
        borderRadius: 26,
        background: `linear-gradient(100deg, rgba(225,29,42,0.22), rgba(225,29,42,0.06))`,
        border: `2px solid rgba(225,29,42,0.45)`,
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
          fontFamily: '"Space Grotesk", sans-serif',
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

/** Top 3 on pedestals — order is 2nd, 1st, 3rd so the winner sits centre. */
function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const [first, second, third] = entries
  const cols = [
    { e: second, place: 2, h: 150, face: 132 },
    { e: first, place: 1, h: 210, face: 172 },
    { e: third, place: 3, h: 118, face: 132 },
  ].filter((c) => c.e)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 22,
        marginTop: 48,
      }}
    >
      {cols.map(({ e, place, h, face }) => (
        <div
          key={e!.student_id}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          {place === 1 && <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 8 }}>👑</div>}
          <Face url={e!.avatar_url} name={e!.display_name} size={face} />
          <div
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: place === 1 ? 34 : 28,
              color: C.ink,
              marginTop: 14,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {e!.display_name}
          </div>
          <div
            style={{
              fontSize: place === 1 ? 30 : 26,
              fontWeight: 700,
              color: RANK_COLOR[place - 1],
              marginTop: 4,
            }}
          >
            {e!.lifetime_points}
          </div>
          <div
            style={{
              width: '100%',
              height: h,
              marginTop: 16,
              borderRadius: '18px 18px 0 0',
              background:
                place === 1
                  ? `linear-gradient(180deg, ${C.gold}, ${C.goldDeep})`
                  : `linear-gradient(180deg, ${C.bgSoft}, rgba(255,255,255,0.03))`,
              border: `1px solid ${place === 1 ? 'rgba(255,186,31,0.6)' : C.line}`,
              borderBottom: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: place === 1 ? 68 : 52,
              color: place === 1 ? '#3d2600' : C.muted,
            }}
          >
            {place}
          </div>
        </div>
      ))}
    </div>
  )
}

function RankRow({ e, pos, isMe }: { e: LeaderboardEntry; pos: number; isMe: boolean }) {
  const medal = pos <= 3 ? RANK_COLOR[pos - 1] : null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '14px 20px',
        borderRadius: 18,
        background: isMe ? 'rgba(225,29,42,0.16)' : 'transparent',
        border: `2px solid ${isMe ? 'rgba(225,29,42,0.5)' : 'transparent'}`,
      }}
    >
      <div
        style={{
          width: 46,
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 700,
          fontSize: 32,
          color: medal ?? C.muted,
          textAlign: 'center',
        }}
      >
        {pos}
      </div>
      <Face url={e.avatar_url} name={e.display_name} size={62} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: isMe ? 700 : 600,
          fontSize: 30,
          color: C.ink,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {e.display_name}
        {isMe && <span style={{ color: C.brand, fontWeight: 700 }}> · you</span>}
      </div>
      <div
        style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 700,
          fontSize: 30,
          color: medal ?? C.ink,
        }}
      >
        {e.lifetime_points}
      </div>
    </div>
  )
}

/**
 * The off-screen node that becomes the shared PNG. Pure presentation — the
 * capture (and its pitfalls) lives in ShareSheet.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { variant, entries, meId, myPos, myPoints, scopeLabel, capturedAt },
  ref,
) {
  const top = entries.slice(0, variant === 'podium' ? 3 : 10)
  const meInTop = !!meId && top.some((e) => e.student_id === meId)

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
        background: `radial-gradient(1000px 620px at 78% -8%, rgba(225,29,42,0.30), transparent 62%), radial-gradient(760px 520px at 8% 104%, rgba(255,186,31,0.18), transparent 60%), ${C.bg}`,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: C.ink,
      }}
    >
      <Header scopeLabel={scopeLabel} capturedAt={capturedAt} />
      <Title sub={variant === 'podium' ? 'Top 3 this settle' : `Top ${top.length} this settle`} />

      {variant === 'podium' ? (
        <>
          <Podium entries={top} />
          <div style={{ flex: 1 }} />
          {myPos != null && <YouChip pos={myPos} points={myPoints ?? null} />}
        </>
      ) : (
        <>
          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {top.map((e, i) => (
              <RankRow key={e.student_id} e={e} pos={i + 1} isMe={e.student_id === meId} />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {/* Only call out a rank the list doesn't already show. */}
          {myPos != null && !meInTop && (
            <div style={{ marginTop: 20 }}>
              <YouChip pos={myPos} points={myPoints ?? null} />
            </div>
          )}
        </>
      )}

      <Footer />
    </div>
  )
})
