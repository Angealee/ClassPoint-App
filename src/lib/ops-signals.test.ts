import { describe, expect, it } from 'vitest'
import type { AuthEvent, BackupHealth } from '@/lib/types'
import {
  attentionItems,
  authByDay,
  authLast24h,
  cleanSearch,
  hotIps,
  isOpsTab,
  staleBackups,
} from './ops-signals'

const NOW = new Date(2026, 10, 14, 15, 0).getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const DAY = 86_400_000

function ev(over: Partial<AuthEvent>): AuthEvent {
  return { id: 1, at: ago(MIN), kind: 'claim', success: false, ip: '1.1.1.1', userAgent: null, studentId: null, detail: null, ...over }
}

describe('staleBackups', () => {
  const row = (lastSnapshot: string | null): BackupHealth => ({ tableName: 't', lastSnapshot, rowCount: 1, snapshotDays: 14 })
  it('is behind when older than yesterday or never taken', () => {
    const today = new Date(NOW).toISOString().slice(0, 10)
    const yesterday = new Date(NOW - DAY).toISOString().slice(0, 10)
    const old = new Date(NOW - 3 * DAY).toISOString().slice(0, 10)
    expect(staleBackups([row(today), row(yesterday), row(old), row(null)], NOW)).toHaveLength(2)
  })
})

describe('hotIps', () => {
  it('needs five fresh failures from one address', () => {
    const five = Array.from({ length: 5 }, (_, i) => ev({ id: i }))
    expect(hotIps(five, NOW)).toEqual([['1.1.1.1', 5]])
    expect(hotIps(five.slice(0, 4), NOW)).toEqual([])
  })
  it('ignores old failures, successes and the limiter itself', () => {
    const noise = [
      ...Array.from({ length: 5 }, (_, i) => ev({ id: i, at: ago(20 * MIN) })),
      ...Array.from({ length: 5 }, (_, i) => ev({ id: 10 + i, success: true })),
      ...Array.from({ length: 5 }, (_, i) => ev({ id: 20 + i, detail: 'rate_limited' })),
    ]
    expect(hotIps(noise, NOW)).toEqual([])
  })
})

describe('authByDay / authLast24h', () => {
  it('gives one entry per day, quiet ones included, oldest first', () => {
    const days = authByDay([ev({ at: ago(2 * DAY), success: true })], NOW, 7)
    expect(days).toHaveLength(7)
    expect(days[6].day > days[0].day).toBe(true)
    expect(days.reduce((n, d) => n + d.ok, 0)).toBe(1)
    expect(days.filter((d) => d.ok + d.failed + d.limited === 0)).toHaveLength(6)
  })
  it('counts rate-limited apart from ordinary failures', () => {
    const s = authLast24h([ev({}), ev({ detail: 'rate_limited' }), ev({ success: true }), ev({ at: ago(2 * DAY) })], NOW)
    expect(s).toEqual({ ok: 1, failed: 1, limited: 1 })
  })
})

describe('attentionItems', () => {
  it('drops zeros and unreadable sources, in urgency order', () => {
    const items = attentionItems({ requests: 2, finalize: 1, risk: 0, backup: null, signins: 3 })
    expect(items.map((i) => i.key)).toEqual(['finalize', 'requests', 'signins'])
  })
  it('is empty when everything is clear', () => {
    expect(attentionItems({ requests: 0, finalize: 0, risk: 0, backup: 0, signins: 0 })).toEqual([])
  })
})

describe('misc', () => {
  it('recognises tab names', () => {
    expect(isOpsTab('health')).toBe(true)
    expect(isOpsTab('nope')).toBe(false)
    expect(isOpsTab(null)).toBe(false)
  })
  it('strips characters that would break an or() filter', () => {
    expect(cleanSearch('a,b(c)%d*')).toBe('a b c d')
  })
})
