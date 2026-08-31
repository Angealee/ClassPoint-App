import { forwardRef } from 'react'
import type { LeaderboardEntry } from '@/lib/types'

/**
 * A social story: 1080×1920, exactly 9:16.
 *
 * This is the size Instagram, Facebook and WhatsApp Stories expect, so it fills
 * the screen with no bars and no crop. A literal Galaxy S22 panel (1080×2340,
 * 19.5:9) is TALLER than a story — posted as one it would be letterboxed, or
 * cropped through the header and footer.
 *
 * Rendered at full size off-screen; the sheet previews it scaled down.
 */
export const CARD_W = 1080
export const CARD_H = 1920

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
  /**
   * Who moved up most since the last settle. Computed by the caller from the
   * FULL ranked list, not from the top ten — the biggest climber is usually
   * someone still working their way up, which is the point of showing them.
   */
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
/**
 * A drawn crown rather than the 👑 emoji.
 *
 * Emoji render from a font, and which font varies by the capturing device — so
 * the exported image could show an Apple crown, a Google one, or a tofu box
 * depending on whose phone made it. A path always looks the same.
 */
function Crown() {
  return (
    <svg
      width={72}
      height={56}
      viewBox="0 0 24 18"
      fill="none"
      style={{ display: 'block', marginBottom: 10 }}
    >
      <path
        d="M2 4.5 L6.2 9 L12 2 L17.8 9 L22 4.5 L20.2 15.5 H3.8 Z"
        fill="#ffba1f"
        stroke="#b97d00"
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The single most story-worthy thing a leaderboard produces, and it was sitting
 * unused in the data: `previous_rank` has been stored since 0037 and nothing
 * ever surfaced who moved. It also gives students outside the top three a
 * reason to care about the image.
 */
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
            fontFamily: '"Space Grotesk", sans-serif',
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

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const [first, second, third] = entries
  // Faces are the largest thing on the podium: the app has real photos, and a
  // winner's face makes this worth posting in a way a number does not.
  const cols = [
    { e: second, place: 2, h: 132, face: 176 },
    { e: first, place: 1, h: 186, face: 232 },
    { e: third, place: 3, h: 104, face: 176 },
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
          {place === 1 && <Crown />}
          <Face url={e!.avatar_url} name={e!.display_name} size={face} />
          <div
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: place === 1 ? 38 : 30,
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
              fontSize: place === 1 ? 34 : 28,
              fontWeight: 700,
              color: RANK_COLOR[place - 1],
              marginTop: 4,
            }}
          >
            {e!.points}
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

/**
 * A ranked row, at one of two densities.
 *
 * `compact` sits under the podium in the podium story, where the three stands
 * have already used most of the height. `roomy` is the whole list story, where
 * ten compact rows left a 448px void — so the rows take the height rather than
 * the padding taking it.
 */
function RankRow({
  e,
  pos,
  isMe,
  density = 'compact',
}: {
  e: LeaderboardEntry
  pos: number
  isMe: boolean
  density?: 'compact' | 'roomy'
}) {
  const medal = pos <= 3 ? RANK_COLOR[pos - 1] : null
  const roomy = density === 'roomy'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: roomy ? 24 : 20,
        padding: roomy ? '18px 22px' : '11px 20px',
        borderRadius: 18,
        background: isMe ? 'rgba(225,29,42,0.16)' : 'transparent',
        border: `2px solid ${isMe ? 'rgba(225,29,42,0.5)' : 'transparent'}`,
      }}
    >
      <div
        style={{
          width: roomy ? 54 : 46,
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 700,
          fontSize: roomy ? 38 : 32,
          color: medal ?? C.muted,
          textAlign: 'center',
        }}
      >
        {pos}
      </div>
      <Face url={e.avatar_url} name={e.display_name} size={roomy ? 76 : 56} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: isMe ? 700 : 600,
          fontSize: roomy ? 34 : 30,
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
          fontSize: roomy ? 34 : 30,
          color: medal ?? C.ink,
        }}
      >
        {e.points}
      </div>
    </div>
  )
}

/**
 * The off-screen node that becomes the shared PNG. Pure presentation — the
 * capture (and its pitfalls) lives in ShareSheet.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { variant, entries, meId, myPos, myPoints, scopeLabel, capturedAt, climber },
  ref,
) {
  const top = entries.slice(0, 10)
  const meInTop = !!meId && top.some((e) => e.student_id === meId)
  // The podium story shows the top three on the stand AND the rest of the ten
  // below it — a story canvas has the height for the whole board, and the whole
  // board is what makes the image worth posting.
  const rest = variant === 'podium' ? top.slice(3) : []

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
      <Title sub={`Top ${top.length} this settle`} />

      {variant === 'podium' ? (
        <>
          <Podium entries={top.slice(0, 3)} />
          {rest.length > 0 && (
            <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {rest.map((e, i) => (
                <RankRow key={e.student_id} e={e} pos={i + 4} isMe={e.student_id === meId} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {top.map((e, i) => (
            <RankRow
              key={e.student_id}
              e={e}
              pos={i + 1}
              isMe={e.student_id === meId}
              density="roomy"
            />
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {climber && <ClimberBanner climber={climber} />}

      {/* Only call out a rank the list doesn't already show. */}
      {myPos != null && !meInTop && (
        <div style={{ marginTop: 20 }}>
          <YouChip pos={myPos} points={myPoints ?? null} />
        </div>
      )}

      <Footer />
    </div>
  )
})
