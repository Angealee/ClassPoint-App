import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const FILES = walk(SRC).filter((f) => !f.endsWith('router.tsx'))

function hasInboundLink(path: string): boolean {
  return FILES.some((f) => {
    const src = readFileSync(f, 'utf8')
    return src.includes(`'${path}'`) || src.includes(`"${path}"`)
  })
}

const MUST_BE_LINKED = [
  // Student
  '/app/points',
  '/app/space',
  '/app/space/lounge',
  '/app/space/chats',
  '/app/profile',
  '/app/history',
  '/app/achievements',
  '/app/attendance/stats',
  '/app/settings',
  '/app/grades',
  '/app/peer',
  '/app/spenders',
  '/app/event',
  // Instructor
  '/teach/ops',
  '/teach/peer',
  '/teach/space',
  '/teach/space/chats',
  '/teach/redemptions',
  '/teach/semesters',
  '/teach/event',
  '/teach/grades',
]

describe('route reachability', () => {
  it.each(MUST_BE_LINKED)('%s is reachable from somewhere in the app', (path) => {
    expect(hasInboundLink(path)).toBe(true)
  })
})
