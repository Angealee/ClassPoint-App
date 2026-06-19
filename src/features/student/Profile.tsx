import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { getLevelProgress } from '@/lib/leveling'
import { useAuth } from '@/lib/auth'
import { useStudentData } from './StudentData'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function Profile() {
  const { signOut } = useAuth()
  const { loading, me, sectionName, saveDisplayName } = useStudentData()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [editOpen, setEditOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  function openEdit() {
    setName(me?.display_name ?? '')
    setEditOpen(true)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await saveDisplayName(name)
    setSaving(false)
    if (error) {
      toast(error, 'error')
      return
    }
    toast('Display name updated.', 'success')
    setEditOpen(false)
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Profile</h1>

      {loading ? (
        <Card className="h-44 animate-pulse bg-card-2" />
      ) : !me ? (
        <Card className="p-8 text-center text-sm text-muted">
          We couldn't find your student record.
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-2xl font-bold text-white">
              {initials(me.display_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-bold">{me.display_name}</p>
              <p className="text-sm text-muted">
                {sectionName(me.section_id)} · Level {getLevelProgress(me.lifetime_points).level}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <Field label="Display name" value={me.display_name} />
            <Field label="Roster name" value={me.full_name} />
            <Field label="Section" value={sectionName(me.section_id)} />
            <Field label="Total points" value={String(me.lifetime_points)} />
          </div>

          <Button variant="outline" className="mt-5 w-full" onClick={openEdit}>
            Edit display name
          </Button>
        </Card>
      )}

      <Button variant="ghost" className="w-full text-muted" onClick={onSignOut}>
        Sign out
      </Button>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit display name">
        <form onSubmit={onSave} className="space-y-4">
          <Input
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How you appear on the leaderboard"
            hint="2–40 characters. Your roster name stays private."
            autoFocus
            required
          />
          <Button type="submit" size="lg" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </Sheet>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-card-2 px-4 py-3">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  )
}
