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
  }
}

export function forgetUsername(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
