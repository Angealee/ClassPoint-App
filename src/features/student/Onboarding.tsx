import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { BoltIcon, StarIcon, TrophyIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

const STEPS = [
  {
    Icon: BoltIcon,
    tone: 'gold' as const,
    title: 'Earn points',
    body: "Your instructor awards points for reciting and joining activities. Every point counts, build your confidence. Basagin mo itlog mo.",
  },
  {
    Icon: StarIcon,
    tone: 'brand' as const,
    title: 'Level up',
    body: 'Points become XP and fill your level bar. Keep earning to climb from Level 1 upward.',
  },
  {
    Icon: TrophyIcon,
    tone: 'gold' as const,
    title: 'Climb the leaderboard',
    body: 'Leaderboard updates at 12:30 PM and 7:30 PM. Reach the top 3 to stand on the winners’ podium.',
  },
]

const TONE = {
  gold: 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
  brand: 'bg-brand-500/10 text-brand-500',
}

/** First-run intro for new students: points → levels → leaderboard. */
export function Onboarding({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const s = STEPS[step]

  return (
    <Sheet open={open} onClose={onDone} title="Welcome to ClassPoint">
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className={cn('flex h-16 w-16 items-center justify-center rounded-2xl', TONE[s.tone])}>
            <s.Icon className="h-8 w-8" />
          </span>
          <h3 className="font-display text-lg font-bold">{s.title}</h3>
          <p className="max-w-xs text-sm leading-relaxed text-muted">{s.body}</p>
        </div>

        <div className="flex justify-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-5 bg-brand-500' : 'w-1.5 bg-line',
              )}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button className="flex-1" onClick={() => (last ? onDone() : setStep(step + 1))}>
            {last ? "Let's go" : 'Next'}
          </Button>
        </div>

        {!last && (
          <button
            type="button"
            onClick={onDone}
            className="w-full text-center text-xs font-medium text-muted hover:text-ink"
          >
            Skip
          </button>
        )}
      </div>
    </Sheet>
  )
}
