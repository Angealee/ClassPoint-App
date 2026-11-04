import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { glide, pop, settle, snap, spring, tap } from './motion'

/**
 * Guards the material layer: radius, elevation, the lit edge, texture, motion.
 *
 * `tone.test.ts` pins what the app's colours MEAN. This pins the other half of
 * the design system, and like that one it is source-text parsing with no
 * mocking, because every failure it catches is silent:
 *
 * 1. THE RADIUS TRICK. The scale works by overriding Tailwind's own
 *    `--radius-*` values so all 275 existing `rounded-*` sites move with no
 *    call site edited. The moment someone "tidies" that into a custom name
 *    (`rounded-card`), `cn()` — bare twMerge, no extendTailwindMerge — reads
 *    the unknown word after `rounded-` as a COLOUR and silently drops the
 *    size. Nothing errors; corners just quietly go square.
 *
 * 2. THE THEME SPLIT. Light carries depth with a shadow, dark carries it with
 *    a lit edge, because a black shadow on #08080b has nothing to darken and a
 *    white hairline on #ffffff is invisible. If a future edit defines only one
 *    side, that theme loses elevation entirely and the other looks fine.
 *
 * 3. GRAIN REACHING PAPER. The overlay is `position: fixed` at the top of the
 *    z ladder. Without the print guard it would print on every student report
 *    and grade sheet.
 *
 * 4. SPRING DRIFT. The whole point of naming four roles is that the fifth
 *    inline spring never gets written.
 */

const CSS = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')

/**
 * The same file with comments stripped.
 *
 * Needed because this file DOCUMENTS the techniques it forbids, so a naive
 * substring check matches the prose explaining why something was avoided and
 * fails on a correct file. Caught by this suite on its first run.
 */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

/** Same idea for a .tsx source: a guard must not fire on prose about itself. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** The declaration block for a selector, e.g. `:root` or `.dark`. */
function block(selector: string): string {
  const i = CSS.indexOf(`\n${selector} {`)
  expect(i, `${selector} block not found`).toBeGreaterThan(-1)
  const open = CSS.indexOf('{', i)
  let depth = 0
  for (let j = open; j < CSS.length; j++) {
    if (CSS[j] === '{') depth++
    else if (CSS[j] === '}' && --depth === 0) return CSS.slice(open + 1, j)
  }
  throw new Error(`unterminated ${selector}`)
}

describe('radius ladder', () => {
  // These are the values the app is designed around. Changing one is a real
  // decision; changing it by accident is what this catches.
  const EXPECTED: Record<string, string> = {
    '--radius-lg': '0.625rem',
    '--radius-xl': '0.875rem',
    '--radius-2xl': '1.125rem',
    '--radius-3xl': '1.5rem',
  }

  it('overrides Tailwind’s own scale rather than inventing a name', () => {
    for (const [token, value] of Object.entries(EXPECTED)) {
      expect(CSS, `${token} must be declared in @theme`).toContain(`${token}: ${value};`)
    }
  })

  it('introduces no custom rounded-* utility that twMerge would drop', () => {
    // A custom name would have to be defined as a utility or theme key to work
    // at all. `rounded-full` is Tailwind's own and is not a radius token.
    const custom = CSS.match(/^\.rounded-[a-z]+\s*\{/gm)
    expect(custom, `custom rounded-* utilities found: ${custom?.join(', ')}`).toBeNull()
  })
})

describe('elevation and the lit edge', () => {
  const light = block(':root')
  const dark = block('.dark')

  it('defines every elevation token in BOTH themes', () => {
    for (const t of ['--elev-shadow-1', '--elev-shadow-2', '--elev-shadow-3']) {
      expect(light, `${t} missing from :root`).toContain(t)
      expect(dark, `${t} missing from .dark`).toContain(t)
    }
  })

  it('defines the lit tokens in both themes, inert in light', () => {
    for (const t of ['--lit', '--lit-wash']) {
      expect(light, `${t} missing from :root`).toContain(t)
      expect(dark, `${t} missing from .dark`).toContain(t)
    }
    // Light mode must NOT paint a white hairline on a white card.
    expect(light).toMatch(/--lit:\s*transparent;/)
    expect(light).toMatch(/--lit-wash:\s*transparent;/)
    // Dark mode must.
    expect(dark).toMatch(/--lit:\s*rgb\(255 255 255/)
  })

  it('clips the hairline with the parent radius instead of mask-composite', () => {
    const lit = CSS.slice(CSS.indexOf('.cp-lit::before'))
    expect(lit).toContain('border-radius: inherit')
    // mask-composite's failure mode on an unsupporting engine is the element
    // disappearing outright, which is why this effect deliberately avoids it.
    // Checked against comment-stripped source: this file explains the trick it
    // refuses to use, and the prose must not fail the assertion.
    expect(CSS_CODE).not.toContain('mask-composite')
  })

  it('keeps the three elevation levels separate and single-valued', () => {
    for (const n of [1, 2, 3]) {
      expect(CSS).toContain(`.cp-elev-${n} { box-shadow: var(--elev-shadow-${n}); }`)
    }
  })
})

describe('the plate rule', () => {
  /**
   * --color-plate is declared in the FIXED @theme block so it never flips with
   * the theme: it is the one surface in the app that is always dark, which is
   * what makes the scoreboard read as an object rather than another card.
   *
   * --lit does flip, and is transparent in light mode. So a lit edge on a plate
   * surface renders for dark-mode students and silently disappears for
   * light-mode ones. Those surfaces carry a fixed `ring-1 ring-white/10`
   * instead, and that is correct rather than an oversight.
   *
   * This is an easy mistake to make while raising cards screen by screen, and
   * it is invisible in whichever theme the author happens to be using.
   */
  const FILES = ['src/features/student/HomeHero.tsx', 'src/features/student/Leaderboard.tsx']

  it('never puts a lit edge on a plate surface', () => {
    for (const f of FILES) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      for (const m of code.matchAll(/className=\{?(?:cn\()?([\s\S]{0,400}?)\}/g)) {
        const chunk = m[1]
        if (/\bto-plate\b|\bfrom-plate\b|\bbg-plate\b/.test(chunk)) {
          expect(chunk, `${f}: a plate surface must not take cp-lit`).not.toMatch(/\bcp-lit\b/)
        }
      }
    }
  })

  it('leaves the plate its own fixed highlight', () => {
    const src = readFileSync(join(process.cwd(), FILES[1]), 'utf8')
    expect(src).toMatch(/ring-1 ring-white\/10/)
  })
})

describe('repeated rows stay flat', () => {
  /**
   * Elevation only means something while it is rare, and these are the surfaces
   * most likely to be "improved" by someone applying it uniformly.
   *
   * MessageRow is the strongest case. It deliberately has NO bubble: a run of
   * messages is drawn with a 2px identity rule rather than a fill, precisely so
   * three consecutive messages do not render as three grey slabs. A lit edge or
   * a shadow per row rebuilds the bubble by another name, and the chat was
   * already reverted once for exactly that.
   *
   * PostCard, PeerCard and PeerResultCard are list items for the same reason.
   */
  const ROWS = [
    'src/components/space/MessageRow.tsx',
    'src/components/space/PostCard.tsx',
    'src/components/peer/PeerCard.tsx',
    'src/components/peer/PeerResultCard.tsx',
  ]

  it('never elevates a repeated row', () => {
    for (const f of ROWS) {
      const code = stripComments(readFileSync(join(process.cwd(), f), 'utf8'))
      expect(code, `${f}: a repeated row must stay flat`).not.toMatch(
        /elevation=\{?['"](raised|floating)/,
      )
      expect(code, `${f}: a repeated row must not take a lit edge`).not.toMatch(/\bcp-lit\b/)
    }
  })
})

describe('texture', () => {
  it('tiles the grain seamlessly', () => {
    // Without stitchTiles the noise field restarts at every tile edge and the
    // seams read as a visible 160px grid.
    expect(CSS).toContain('stitchTiles=')
  })

  it('never prints the grain', () => {
    const printBlocks = CSS.match(/@media print \{[\s\S]*?\n\}/g) ?? []
    expect(
      printBlocks.some((b) => b.includes('body::after') && b.includes('display: none')),
      'grain must be switched off in @media print',
    ).toBe(true)
  })

  it('sits at the top of the documented z ladder and never eats a tap', () => {
    const light = block(':root')
    expect(light).toContain('--z-grain')
    const after = CSS.slice(CSS.indexOf('body::after'))
    expect(after).toContain('pointer-events: none')
    expect(after).toContain('z-index: var(--z-grain)')
  })

  it('keeps the dot field off content boxes by carrying a mask', () => {
    // .cp-grid masks, and a mask applies to content as well as background, so
    // it is only ever valid on a decorative absolutely positioned child.
    const grid = CSS.slice(CSS.indexOf('.cp-grid {'))
    expect(grid).toContain('mask-image')
  })
})

describe('motion vocabulary', () => {
  it('names five distinct roles', () => {
    const values = [snap, glide, settle, tap, pop].map((t) => `${t.stiffness}/${t.damping}`)
    expect(new Set(values).size).toBe(5)
  })

  it('orders the four interface roles by how much the eye has to track', () => {
    // A value settling must be gentler than a sheet gliding, which must be
    // gentler than a control snapping, which must be gentler than a direct tap.
    // `pop` is deliberately absent: it varies on BOUNCE, not on stiffness, so
    // it has no place on this axis.
    expect(settle.stiffness).toBeLessThan(glide.stiffness!)
    expect(glide.stiffness).toBeLessThan(snap.stiffness!)
    expect(snap.stiffness).toBeLessThan(tap.stiffness!)
  })

  it('keeps pop the only role that visibly overshoots', () => {
    // The bounce IS the message for pop, and a side effect everywhere else.
    // If another role ever drops to this damping, two things that should read
    // differently start reading the same.
    for (const t of [snap, glide, settle, tap]) {
      expect(pop.damping!).toBeLessThan(t.damping!)
    }
  })

  it('keeps the house spring distinct from the named roles', () => {
    expect(spring.stiffness).toBe(260)
  })
})
