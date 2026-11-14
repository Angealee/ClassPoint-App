import { describe, expect, it } from 'vitest'
import { isChatRoom, isGradeGrid, isOpsScreen, routeWidth } from './routes-shape'

describe('isChatRoom', () => {
  it('matches a room under BOTH mounts', () => {
    expect(isChatRoom('/app/space/chat/abc-123')).toBe(true)
    expect(isChatRoom('/teach/space/chat/abc-123')).toBe(true)
  })

  it('does NOT widen the room LIST', () => {
    expect(isChatRoom('/app/space/chats')).toBe(false)
    expect(isChatRoom('/teach/space/chats')).toBe(false)
  })

  it('leaves every other screen alone', () => {
    for (const p of ['/app', '/app/space', '/app/space/lounge', '/teach', '/teach/space']) {
      expect(isChatRoom(p)).toBe(false)
    }
  })

  it('needs a room id, not a trailing slash', () => {
    expect(isChatRoom('/app/space/chat/')).toBe(false)
    expect(isChatRoom('/app/space/chat')).toBe(false)
  })
})

describe('isGradeGrid', () => {
  it('matches one grade sheet', () => {
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/finals')).toBe(true)
  })

  it('does NOT widen the landing list', () => {
    expect(isGradeGrid('/teach/grades')).toBe(false)
    expect(isGradeGrid('/teach/grades/')).toBe(false)
  })

  it('needs all three segments', () => {
    expect(isGradeGrid('/teach/grades/sec-1')).toBe(false)
    expect(isGradeGrid('/teach/grades/sec-1/sub-2')).toBe(false)
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/finals/extra')).toBe(false)
  })

  it('matches the Overall tab too', () => {
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/overall')).toBe(true)
  })

  it('does NOT match the print route', () => {
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/print')).toBe(false)
  })

  it('does not match an unknown tab', () => {
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/summer')).toBe(false)
  })
})

describe('routeWidth', () => {
  it('gives the grade sheet the whole window', () => {
    expect(routeWidth('/teach/grades/sec-1/sub-2/prelim')).toBe('full')
    expect(routeWidth('/teach/grades/sec-1/sub-2/overall')).toBe('full')
  })

  it('leaves the chat room on the grow-right rule', () => {
    expect(routeWidth('/app/space/chat/abc-123')).toBe('wide')
    expect(routeWidth('/teach/space/chat/abc-123')).toBe('wide')
  })

  it('gives the Student Space home the wide two-column layout', () => {
    expect(routeWidth('/app/space')).toBe('wide')
    expect(routeWidth('/app/space/')).toBe('wide')
  })

  it('leaves every other screen in the reading column', () => {
    for (const p of [
      '/app',
      '/app/space/lounge',
      '/app/space/chats',
      '/teach',
      '/teach/space',
      '/teach/space/chats',
      '/teach/grades',
      '/teach/grades/sec-1/sub-2/print',
    ]) {
      expect(routeWidth(p), p).toBe('reading')
    }
  })
})

describe('isOpsScreen', () => {
  it('widens Ops and nothing near it', () => {
    expect(isOpsScreen('/teach/ops')).toBe(true)
    expect(isOpsScreen('/teach/ops/')).toBe(true)
    expect(routeWidth('/teach/ops')).toBe('wide')
    expect(isOpsScreen('/teach/semesters')).toBe(false)
    expect(isOpsScreen('/teach/ops/extra')).toBe(false)
  })
})
