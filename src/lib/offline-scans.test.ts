import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The offline attendance queue — the only thing standing between a student with
 * no signal and a lost check-in.
 *
 * `submitOfflineScan` is mocked so the state machine can be driven directly:
 * server outcomes vs transport failures behave very differently, and only one
 * of them is allowed to keep the proof queued for a later retry.
 */
const submitOfflineScan = vi.fn()
vi.mock('@/lib/api', () => ({
  submitOfflineScan: (...args: unknown[]) => submitOfflineScan(...args),
}))

/** A minimal localStorage good enough for the module under test. */
function installStorage() {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  })
  return map
}

let mod: typeof import('./offline-scans')

beforeEach(async () => {
  installStorage()
  vi.stubGlobal('crypto', {
    ...globalThis.crypto,
    randomUUID: () => `id-${Math.random().toString(36).slice(2)}`,
  })
  submitOfflineScan.mockReset()
  // Fresh module per test: the queue keeps module-level state (memory fallback,
  // the `syncing` reentrancy guard) that must not leak between cases.
  vi.resetModules()
  mod = await import('./offline-scans')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('enqueue', () => {
  it('captures a scan as queued with zero attempts', () => {
    const entry = mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'abc' })
    expect(entry.state).toBe('queued')
    expect(entry.attempts).toBe(0)
    expect(mod.loadQueue()).toHaveLength(1)
  })

  it('survives a reload — the capture is written synchronously', async () => {
    mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'abc' })
    vi.resetModules()
    const reloaded = await import('./offline-scans')
    expect(reloaded.loadQueue()).toHaveLength(1)
  })

  it('dedupes a re-scan of the same session, keeping the FRESHER window', () => {
    mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'old' })
    mod.enqueue({ sessionId: 's1', windowIndex: 11, code: 'new' })
    const queue = mod.loadQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].windowIndex).toBe(11)
    expect(queue[0].code).toBe('new')
  })

  it('keeps separate sessions separate', () => {
    mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'a' })
    mod.enqueue({ sessionId: 's2', windowIndex: 10, code: 'b' })
    expect(mod.loadQueue()).toHaveLength(2)
  })

  it('does not overwrite an already-resolved entry for the same session', async () => {
    mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'a' })
    submitOfflineScan.mockResolvedValue({ outcome: 'recorded', status: 'present', topic: null })
    await mod.syncOfflineScans()
    // A second scan of the same class creates a NEW queued entry rather than
    // reopening the resolved one.
    mod.enqueue({ sessionId: 's1', windowIndex: 12, code: 'b' })
    const queue = mod.loadQueue()
    expect(queue).toHaveLength(2)
    expect(queue.filter((e) => e.state === 'recorded')).toHaveLength(1)
  })
})

describe('dismiss', () => {
  it('removes only the named entry', () => {
    const a = mod.enqueue({ sessionId: 's1', windowIndex: 1, code: 'a' })
    mod.enqueue({ sessionId: 's2', windowIndex: 1, code: 'b' })
    mod.dismiss(a.id)
    expect(mod.loadQueue().map((e) => e.sessionId)).toEqual(['s2'])
  })
})

describe('syncOfflineScans', () => {
  it('marks a recorded scan resolved and keeps it until dismissed', async () => {
    mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'abc' })
    submitOfflineScan.mockResolvedValue({ outcome: 'recorded', status: 'present', topic: 'Lecture' })

    expect(await mod.syncOfflineScans()).toBe(true)
    const [entry] = mod.loadQueue()
    expect(entry.state).toBe('recorded')
    expect(entry.outcome).toBe('recorded')
    expect(entry.resultStatus).toBe('present')
    expect(entry.syncedAt).toBeTruthy()
  })

  it.each(['upgraded', 'already'] as const)('treats "%s" as resolved, not failed', async (o) => {
    mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'abc' })
    submitOfflineScan.mockResolvedValue({ outcome: o, status: 'late', topic: null })
    await mod.syncOfflineScans()
    expect(mod.loadQueue()[0].state).toBe('recorded')
  })

  it.each(['expired', 'invalid', 'session_missing', 'wrong_section'] as const)(
    'treats "%s" as terminal — never retried',
    async (o) => {
      mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'abc' })
      submitOfflineScan.mockResolvedValue({ outcome: o, status: null, topic: null })
      await mod.syncOfflineScans()
      expect(mod.loadQueue()[0].state).toBe('failed')

      // A second run must not resubmit a terminal failure.
      submitOfflineScan.mockClear()
      await mod.syncOfflineScans()
      expect(submitOfflineScan).not.toHaveBeenCalled()
    },
  )

  it('KEEPS the proof queued when the network fails', async () => {
    // The single most important behaviour here: a transport error must never
    // discard a capture, or the student silently loses their attendance.
    mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'abc' })
    submitOfflineScan.mockRejectedValue(new Error('Failed to fetch'))

    expect(await mod.syncOfflineScans()).toBe(false)
    const [entry] = mod.loadQueue()
    expect(entry.state).toBe('queued')
    expect(entry.attempts).toBe(1)
  })

  it('stops the run on the first transport failure instead of hammering', async () => {
    mod.enqueue({ sessionId: 's1', windowIndex: 1, code: 'a' })
    mod.enqueue({ sessionId: 's2', windowIndex: 1, code: 'b' })
    submitOfflineScan.mockRejectedValue(new Error('offline'))

    await mod.syncOfflineScans()
    // One attempt, then break — the device is offline, the rest would fail too.
    expect(submitOfflineScan).toHaveBeenCalledTimes(1)
    expect(mod.loadQueue().every((e) => e.state === 'queued')).toBe(true)
  })

  it('retries a previously-failed transport on the next run', async () => {
    mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'abc' })
    submitOfflineScan.mockRejectedValueOnce(new Error('offline'))
    await mod.syncOfflineScans()
    expect(mod.loadQueue()[0].state).toBe('queued')

    submitOfflineScan.mockResolvedValue({ outcome: 'recorded', status: 'present', topic: null })
    expect(await mod.syncOfflineScans()).toBe(true)
    expect(mod.loadQueue()[0].state).toBe('recorded')
  })

  it('reports no change when the queue is empty', async () => {
    expect(await mod.syncOfflineScans()).toBe(false)
    expect(submitOfflineScan).not.toHaveBeenCalled()
  })

  it('ignores an entry dismissed mid-flight', async () => {
    const entry = mod.enqueue({ sessionId: 's1', windowIndex: 10, code: 'abc' })
    submitOfflineScan.mockImplementation(async () => {
      mod.dismiss(entry.id) // the student taps away while the request is open
      return { outcome: 'recorded', status: 'present', topic: null }
    })
    await mod.syncOfflineScans()
    expect(mod.loadQueue()).toHaveLength(0)
  })
})
