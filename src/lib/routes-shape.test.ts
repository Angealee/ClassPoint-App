import { describe, expect, it } from 'vitest'
import { isChatRoom, isGradeGrid, isWideRoute } from './routes-shape'

describe('isChatRoom', () => {
  it('matches a room under BOTH mounts', () => {
    // ChatRoom is mounted twice — students under /app, the instructor under
    // /teach — and the layout width must agree in both places.
    expect(isChatRoom('/app/space/chat/abc-123')).toBe(true)
    expect(isChatRoom('/teach/space/chat/abc-123')).toBe(true)
  })

  it('does NOT widen the room LIST', () => {
    // /chats is the list of rooms and stays in the reading column; widening it
    // would stretch a stack of rows across a 1440px display for nothing.
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
    // /teach/grades is a stack of section cards; stretching it across a 1440px
    // display helps nobody. Same split as the chat room and its room list.
    expect(isGradeGrid('/teach/grades')).toBe(false)
    expect(isGradeGrid('/teach/grades/')).toBe(false)
  })

  it('needs all three segments', () => {
    expect(isGradeGrid('/teach/grades/sec-1')).toBe(false)
    expect(isGradeGrid('/teach/grades/sec-1/sub-2')).toBe(false)
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/finals/extra')).toBe(false)
  })

  it('matches the Overall tab too', () => {
    // It rides the same :term segment so one route serves all four views.
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/overall')).toBe(true)
  })

  it('does NOT match the print route', () => {
    // The real shape: /teach/grades/<section>/<subject>/print is ALSO three
    // segments, so a wildcard matched it. Shell never renders there, so a true
    // is dead code — and a predicate answering for a URL it does not describe
    // is how the next reader gets misled.
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/print')).toBe(false)
  })

  it('does not match an unknown tab', () => {
    expect(isGradeGrid('/teach/grades/sec-1/sub-2/summer')).toBe(false)
  })
})

describe('isWideRoute', () => {
  it('covers both wide screens', () => {
    expect(isWideRoute('/app/space/chat/abc-123')).toBe(true)
    expect(isWideRoute('/teach/space/chat/abc-123')).toBe(true)
    expect(isWideRoute('/teach/grades/sec-1/sub-2/prelim')).toBe(true)
  })

  it('leaves every other screen alone', () => {
    // The one that bites: a third wide route added to only one of the two
    // layouts. Both call isWideRoute, so this list is the whole contract.
    for (const p of [
      '/app',
      '/app/space',
      '/app/space/lounge',
      '/app/space/chats',
      '/teach',
      '/teach/space',
      '/teach/space/chats',
      '/teach/grades',
    ]) {
      expect(isWideRoute(p), p).toBe(false)
    }
  })
})
