
export function normalizeAnswer(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCorrectAnswer(body: string, answerKey: string): boolean {
  const key = normalizeAnswer(answerKey)
  if (key === '') return false
  return normalizeAnswer(body) === key
}

export interface AnswerLike {
  id: string
  body: string
  createdAt: string
}

export function pickWinners<T extends AnswerLike>(
  answers: T[],
  answerKey: string | null,
  winnerCap: number,
): T[] {
  if (!answerKey) return []
  const cap = Math.max(0, Math.floor(winnerCap))
  if (cap === 0) return []

  return [...answers]
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id.localeCompare(b.id)
        : a.createdAt.localeCompare(b.createdAt),
    )
    .filter((a) => isCorrectAnswer(a.body, answerKey))
    .slice(0, cap)
}
