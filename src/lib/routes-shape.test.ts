import { describe, expect, it } from 'vitest'
import { isChatRoom, isGradeGrid, routeWidth } from './routes-shape'

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

describe('routeWidth', () => {
  it('gives the grade sheet the whole window', () => {
    // A grid is columns you can read; the gutter a centred layout would keep
    // is worth ~380px of them on a 1920px display.
    expect(routeWidth('/teach/grades/sec-1/sub-2/prelim')).toBe('full')
    expect(routeWidth('/teach/grades/sec-1/sub-2/overall')).toBe('full')
  })

  it('leaves the chat room on the grow-right rule', () => {
    // Deliberately NOT 'full': the room list and a room sit side by side in
    // use, and the sidebar must not shift as you move between them.
    expect(routeWidth('/app/space/chat/abc-123')).toBe('wide')
    expect(routeWidth('/teach/space/chat/abc-123')).toBe('wide')
  })

  it('leaves every other screen in the reading column', () => {
    // The one that bites: a third wide route added to only one of the two
    // layouts. Both call routeWidth, so this list is the whole contract.
    for (const p of [
      '/app',
      '/app/space',
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
