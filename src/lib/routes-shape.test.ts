import { describe, expect, it } from 'vitest'
import { isChatRoom } from './routes-shape'

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
