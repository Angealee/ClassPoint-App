
export type RouteWidth = 'reading' | 'wide' | 'full'

export function isChatRoom(pathname: string): boolean {
  return /\/space\/chat\/[^/]+$/.test(pathname)
}

export function isGradeGrid(pathname: string): boolean {
  return /^\/teach\/grades\/[^/]+\/[^/]+\/(prelim|midterm|finals|overall)$/.test(pathname)
}

export function routeWidth(pathname: string): RouteWidth {
  if (isGradeGrid(pathname)) return 'full'
  if (isChatRoom(pathname)) return 'wide'
  return 'reading'
}
