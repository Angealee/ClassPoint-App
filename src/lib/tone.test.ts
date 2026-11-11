import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TONE, type ToneName } from './tone'
import { STATUS_META } from '@/components/attendance/StatusChip'

const SRC = join(process.cwd(), 'src')
const TONES = Object.keys(TONE) as ToneName[]

const RAW =
  /\b(?:bg|text|border|ring|fill|stroke|divide|shadow)-(?:emerald|sky|red|orange|zinc|slate|gray|rose|violet|indigo|purple|blue|green|yellow|amber|teal|cyan|lime|fuchsia|pink|stone|neutral)-\d{2,3}\b/

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

  it('keeps danger clear of brand red', () => {
    for (const value of Object.values(TONE.danger)) {
      expect(value, `danger must not use brand: "${value}"`).not.toMatch(/brand/)
    }
    expect(TONE.accent.text).not.toBe(TONE.danger.text)
    expect(TONE.accent.chip).not.toBe(TONE.danger.chip)
  })

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
    expect(STATUS_META.excused.tone).toBe('info')
    expect(STATUS_META.irregular.tone).toBe('neutral')
  })

  it('spreads the shared facets rather than re-typing them', () => {
    expect(STATUS_META.absent.chip).toBe(TONE.danger.chip)
    expect(STATUS_META.present.text).toBe(TONE.success.text)
  })
})

const RAW_BRAND = /-brand-(?:50|[1-9]00)\b/

describe('brand red lives in the token layer only', () => {
  it('is never referenced directly by a component', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
        const code = line.replace(/^\s*(\*|\/\/).*/, '')
        const hit = code.match(RAW_BRAND)
        if (hit) offenders.push(`${f.replace(SRC, 'src')}:${i + 1}  ${hit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('no raw palette leaks', () => {
  it('every file outside the art islands uses role tokens only', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
        const code = line.replace(/^\s*(\*|\/\/).*/, '')
        const hit = code.match(RAW)
        if (hit) offenders.push(`${f.replace(SRC, 'src')}:${i + 1}  ${hit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
