import { PodiumBoard } from '@/components/leaderboard/PodiumBoard'
import type { LeaderboardEntry } from '@/lib/types'

const mock: LeaderboardEntry[] = [
  { student_id: '1', display_name: 'Maya Santos', section_id: 's', lifetime_points: 324, rank: 1, avatar_url: null },
  { student_id: '2', display_name: 'Juan Dela Cruz', section_id: 's', lifetime_points: 298, rank: 2, avatar_url: null },
  { student_id: '3', display_name: 'Aisha Reyes', section_id: 's', lifetime_points: 271, rank: 3, avatar_url: null },
  { student_id: '4', display_name: 'Ben Tan', section_id: 's', lifetime_points: 240, rank: 4, avatar_url: null },
  { student_id: '5', display_name: 'Carlo Lim', section_id: 's', lifetime_points: 212, rank: 5, avatar_url: null },
  { student_id: '6', display_name: 'Dina Cruz', section_id: 's', lifetime_points: 188, rank: 6, avatar_url: null },
]

export function PodiumPreview() {
  return (
    <div className="mx-auto max-w-md p-4">
      <PodiumBoard entries={mock} meId="4" sectionName={() => '2A'} showSection />
    </div>
  )
}
