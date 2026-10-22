// Mirrors the SQL name-composition logic in 0059_structured_names.
// Change one side, change the other, same commit (the lounge-answers.ts rule).

export interface NameParts {
  lastName: string
  firstName: string
  middleName?: string | null
  suffix?: string | null
}

/** "Dela Cruz, Juan M." or "Dela Cruz, Juan M. Jr." — sort key, official. */
export function officialName(p: NameParts): string {
  const mi = middleInitial(p.middleName)
  return (
    p.lastName.trim() +
    ', ' +
    p.firstName.trim() +
    (mi ? ' ' + mi : '') +
    (p.suffix?.trim() ? ' ' + p.suffix.trim() : '')
  )
}

/** "Juan Dela Cruz" or "Juan Dela Cruz Jr." — social, NO middle initial. */
export function socialName(p: NameParts): string {
  return (
    p.firstName.trim() +
    ' ' +
    p.lastName.trim() +
    (p.suffix?.trim() ? ' ' + p.suffix.trim() : '')
  )
}

/** "JD" from "Juan Dela Cruz" — first letter of each space-separated word. */
export function initialsOf(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 2)
}

function middleInitial(middle?: string | null): string | null {
  const t = middle?.trim()
  if (!t) return null
  return t[0].toUpperCase() + '.'
}
