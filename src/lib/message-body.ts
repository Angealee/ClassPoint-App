/**
 * Splitting a message into plain-text and monospace parts.
 *
 * Two ways a block becomes monospace:
 *   1. EXPLICIT — wrapped in ``` fences, like Discord. Always wins.
 *   2. DETECTED — the text is mostly line-art characters. Beta testers paste
 *      ASCII art, and proportional wrapping turns it into noise.
 *
 * ⚠ THE DETECTOR MUST NOT FIRE ON AN EMOJI WALL. Emoji are not in the art
 * character class, so the ratio stays near zero — that is the property the test
 * pins, because a wall of 😂 rendered in a scrollable mono block would look
 * broken in a way nobody would think to report.
 */

export interface BodyPart {
  kind: 'text' | 'mono'
  content: string
}

/** Box drawing, block elements, and the punctuation ASCII art is built from. */
// Note the ordering rules inside a character class: `-` sits LAST so it needs
// no escape, `]` and `\` are escaped, and `^` is not first. Getting any of
// those wrong is a runtime SyntaxError, not a type error.
const ART_RE = /[─-▟■-◿`'".,:;^~|/\\_#*+=<>(){}\][-]/gu

/**
 * Thresholds, picked by MEASURING rather than by feel. Non-space characters,
 * against the fixtures in the test:
 *
 *   a drawn figure   0.97      an emoji wall   0.00
 *   a bar pattern    1.00      ordinary prose  0.04
 *
 * The gap is enormous, so 0.5 sits nowhere near either population and the
 * exact value does not matter much. The LENGTH floor does: at 60 it rejected
 * both real drawings above (48 and 59 dense characters), which is how a
 * threshold chosen by intuition fails.
 */
const ART_RATIO = 0.5
const ART_MIN_CHARS = 40

/**
 * Is this block ASCII art rather than a sentence?
 *
 * Requires a newline as well as the ratio: a single long line of punctuation is
 * far more likely to be someone mashing keys than a drawing, and turning it
 * monospace would be a strange thing to do to it.
 */
export function looksLikeArt(text: string): boolean {
  if (!text.includes('\n')) return false
  const dense = text.replace(/\s/g, '')
  if (dense.length < ART_MIN_CHARS) return false
  const art = dense.match(ART_RE)?.length ?? 0
  return art / dense.length >= ART_RATIO
}

/**
 * Break a body into renderable parts.
 *
 * Fences are matched in pairs; an UNCLOSED fence is treated as literal text
 * rather than swallowing the rest of the message, because the common cause is
 * someone typing ``` mid-sentence and the alternative silently eats what they
 * wrote.
 */
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
