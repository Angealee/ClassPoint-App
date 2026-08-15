/**
 * Turning a thrown value into something worth showing a user.
 *
 * Most failures in this app come from a SECURITY DEFINER function that raised a
 * deliberate, human-readable message ("You already have 3 requests waiting.",
 * "Pick a subject for this class."). Those are the most useful thing we can
 * possibly say, so they're shown verbatim.
 *
 * The length guard is what keeps that safe: anything longer than a sentence is
 * almost certainly a raw Postgres/PostgREST dump (constraint violations, stack
 * context, socket noise) and gets replaced by the caller's plain-language
 * fallback. Six copies of this lived across the codebase before it moved here.
 */
const MAX_SERVER_MESSAGE = 160

export function errorText(e: unknown, fallback: string): string {
  const message = (e as { message?: string } | null)?.message
  return message && message.length <= MAX_SERVER_MESSAGE ? message : fallback
}
