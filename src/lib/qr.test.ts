import { describe, expect, it } from 'vitest'
import {
  QR_STEP_SECONDS,
  buildCore,
  buildPayload,
  computeCode,
  currentWindow,
  parsePayload,
  secondsUntilRotate,
} from './qr'

describe('computeCode', () => {
  it('is deterministic for the same secret, session and window', async () => {
    const a = await computeCode('test-secret', 'session-abc', 12345)
    const b = await computeCode('test-secret', 'session-abc', 12345)
    expect(a).toBe(b)
  })

  it('produces 16 lowercase hex chars (the SQL takes the same slice)', async () => {
    const code = await computeCode('test-secret', 'session-abc', 12345)
    expect(code).toMatch(/^[0-9a-f]{16}$/)
  })

  it('changes when the window advances — this is what defeats a screenshot', async () => {
    const now = await computeCode('test-secret', 'session-abc', 12345)
    const next = await computeCode('test-secret', 'session-abc', 12346)
    expect(now).not.toBe(next)
  })

  it('changes when the session differs, so a code cannot cross classes', async () => {
    const a = await computeCode('test-secret', 'session-abc', 12345)
    const b = await computeCode('test-secret', 'session-xyz', 12345)
    expect(a).not.toBe(b)
  })

  it('changes when the secret differs', async () => {
    const a = await computeCode('secret-one', 'session-abc', 12345)
    const b = await computeCode('secret-two', 'session-abc', 12345)
    expect(a).not.toBe(b)
  })

  it('matches the documented SQL derivation (regression pin)', async () => {
    const code = await computeCode('test-secret', 'session-abc', 12345)
    expect(code).toBe('921a4f81e804a748')
  })
})

describe('currentWindow / secondsUntilRotate', () => {
  const BOUNDARY = 1_700_000_010_000

  it('ticks once per QR_STEP_SECONDS', () => {
    const w = currentWindow(BOUNDARY)
    expect(currentWindow(BOUNDARY + (QR_STEP_SECONDS - 1) * 1000)).toBe(w)
    expect(currentWindow(BOUNDARY + QR_STEP_SECONDS * 1000)).toBe(w + 1)
  })

  it('counts down within the step and never returns 0', () => {
    const stepMs = QR_STEP_SECONDS * 1000
    expect(secondsUntilRotate(BOUNDARY)).toBe(QR_STEP_SECONDS)
    expect(secondsUntilRotate(BOUNDARY + 1000)).toBe(QR_STEP_SECONDS - 1)
    expect(secondsUntilRotate(BOUNDARY + stepMs - 1)).toBe(1)
  })
})

describe('parsePayload', () => {
  const core = buildCore('session-abc', 12345, 'deadbeefcafe0001')

  it('parses the legacy bare CP1 form', () => {
    expect(parsePayload(core)).toEqual({
      sessionId: 'session-abc',
      windowIndex: 12345,
      code: 'deadbeefcafe0001',
    })
  })

  it('parses the deep-link URL a native camera opens', () => {
    const url = buildPayload('session-abc', 12345, 'deadbeefcafe0001')
    expect(parsePayload(url)).toEqual({
      sessionId: 'session-abc',
      windowIndex: 12345,
      code: 'deadbeefcafe0001',
    })
  })

  it('survives an origin that itself contains a #', () => {
    expect(parsePayload(`https://example.com/#/scan#${core}`)).not.toBeNull()
  })

  it('tolerates the whitespace a camera app can append', () => {
    expect(parsePayload(`  ${core}\n`)).not.toBeNull()
  })

  it('rejects anything that is not ours', () => {
    expect(parsePayload('https://example.com')).toBeNull()
    expect(parsePayload('')).toBeNull()
    expect(parsePayload('CP1|only|three')).toBeNull()
    expect(parsePayload('CP2|session|1|code')).toBeNull()
    expect(parsePayload('CP1|session|1|code|extra')).toBeNull()
  })

  it('rejects a payload with an empty session or code', () => {
    expect(parsePayload('CP1||12345|code')).toBeNull()
    expect(parsePayload('CP1|session|12345|')).toBeNull()
  })

  it('rejects a non-numeric window', () => {
    expect(parsePayload('CP1|session|abc|code')).toBeNull()
    expect(parsePayload('CP1|session|Infinity|code')).toBeNull()
  })

  it('accepts exponent notation as a finite window (documents current behaviour)', () => {
    expect(parsePayload('CP1|session|1e5|code')?.windowIndex).toBe(100000)
  })
})

describe('buildPayload', () => {
  it('embeds the core in the fragment so it never reaches a server log', () => {
    const url = buildPayload('session-abc', 7, 'code')
    expect(url).toContain('/scan#')
    expect(url.split('#')[1]).toBe(buildCore('session-abc', 7, 'code'))
  })
})
