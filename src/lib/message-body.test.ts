import { describe, expect, it } from 'vitest'
import { looksLikeArt, parseMessageBody } from './message-body'

describe('looksLikeArt', () => {
  it('detects a multi-line drawing', () => {
    const art = [
      "        ,d''''b.",
      "   .-''`      `''-.",
      "  /   .-'''-.      \\",
      " |  .'       '.    |",
      "  \  '._____.'    /",
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
    expect(looksLikeArt('/\\n\/')).toBe(false)
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
