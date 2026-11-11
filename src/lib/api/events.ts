import { rpc } from './_internal'
import type {
  LoungeEvent,
  LoungeEventAnswer,
  LoungeEventSummary,
} from '@/lib/types'

interface OpenEventRow {
  id: string
  question: string
  points: number
  winner_cap: number
  has_key: boolean
  closes_at: string | null
  answer_count: number
  my_answer: string | null
  created_at: string
}

export async function getOpenEvent(): Promise<LoungeEvent | null> {
  const rows = await rpc<OpenEventRow[]>('get_open_event')
  const r = rows?.[0]
  if (!r) return null
  return {
    id: r.id,
    question: r.question,
    points: r.points,
    winnerCap: r.winner_cap,
    hasKey: !!r.has_key,
    closesAt: r.closes_at,
    answerCount: r.answer_count ?? 0,
    myAnswer: r.my_answer,
    createdAt: r.created_at,
  }
}

export async function submitEventAnswer(eventId: string, body: string): Promise<string> {
  return await rpc<string>('submit_event_answer', { p_event: eventId, p_body: body })
}

interface AnswerRow {
  id: string
  student_id: string
  display_name: string
  avatar_url: string | null
  body: string
  is_correct: boolean | null
  awarded_points: number | null
  created_at: string
}

export async function getEventAnswers(eventId: string): Promise<LoungeEventAnswer[]> {
  const rows = await rpc<AnswerRow[]>('get_event_answers', { p_event: eventId })
  return (rows ?? []).map((r) => ({
    id: r.id,
    studentId: r.student_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    body: r.body,
    isCorrect: r.is_correct,
    awardedPoints: r.awarded_points,
    createdAt: r.created_at,
  }))
}

export async function createLoungeEvent(opts: {
  question: string
  points: number
  winnerCap?: number
  answerKey?: string | null
  closesAt?: Date | null
}): Promise<string> {
  return await rpc<string>('create_lounge_event', {
    p_question: opts.question,
    p_points: opts.points,
    p_winner_cap: opts.winnerCap ?? 5,
    p_answer_key: opts.answerKey?.trim() || null,
    p_closes_at: opts.closesAt ? opts.closesAt.toISOString() : null,
  })
}

export async function closeLoungeEvent(eventId: string): Promise<number> {
  return (await rpc<number>('close_lounge_event', { p_event: eventId })) ?? 0
}

export async function awardEventAnswer(answerId: string): Promise<number> {
  return (await rpc<number>('award_event_answer', { p_answer: answerId })) ?? 0
}

interface SummaryRow {
  id: string
  question: string
  points: number
  winner_cap: number
  has_key: boolean
  closes_at: string | null
  status: string
  closed_at: string | null
  answer_count: number
  awarded_count: number
  created_at: string
}

export async function listLoungeEvents(): Promise<LoungeEventSummary[]> {
  const rows = await rpc<SummaryRow[]>('list_lounge_events')
  return (rows ?? []).map((r) => ({
    id: r.id,
    question: r.question,
    points: r.points,
    winnerCap: r.winner_cap,
    hasKey: !!r.has_key,
    closesAt: r.closes_at,
    status: r.status === 'closed' ? 'closed' : 'open',
    closedAt: r.closed_at,
    answerCount: r.answer_count ?? 0,
    awardedCount: r.awarded_count ?? 0,
    createdAt: r.created_at,
  }))
}
