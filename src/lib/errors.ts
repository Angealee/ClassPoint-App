const MAX_SERVER_MESSAGE = 160

export function errorText(e: unknown, fallback: string): string {
  const message = (e as { message?: string } | null)?.message
  return message && message.length <= MAX_SERVER_MESSAGE ? message : fallback
}
