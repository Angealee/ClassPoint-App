import { useNavigate } from 'react-router-dom'
import { SegmentedControl } from '@/components/ui/SegmentedControl'

export type BoardKind = 'points' | 'spent'

const ROUTE: Record<BoardKind, string> = {
  points: '/app/leaderboard',
  spent: '/app/spenders',
}

/**
 * The one control that says which of the two boards you are looking at.
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * The spend board shipped reachable only through a small muted pill sitting
 * beside "Past boards", which made it read as a link to an ARCHIVE rather than
 * as the sibling ranking it is. And once you were on it, nothing said the two
 * were a set. A student could not answer "which ranking am I looking at?"
 * without reading the heading carefully.
 *
 * ── WHY IT NAVIGATES INSTEAD OF FILTERING ──────────────────────────────────
 * These are genuinely two screens, by decision — so this is a router move, not
 * local state, and each board keeps its own URL, its own back behaviour and its
 * own deep link. What the segmented control buys is that a screen CHANGE looks
 * like a tab switch, which is how it feels to a student.
 *
 * It reuses the SegmentedControl primitive rather than hand-rolling tabs: that
 * is a real `radiogroup` with `aria-checked`, so a screen reader announces
 * which board is active. Hand-rolled strips announced two unrelated buttons,
 * which is precisely the "I don't know which one I'm on" problem, in audio.
 */
export function BoardSwitcher({ value }: { value: BoardKind }) {
  const navigate = useNavigate()
  return (
    <SegmentedControl<BoardKind>
      label="Which leaderboard"
      value={value}
      onChange={(next) => {
        // Tapping the tab you are already on should do nothing at all —
        // navigating would push a duplicate history entry and make the back
        // button feel broken.
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
