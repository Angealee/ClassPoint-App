import { useNavigate } from 'react-router-dom'
import { SegmentedControl } from '@/components/ui/SegmentedControl'

export type BoardKind = 'points' | 'spent'

const ROUTE: Record<BoardKind, string> = {
  points: '/app/leaderboard',
  spent: '/app/spenders',
}

export function BoardSwitcher({ value }: { value: BoardKind }) {
  const navigate = useNavigate()
  return (
    <SegmentedControl<BoardKind>
      label="Which leaderboard"
      value={value}
      onChange={(next) => {
        if (next === value) return
        navigate(ROUTE[next])
      }}
      options={[
        { value: 'points', label: 'Points' },
        { value: 'spent', label: 'Spent' },
      ]}
    />
  )
}
