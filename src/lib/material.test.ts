import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { glide, pop, settle, snap, spring, tap } from './motion'

const CSS = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')

const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

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
    expect(CSS_CODE).not.toContain('mask-composite')
  })

  it('keeps the three elevation levels separate and single-valued', () => {
    for (const n of [1, 2, 3]) {
      expect(CSS).toContain(`.cp-elev-${n} { box-shadow: var(--elev-shadow-${n}); }`)
    }
  })
})

describe('the plate rule', () => {
  const FILES = [
    'src/features/student/HomeHero.tsx',
    'src/features/student/Leaderboard.tsx',
    'src/features/student/ArchivedScreen.tsx',
  ]

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
    expect(settle.stiffness).toBeLessThan(glide.stiffness!)
    expect(glide.stiffness).toBeLessThan(snap.stiffness!)
    expect(snap.stiffness).toBeLessThan(tap.stiffness!)
  })

  it('keeps pop the only role that visibly overshoots', () => {
    for (const t of [snap, glide, settle, tap]) {
      expect(pop.damping!).toBeLessThan(t.damping!)
    }
  })

  it('keeps the house spring distinct from the named roles', () => {
    expect(spring.stiffness).toBe(260)
  })
})

describe('the tap-target helper must stay layered (Era 8.0)', () => {
  it('declares the position rule inside @layer components', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')
    const block = css.match(/@layer components \{[\s\S]*?\n\}/)
    expect(block, 'index.css must have an @layer components block').not.toBeNull()
    expect(block![0], 'the cp-tap position rule belongs in that layer').toMatch(/\.cp-tap-y/)
    expect(block![0]).toMatch(/position:\s*relative/)
  })

  it('has no cp-tap position rule left outside a layer', () => {
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
    expect(frames![0]).toMatch(/-100cqh\s*-\s*100%/)
    expect(frames![0]).toMatch(/opacity:\s*0/)
    expect(frames![0]).toMatch(/opacity:\s*1/)
  })

  it('left the old horizontal keyframe behind rather than keeping both', () => {
    expect(CSS_CODE).not.toMatch(/@keyframes cp-fly\b/)
    expect(CSS_CODE).not.toMatch(/\.cp-fly\b/)
    const code = stripComments(
      readFileSync(join(process.cwd(), 'src/components/leaderboard/CommentsOverlay.tsx'), 'utf8'),
    )
    expect(code).not.toMatch(/cp-fly\b/)
  })
})

describe('the first-run tour (Era 8.0)', () => {
  const DEMOS = 'src/components/tour/TourDemos.tsx'
  const ALLOWED = new Set(['opacity', 'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate'])

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
    expect(animatedKeys('animate={{ width: [0, 1], opacity: 1 }}')).toEqual(['width', 'opacity'])
    expect(animatedKeys('initial={{ top: 4 }} exit={{ x: 2 }}')).toEqual(['top', 'x'])
  })

  it('draws no random shapes and carries no raw palette', () => {
    const code = stripComments(readFileSync(join(process.cwd(), DEMOS), 'utf8'))
    expect(code).not.toMatch(/Math\.random/)
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('never takes a lit edge on the tour surfaces', () => {
    for (const f of [DEMOS, 'src/features/student/Tour.tsx']) {
      const code = stripComments(readFileSync(join(process.cwd(), f), 'utf8'))
      expect(code, `${f} must stay flat`).not.toMatch(/\bcp-lit\b|\bcp-elev-/)
    }
  })
})

describe('the silent board (0060)', () => {
  const SRC = 'src/components/leaderboard/SilentBoard.tsx'

  it('animates in CSS so reduced motion covers it', () => {
    const code = stripComments(readFileSync(join(process.cwd(), SRC), 'utf8'))
    expect(code, 'SilentBoard must not import framer-motion').not.toMatch(/framer-motion/)
    expect(code).toMatch(/cp-silent-1/)
  })

  it('declares the keyframe it uses, and only opacity', () => {
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
    const code = stripComments(readFileSync(join(process.cwd(), SRC), 'utf8'))
    expect(code, 'SilentBoard must not stroke with --color-line').not.toMatch(
      /stroke="var\(--color-line\)"/,
    )
    expect(code).toMatch(/stroke="var\(--color-muted\)"/)
  })
})
