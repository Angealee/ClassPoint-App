import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TONE, type ToneName } from './tone'
import { STATUS_META } from '@/components/attendance/StatusChip'

/**
 * Guards the semantic colour layer.
 *
 * Two things are worth a test here, and neither is about taste.
 *
 * 1. The DEMOTION. Brand red used to mean "bad" (absent, rejected, a penalty)
 *    and "good" (a rank climb, the Activities category, an active nav item) at
 *    the same time. Separating them is only worth anything if it STAYS
 *    separated — one hand-typed `text-brand-500` on a penalty chip and red goes
 *    back to meaning nothing in particular.
 *
 * 2. The LEAK. 111 raw-palette colours were replaced with role tokens. Nothing
 *    stops the 112th being typed tomorrow, and it would look almost right —
 *    `--success-solid` IS emerald-500 — while quietly opting that one element
 *    out of every future theme change.
 *
 * Pure source-text parsing, no mocking, in the spirit of the other pure-lib
 * suites. It cannot check what a colour LOOKS like; it checks that the app has
 * exactly one place where that question is answered.
 */

const SRC = join(process.cwd(), 'src')
const TONES = Object.keys(TONE) as ToneName[]

/** Raw Tailwind palette families. `brand` and `gold` are the app's OWN scales
 *  (declared in @theme), so they are legitimate — these are not. */
const RAW = /\b(?:bg|text|border|ring|fill|stroke|divide)-(?:emerald|sky|red|orange|zinc|slate|gray|rose|violet|indigo|purple|blue|green|yellow|amber|teal|cyan|lime|fuchsia|pink|stone|neutral)-\d{2,3}\b/

/**
 * Deliberate token-free islands, each for a reason that a test must not
 * "fix" away:
 *  ShareCard    — inline styles + a hard-coded palette, because var(--x) does
 *                 not resolve inside modern-screenshot's cloned capture
 *                 context. Tokenising it exports a black or transparent image.
 *  PodiumBoard  — the medal ramps are two-stop gradients (from-zinc-200
 *                 to-zinc-500) plus the ink that sits on them. Bespoke art.
 *  BadgeArt     — per-rarity gradient art, same reasoning.
 */
const ART_ISLANDS = ['ShareCard.tsx', 'PodiumBoard.tsx', 'BadgeArt.tsx']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const FILES = walk(SRC).filter((f) => !ART_ISLANDS.some((a) => f.endsWith(a)))

describe('TONE', () => {
  it('defines all four facets for every role', () => {
    for (const name of TONES) {
      const t = TONE[name]
      for (const facet of ['chip', 'dot', 'solid', 'text'] as const) {
        expect(t[facet], `${name}.${facet}`).toBeTruthy()
      }
    }
  })

  it('is built only from role tokens — never the raw palette', () => {
    for (const name of TONES) {
      for (const [facet, value] of Object.entries(TONE[name])) {
        expect(RAW.test(value), `${name}.${facet} = "${value}"`).toBe(false)
      }
    }
  })

  /**
   * THE demotion invariant. `danger` and `accent` are both reds; if danger ever
   * borrows a brand class they collapse back into one colour and a "−5" chip
   * looks like an active tab again.
   */
  it('keeps danger clear of brand red', () => {
    for (const value of Object.values(TONE.danger)) {
      expect(value, `danger must not use brand: "${value}"`).not.toMatch(/brand/)
    }
    expect(TONE.accent.text).not.toBe(TONE.danger.text)
    expect(TONE.accent.chip).not.toBe(TONE.danger.chip)
  })

  /**
   * Tailwind's scanner only sees COMPLETE class strings in source. A value
   * assembled as `bg-${role}-solid/10` generates no CSS at all and the element
   * renders with no background — which looks like a layout bug, not a colour one.
   */
  it('has no interpolated class strings', () => {
    const src = readFileSync(join(SRC, 'lib', 'tone.ts'), 'utf8')
    const table = src.slice(src.indexOf('export const TONE'))
    expect(table).not.toMatch(/\$\{/)
  })
})

describe('attendance status roles', () => {
  it('maps each status to the role its meaning demands', () => {
    expect(STATUS_META.present.tone).toBe('success')
    expect(STATUS_META.late.tone).toBe('warn')
    // Was brand-500 — the same colour as an active nav item.
    expect(STATUS_META.absent.tone).toBe('danger')
    // Neutral by design: a legitimate pass, not a reward and not a punishment.
    expect(STATUS_META.excused.tone).toBe('info')
    expect(STATUS_META.irregular.tone).toBe('neutral')
  })

  it('spreads the shared facets rather than re-typing them', () => {
    expect(STATUS_META.absent.chip).toBe(TONE.danger.chip)
    expect(STATUS_META.present.text).toBe(TONE.success.text)
  })
})

describe('no raw palette leaks', () => {
  it('every file outside the art islands uses role tokens only', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
        // Skip prose: several comments quote the old colours as history.
        const code = line.replace(/^\s*(\*|\/\/).*/, '')
        const hit = code.match(RAW)
        if (hit) offenders.push(`${f.replace(SRC, 'src')}:${i + 1}  ${hit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
