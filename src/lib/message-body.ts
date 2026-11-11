
export interface BodyPart {
  kind: 'text' | 'mono'
  content: string
}

export type InlineToken =
  | { kind: 'plain'; content: string }
  | { kind: 'link'; content: string; href: string }
  | { kind: 'mention'; content: string }

const ART_RE = /[─-▟■-◿`'".,:;^~|/\\_#*+=<>(){}\][-]/gu

const ART_RATIO = 0.5
const ART_MIN_CHARS = 40

export function looksLikeArt(text: string): boolean {
  if (!text.includes('\n')) return false
  const dense = text.replace(/\s/g, '')
  if (dense.length < ART_MIN_CHARS) return false
  const art = dense.match(ART_RE)?.length ?? 0
  return art / dense.length >= ART_RATIO
}

export function parseMessageBody(body: string | null | undefined): BodyPart[] {
  const text = body ?? ''
  if (text === '') return []

  const parts: BodyPart[] = []
  const fence = /```([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', content: text.slice(last, m.index) })
    parts.push({ kind: 'mono', content: m[1].replace(/^\n/, '').replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', content: text.slice(last) })

  // Promote any remaining plain part that is really a drawing.
  return parts
    .map((p) =>
      p.kind === 'text' && looksLikeArt(p.content)
        ? { kind: 'mono' as const, content: p.content.replace(/^\n+|\n+$/g, '') }
        : p,
    )
    .filter((p) => p.content.trim() !== '' || p.kind === 'mono')
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>()[\]{}"'`]+/gi
const URL_TRAIL_RE = /[.,!?;:]+$/

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Hit {
  start: number
  end: number
  token: InlineToken
}

export function parseInline(text: string, names: readonly string[] = []): InlineToken[] {
  if (text === '') return []
  const hits: Hit[] = []

  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].replace(URL_TRAIL_RE, '')
    if (raw === '') continue
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    hits.push({ start: m.index, end: m.index + raw.length, token: { kind: 'link', content: raw, href } })
  }

  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (name.trim() === '') continue
    const re = new RegExp(`(^|[^\\w@])(@${escapeRe(name)})(?![\\w])`, 'gi')
    for (const m of text.matchAll(re)) {
      const start = m.index + m[1].length
      hits.push({ start, end: start + m[2].length, token: { kind: 'mention', content: m[2] } })
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end)

  const out: InlineToken[] = []
  let at = 0
  for (const h of hits) {
    if (h.start < at) continue
    if (h.start > at) out.push({ kind: 'plain', content: text.slice(at, h.start) })
    out.push(h.token)
    at = h.end
  }
  if (at < text.length) out.push({ kind: 'plain', content: text.slice(at) })
  return out
}
