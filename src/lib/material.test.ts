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

/**
 * The same CSS with every `@layer … { … }` block removed, braces matched.
 *
 * ⚠ A regex cannot do this. `@layer x \{[\s\S]*?\n\}` stops at the first
 *   `\n}`, which inside a layer is an inner RULE's closing brace — so it
 *   leaves most of the layer behind and anything checking "is this outside a
 *   layer" gets the wrong answer. That is not hypothetical: it failed the
 *   cp-tap guard below against correct CSS on the first run.
 */
function stripLayerBlocks(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const at = src.indexOf('@layer', i)
    if (at === -1) {
      out += src.slice(i)
      break
    }
    const open = src.indexOf('{', at)
    // `@layer a, b;` with no block — nothing to strip, keep walking.
    if (open === -1) {
      out += src.slice(i)
      break
    }
    out += src.slice(i, at)
    let depth = 0
    let j = open
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}' && --depth === 0) break
    }
    i = j + 1
  }
  return out
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
  const FILES = [
    'src/features/student/HomeHero.tsx',
    'src/features/student/Leaderboard.tsx',
    // 0060 — the archived student's final-standing card is the third plate
    // surface in the app, and it is on the one screen nobody on the team will
    // ever open by accident, so the guard matters more here than elsewhere.
    'src/features/student/ArchivedScreen.tsx',
  ]

  /**
   * ⚠ THIS MATCHER USED TO MISS HALF THE CALL SITES, found the only way such a
   *   thing is found: by injecting a violation and watching the test pass.
   *
   *   The first version matched `className=\{?(?:cn\()?…\}` — a BRACE
   *   expression. HomeHero and Leaderboard both wrap their plate in `cn(...)`,
   *   so it worked there and looked complete. A plain string
   *   `className="… to-plate … cp-lit"` has no braces at all and was invisible
   *   to it, which is exactly how ArchivedScreen's plate card was written.
   *
   *   Same shape as the bug tone.test.ts records about `border-t-brand-500`:
   *   a guard that enumerates one syntax silently exempts the others. So this
   *   one matches BOTH forms and the suite below proves each is caught.
   */
  const CLASSNAME_VALUES = /className=(?:"([^"]*)"|\{([\s\S]{0,600}?)\})/g

  it('never puts a lit edge on a plate surface', () => {
    for (const f of FILES) {
      const code = stripComments(readFileSync(join(process.cwd(), f), 'utf8'))
      for (const m of code.matchAll(CLASSNAME_VALUES)) {
        const chunk = m[1] ?? m[2] ?? ''
        if (/\bto-plate\b|\bfrom-plate\b|\bbg-plate\b/.test(chunk)) {
          expect(chunk, `${f}: a plate surface must not take cp-lit`).not.toMatch(/\bcp-lit\b/)
        }
      }
    }
  })

  it('sees a plate surface written as a plain string, not just inside cn()', () => {
    // The regression test for the matcher itself. Both of these must be found;
    // before the fix only the second one was.
    const asString = 'className="cp-lit rounded-2xl bg-gradient-to-br from-plate-2 to-plate"'
    const asBraces = 'className={cn("cp-lit", "from-plate-2 to-plate")}'
    for (const sample of [asString, asBraces]) {
      const found = [...sample.matchAll(CLASSNAME_VALUES)].map((m) => m[1] ?? m[2] ?? '')
      expect(found.length, `matcher missed: ${sample}`).toBe(1)
      expect(found[0]).toMatch(/\bto-plate\b/)
      expect(found[0]).toMatch(/\bcp-lit\b/)
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

describe('the tap-target helper must stay layered (Era 8.0)', () => {
  /**
   * ⚠ A SHIPPED BUG, and the cascade rule behind it is easy to walk into again.
   *
   * `.cp-tap-44` / `.cp-tap-y` set `position: relative` so the 44px pseudo
   * element has something to position against. That rule was UNLAYERED — and
   * per the CSS cascade, unlayered styles beat every LAYERED style regardless
   * of specificity or source order. `@import 'tailwindcss'` puts `.absolute`
   * in the `utilities` layer, so any element carrying both `cp-tap-*` and
   * `absolute` was silently pinned to `relative` and dropped back into the
   * document flow.
   *
   * Exactly one call site did that — Input's password reveal control — so on
   * all four auth screens the button rendered BELOW the field, left-aligned,
   * stretching the field's wrapper from 44px to 76px. Measured at 375px: the
   * button sat at x=8 with `position: relative`, where it belongs at x≈303.
   *
   * Moving the rule into `@layer components` lets a utility win, as it always
   * should have. The pseudo-elements stay unlayered on purpose — nothing
   * competes for `::before` on these.
   */
  it('declares the position rule inside @layer components', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')
    const block = css.match(/@layer components \{[\s\S]*?\n\}/)
    expect(block, 'index.css must have an @layer components block').not.toBeNull()
    expect(block![0], 'the cp-tap position rule belongs in that layer').toMatch(/\.cp-tap-y/)
    expect(block![0]).toMatch(/position:\s*relative/)
  })

  it('has no cp-tap position rule left outside a layer', () => {
    // The specific regression: the same selector re-declared unlayered would
    // beat the layered one again and nothing would look wrong in the diff.
    //
    // ⚠ Needs real brace matching. A `@layer x \{[\s\S]*?\n\}` regex stops at
    //   the FIRST `\n}`, which inside a layer is an inner rule's close — so it
    //   left most of the layer's body behind and this test failed against
    //   correct CSS. Measured the hard way: it reported the rule as unlayered
    //   while it was the first thing inside `@layer components`.
    //
    // ⚠ And it must target the rule on the ELEMENT, not the one on the
    //   pseudo-element. `.cp-tap-*::before` sets `position: absolute` and is
    //   deliberately unlayered — nothing competes for `::before` here. A
    //   single regex over the selector list matched that rule and failed
    //   against correct CSS, which is the second time this one guard has been
    //   wrong about its own subject.
    const css = stripComments(readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8'))
    const unlayered = stripLayerBlocks(css)
    const offenders: string[] = []
    for (const m of unlayered.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1]
      const body = m[2]
      const hitsTheElement = selectors
        .split(',')
        .map((s) => s.trim())
        .some((s) => /^\.cp-tap-(?:44|y)$/.test(s))
      if (hitsTheElement && /position\s*:/.test(body)) offenders.push(selectors.trim())
    }
    expect(offenders, 'a cp-tap position rule outside @layer beats every utility').toEqual([])
  })
})

describe('the rising comment column (Era 8.0)', () => {
  /**
   * ⚠ `cqh` NEEDS `container-type: size`, AND THE FAILURE IS NOT A STATIONARY
   *   PILL — which is what the first version of this comment assumed before it
   *   was measured in the browser.
   *
   *   `inline-size` establishes a query container on the INLINE axis only, so
   *   `cqh` skips the track and resolves against the small VIEWPORT. Measured:
   *   a 206px track moves a 38px pill -244px correctly and -849px under
   *   `inline-size`. So the pill travels about four times too far in the
   *   duration `flightDurationMs` derived from the track's own height, every
   *   pill moves four times too fast, and the lane-hold arithmetic — the one
   *   guarantee lib/danmaku exists to provide — silently stops holding. On
   *   screen it reads as "a bit fast".
   */
  it('gives the track container-type: size, not inline-size', () => {
    const code = stripComments(
      readFileSync(join(process.cwd(), 'src/components/leaderboard/CommentsOverlay.tsx'), 'utf8'),
    )
    expect(code).toMatch(/containerType:\s*'size'/)
    expect(code, 'inline-size would resolve cqh against the viewport').not.toMatch(
      /containerType:\s*'inline-size'/,
    )
  })

  it('keyframes the travel in cqh, and still fades at both ends', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')
    const frames = css.match(/@keyframes cp-rise \{[\s\S]*?\n\}/)
    expect(frames, 'index.css must declare @keyframes cp-rise').not.toBeNull()
    // The track's height PLUS the pill's own, so it enters and leaves fully
    // outside — the same rule flightDurationMs prices.
    expect(frames![0]).toMatch(/-100cqh\s*-\s*100%/)
    expect(frames![0]).toMatch(/opacity:\s*0/)
    expect(frames![0]).toMatch(/opacity:\s*1/)
  })

  it('left the old horizontal keyframe behind rather than keeping both', () => {
    // Two keyframes for one stream is how the component ends up referencing
    // the one nobody maintained. Comments are stripped first — index.css names
    // `cp-fly` on purpose, in the note recording what this replaced, and a
    // guard must not fire on prose about itself.
    expect(CSS_CODE).not.toMatch(/@keyframes cp-fly\b/)
    expect(CSS_CODE).not.toMatch(/\.cp-fly\b/)
    const code = stripComments(
      readFileSync(join(process.cwd(), 'src/components/leaderboard/CommentsOverlay.tsx'), 'utf8'),
    )
    expect(code).not.toMatch(/cp-fly\b/)
  })
})

describe('the first-run tour (Era 8.0)', () => {
  /**
   * The tour is the first thing a student sees, on whatever phone they own, and
   * its demos loop. The rule that keeps them cheap is that they only animate
   * what the compositor can do without layout: opacity and transform.
   *
   * ⚠ Animating `width`, `height`, `top`, `left` or a margin forces layout every
   *   frame. It looks identical on a developer's laptop and drops frames on a
   *   low-end Android — which is where the tour is most likely to be the
   *   student's first impression of the app. Nothing else would notice: the
   *   code compiles, the demo plays, only the frame rate suffers.
   */
  const DEMOS = 'src/components/tour/TourDemos.tsx'
  const ALLOWED = new Set(['opacity', 'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate'])

  /** Every key inside every `initial={{…}}` / `animate={{…}}` / `exit={{…}}`. */
  function animatedKeys(src: string): string[] {
    const keys: string[] = []
    for (const m of src.matchAll(/\b(?:initial|animate|exit)=\{\{([^}]*)\}\}/g)) {
      for (const k of m[1].matchAll(/(\w+)\s*:/g)) keys.push(k[1])
    }
    return keys
  }

  it('animates only opacity and transform', () => {
    const code = stripComments(readFileSync(join(process.cwd(), DEMOS), 'utf8'))
    const keys = animatedKeys(code)
    expect(keys.length, 'the matcher found nothing, so it would pass vacuously').toBeGreaterThan(10)
    const layout = keys.filter((k) => !ALLOWED.has(k))
    expect(layout, 'a demo animates a layout property').toEqual([])
  })

  it('has a matcher that actually sees a layout property', () => {
    // The regression test for the guard itself: a guard that finds no keys
    // passes on any input, which is the vacuous-pass hole this file keeps
    // recording. Both forms must be caught.
    expect(animatedKeys('animate={{ width: [0, 1], opacity: 1 }}')).toEqual(['width', 'opacity'])
    expect(animatedKeys('initial={{ top: 4 }} exit={{ x: 2 }}')).toEqual(['top', 'x'])
  })

  it('draws no random shapes and carries no raw palette', () => {
    // Math.random() would give a different QR on every render and trips the
    // react-hooks purity rule; a hex would not follow the theme.
    const code = stripComments(readFileSync(join(process.cwd(), DEMOS), 'utf8'))
    expect(code).not.toMatch(/Math\.random/)
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('never takes a lit edge on the tour surfaces', () => {
    // Stage is a fixed-height card on the canvas; a lit edge there would be a
    // second elevation language in a screen that is deliberately flat.
    for (const f of [DEMOS, 'src/features/student/Tour.tsx']) {
      const code = stripComments(readFileSync(join(process.cwd(), f), 'utf8'))
      expect(code, `${f} must stay flat`).not.toMatch(/\bcp-lit\b|\bcp-elev-/)
    }
  })
})

describe('the silent board (0060)', () => {
  /**
   * The empty leaderboard is ART, and the two rules it has to keep are both
   * invisible when broken.
   *
   * 1. ITS ANIMATION IS A CSS KEYFRAME, NOT FRAMER-MOTION. The global
   *    reduced-motion block in index.css switches CSS animations off; a
   *    framer-motion loop here would need its own `useReducedMotion` guard,
   *    which is the second rule nobody remembers. Same decision as `.cp-flame`
   *    and for the same reason.
   *
   * 2. IT IS TOKEN-COLOURED. PodiumBoard's medal ramps and ShareCard are
   *    declared token-free islands because a flat token cannot express a
   *    two-stop gradient and because `var(--x)` does not resolve inside
   *    modern-screenshot's cloned capture context. Neither applies here, so
   *    there is no excuse for a raw palette value — and a hardcoded hex would
   *    fail to follow the theme on the one screen a student opens for fun.
   */
  const SRC = 'src/components/leaderboard/SilentBoard.tsx'

  it('animates in CSS so reduced motion covers it', () => {
    const code = stripComments(readFileSync(join(process.cwd(), SRC), 'utf8'))
    expect(code, 'SilentBoard must not import framer-motion').not.toMatch(/framer-motion/)
    expect(code).toMatch(/cp-silent-1/)
  })

  it('declares the keyframe it uses, and only opacity', () => {
    // Opacity only: three <rect>s in one <svg> are cheap to re-composite, but a
    // transform on an SVG child has a layout-relative origin and the stands
    // would drift off their shared floor.
    const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')
    const frames = css.match(/@keyframes cp-silent \{[\s\S]*?\n\}/)
    expect(frames, 'index.css must declare @keyframes cp-silent').not.toBeNull()
    expect(frames![0]).not.toMatch(/transform/)
  })

  it('uses semantic tokens rather than a raw palette', () => {
    const code = stripComments(readFileSync(join(process.cwd(), SRC), 'utf8'))
    expect(code, 'no hardcoded hex in SilentBoard').not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(code).toMatch(/var\(--color-/)
  })

  it('outlines the stands with --muted, never --line', () => {
    /**
     * MEASURED, not stylistic. The outline is the only thing carrying the
     * shape, and on a white card in light mode `--line` (#e7e7ec) is 1.23:1 —
     * the entire podium was invisible, in exactly one theme, so it looked
     * correct to anyone working in dark mode. `--muted` is 4.83:1 there.
     *
     * The fills may stay `--card-2`: that is the app's theme split, where the
     * surface step does the work in dark and the stroke does it in light.
     */
    const code = stripComments(readFileSync(join(process.cwd(), SRC), 'utf8'))
    expect(code, 'SilentBoard must not stroke with --color-line').not.toMatch(
      /stroke="var\(--color-line\)"/,
    )
    expect(code).toMatch(/stroke="var\(--color-muted\)"/)
  })
})
