
export interface NameParts {
  lastName: string
  firstName: string
  middleName?: string | null
  suffix?: string | null
}

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

export function socialName(p: NameParts): string {
  return (
    p.firstName.trim() +
    ' ' +
    p.lastName.trim() +
    (p.suffix?.trim() ? ' ' + p.suffix.trim() : '')
  )
}

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
