import { useState, type KeyboardEvent } from 'react'

export function useCapsLock() {
  const [capsOn, setCapsOn] = useState(false)
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.('CapsLock') ?? false)
  }
  return { capsOn, capsProps: { onKeyUp: onKey, onKeyDown: onKey } }
}
