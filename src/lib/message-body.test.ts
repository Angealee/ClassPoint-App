import { describe, expect, it } from 'vitest'
import { looksLikeArt, parseInline, parseMessageBody } from './message-body'

describe('looksLikeArt', () => {
  it('detects a multi-line drawing', () => {
    const art = [
      "        ,d''''b.",
      "   .-''`      `''-.",
      "  /   .-'''-.      \\",
      " |  .'       '.    |",
      "  \\  '._____.'    /",
      "   '-.._______..-'",
    ].join('\n')
    expect(looksLikeArt(art)).toBe(true)
  })

  it('does NOT fire on an emoji wall', () => {
    // The failure that would look like a bug nobody reports: a wall of emoji
    // rendered in a scrollable monospace block.
    const wall = ('😂😅😊😎🥳🤩😍🥰😘🙂'.repeat(12) + '\n').repeat(4)
    expect(looksLikeArt(wall)).toBe(false)
  })

  it('does not fire on ordinary prose, however punctuated', () => {
    const prose =
      'sir, yung similar sana sa dc — HAHAHAHA!\nd naman siguro kakasuhan ng discord (right?)'
    expect(looksLikeArt(prose)).toBe(false)
  })

  it('needs a newline — one long line of symbols is key-mashing, not art', () => {
    expect(looksLikeArt('-'.repeat(200))).toBe(false)
  })

  it('ignores anything too short to be a drawing', () => {
    expect(looksLikeArt('/\\\n\\/')).toBe(false)
  })
})

describe('parseMessageBody', () => {
  it('returns nothing for an empty body', () => {
    expect(parseMessageBody('')).toEqual([])
    expect(parseMessageBody(null)).toEqual([])
  })

  it('leaves plain text alone', () => {
    expect(parseMessageBody('hello there')).toEqual([{ kind: 'text', content: 'hello there' }])
  })

  it('splits a fenced block out of surrounding text', () => {
    const got = parseMessageBody('try this:\n```\nconst x = 1\n```\nworks?')
    expect(got.map((p) => p.kind)).toEqual(['text', 'mono', 'text'])
    expect(got[1].content).toBe('const x = 1')
  })

  it('handles a message that is only a fenced block', () => {
    expect(parseMessageBody('```\nSELECT 1\n```')).toEqual([{ kind: 'mono', content: 'SELECT 1' }])
  })

  it('treats an UNCLOSED fence as literal text', () => {
    // Otherwise typing ``` mid-sentence silently swallows the rest of what you
    // wrote, and you cannot see that it happened.
    const got = parseMessageBody('what does ``` even do')
    expect(got).toEqual([{ kind: 'text', content: 'what does ``` even do' }])
  })

  it('promotes unfenced art to a mono block', () => {
    const art = "|''''|\n|....|\n|____|\n|::::|\n|----|\n|====|\n|####|\n|~~~~|"
    expect(parseMessageBody(art).map((p) => p.kind)).toEqual(['mono'])
  })
})

describe('parseInline', () => {
  const NAMES = ['Maria Santos', 'Maria', 'CEO']

  it('leaves ordinary text as one plain token', () => {
    expect(parseInline('just talking', NAMES)).toEqual([{ kind: 'plain', content: 'just talking' }])
  })

  it('finds a link and keeps the words either side', () => {
    const got = parseInline('read https://dct.edu.ph/rules then reply')
    expect(got.map((t) => t.kind)).toEqual(['plain', 'link', 'plain'])
    expect(got[1]).toEqual({
      kind: 'link',
      content: 'https://dct.edu.ph/rules',
      href: 'https://dct.edu.ph/rules',
    })
  })

  it('gives a bare www. link an https href', () => {
    const [t] = parseInline('www.dct.edu.ph')
    expect(t).toEqual({ kind: 'link', content: 'www.dct.edu.ph', href: 'https://www.dct.edu.ph' })
  })

  it('does not swallow the full stop at the end of a sentence', () => {
    const got = parseInline('see https://dct.edu.ph.')
    expect(got[1].content).toBe('https://dct.edu.ph')
    expect(got[2]).toEqual({ kind: 'plain', content: '.' })
  })

  it('NEVER links a javascript: or data: URL', () => {
    // The matched text becomes an href, so a loose scheme would turn any
    // message into a script the reader taps. This is the load-bearing one.
    for (const evil of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      expect(parseInline(`click ${evil}`).every((t) => t.kind === 'plain')).toBe(true)
    }
  })

  it('styles a mention only when the name is a real person', () => {
    expect(parseInline('@CEO look', NAMES)[0]).toEqual({ kind: 'mention', content: '@CEO' })
    expect(parseInline('@everyone look', NAMES).every((t) => t.kind === 'plain')).toBe(true)
  })

  it('prefers the LONGER name at the same spot', () => {
    // "@Maria Santos" must not render as a mention of "Maria" followed by the
    // stray word "Santos" — the same trap mentions.ts fixed by consuming.
    const got = parseInline('hi @Maria Santos', NAMES)
    expect(got.find((t) => t.kind === 'mention')?.content).toBe('@Maria Santos')
  })

  it('does not match a mention mid-word or inside an email', () => {
    expect(parseInline('koby@ceo.com', NAMES).every((t) => t.kind !== 'mention')).toBe(true)
    expect(parseInline('x@CEOx', NAMES).every((t) => t.kind !== 'mention')).toBe(true)
  })

  it('does not let a name inside a URL split the link', () => {
    const got = parseInline('https://x.com/@CEO/posts', NAMES)
    expect(got).toEqual([
      { kind: 'link', content: 'https://x.com/@CEO/posts', href: 'https://x.com/@CEO/posts' },
    ])
  })

  it('styles nothing when no names are supplied', () => {
    expect(parseInline('@CEO hello')).toEqual([{ kind: 'plain', content: '@CEO hello' }])
  })
})
