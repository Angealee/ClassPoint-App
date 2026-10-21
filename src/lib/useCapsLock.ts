import { useState, type KeyboardEvent } from 'react'

/**
 * Detects Caps Lock from a field's own key events.
 *
 * Spread `capsProps` onto the PIN input; read `capsOn` to show the hint. There
 * is no global listener — `getModifierState` is only reliable on a real key
 * event, and a phone's on-screen keyboard reports nothing, so this is inert
 * exactly where it has nothing to warn about (a phone has no caps lock).
 */
export function useCapsLock() {
  const [capsOn, setCapsOn] = useState(false)
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.('CapsLock') ?? false)
  }
  return { capsOn, capsProps: { onKeyUp: onKey, onKeyDown: onKey } }
}
