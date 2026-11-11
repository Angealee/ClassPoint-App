/**
 * The last username that signed in or claimed, on THIS device.
 *
 * ── WHAT IS AND IS NOT STORED ────────────────────────────────────────────────
 * The username only. The PIN is never written anywhere — the whole point of a
 * PIN is that the device does not hold it. This saves a returning student one
 * field on their own phone; "Not you?" clears it. Same posture as every other
 * per-viewer convenience in the app (the chat draft, the seen-level baseline):
 * localStorage, wrapped so a private window or cleared storage degrades to the
 * empty field rather than throwing.
 */
const KEY = 'cp_last_username_v1'

export function getRememberedUsername(): string {
  try {
    return window.localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberUsername(username: string): void {
  try {
    const u = username.trim().toLowerCase()
    if (u) window.localStorage.setItem(KEY, u)
  } catch {
    // A student who cannot persist this simply retypes it next time.
  }
}

export function forgetUsername(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
