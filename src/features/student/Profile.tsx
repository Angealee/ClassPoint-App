import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { getLevelProgress } from '@/lib/leveling'
import { mockMe } from '@/lib/mock'
import { useAuth } from '@/lib/auth'

export function Profile() {
  const progress = getLevelProgress(mockMe.points)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  async function onSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Profile</h1>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-2xl font-bold text-white">
            {mockMe.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </span>
          <div>
            <p className="font-display text-xl font-bold">{mockMe.name}</p>
            <p className="text-sm text-muted">{mockMe.section} · Level {progress.level}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Field label="Display name" value={mockMe.name} />
          <Field label="Section" value={mockMe.section} />
        </div>

        <Button variant="outline" className="mt-5 w-full" disabled>
          Edit profile (coming in Phase 4)
        </Button>
      </Card>

      <Button variant="ghost" className="w-full text-muted" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-card-2 px-4 py-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
