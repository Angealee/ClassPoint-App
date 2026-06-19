/**
 * Temporary mock data for the Phase 0 shell so the UI is visible before
 * Supabase is wired up. Replaced by live queries in later phases.
 */
export interface MockStudent {
  id: string
  name: string
  section: string
  points: number
}

export const mockMe: MockStudent = {
  id: 'me',
  name: 'Koby M.',
  section: 'BSIT 3-A',
  points: 132,
}

export const mockLeaderboard: MockStudent[] = [
  { id: '1', name: 'Aria Velasco', section: 'BSIT 3-B', points: 268 },
  { id: '2', name: 'Marc Tolentino', section: 'BSIT 3-A', points: 241 },
  { id: '3', name: 'Jules Fernandez', section: 'BSIT 2-A', points: 199 },
  { id: 'me', name: 'Koby M.', section: 'BSIT 3-A', points: 132 },
  { id: '5', name: 'Dane Cruz', section: 'BSIT 3-B', points: 121 },
  { id: '6', name: 'Pia Ramos', section: 'BSIT 2-A', points: 98 },
]

export interface MockEvent {
  id: string
  points: number
  category: 'recitation' | 'activity'
  note?: string
  at: string
}

export const mockFeed: MockEvent[] = [
  { id: 'e1', points: 5, category: 'activity', note: 'Lab 4 — top submission', at: '2h ago' },
  { id: 'e2', points: 3, category: 'recitation', note: 'Answered Big-O question', at: 'Yesterday' },
  { id: 'e3', points: 2, category: 'recitation', at: '2 days ago' },
  { id: 'e4', points: 4, category: 'activity', note: 'Quiz 2', at: '3 days ago' },
]
