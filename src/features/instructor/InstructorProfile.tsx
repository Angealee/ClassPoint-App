import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SuccessTick } from '@/components/ui/SuccessTick'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { LogOutIcon, PencilIcon } from '@/components/ui/icons'
import { ClassPointMark } from '@/components/identity/ClassPointMark'
import { updateInstructorProfile, uploadInstructorAvatar } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { errorText } from '@/lib/errors'
import {
  CLASSPOINT,
  INSTRUCTOR_LIMITS,
  instructorName,
  instructorTitle,
  profileError,
} from '@/lib/instructor-identity'
import type { InstructorProfile as Profile } from '@/lib/types'
import { setInstructorProfile, useInstructorProfile } from '@/lib/useInstructorProfile'

const blank = (s: string): string | null => s.trim() || null

/**
 * The instructor's own profile: the person students meet in chat, comments and the Lounge. The
 * plate is a live preview of that, so what you type is what a classmate will read. ClassPoint, the
 * official voice, is explained below it because the two are easy to confuse and they speak
 * differently (announcements and events are ClassPoint; a chat message is you).
 */
export function InstructorProfile() {
  const profile = useInstructorProfile()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmPhoto, setConfirmPhoto] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)
  const [tick, setTick] = useState(false)

  async function savePhoto(url: string | null) {
    const saved = await updateInstructorProfile({
      displayName: profile?.displayName ?? null,
      title: profile?.title ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: url,
    })
    setInstructorProfile(saved)
  }

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !user) return
    setUploading(true)
    try {
      await savePhoto(await uploadInstructorAvatar(user.id, file))
      toast('Photo updated.', 'success')
    } catch (err) {
      toast(errorText(err, 'Could not update your photo.'), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function onRemovePhoto() {
    setUploading(true)
    try {
      await savePhoto(null)
      toast('Photo removed. Students see the ClassPoint logo again.', 'success')
    } catch (err) {
      toast(errorText(err, 'Could not remove your photo.'), 'error')
    } finally {
      setUploading(false)
      setConfirmPhoto(false)
    }
  }

  return (
    <div className="space-y-5">
      <ScreenTitle title="Profile" subtitle="How students see you" />

      {/* Keyed on the saved profile so a save (or the first load) re-seeds the drafts. */}
      <Editor
        key={JSON.stringify(profile)}
        profile={profile}
        uploading={uploading}
        onPickPhoto={() => fileRef.current?.click()}
        onRemovePhoto={() => setConfirmPhoto(true)}
        onSaved={() => setTick(true)}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a profile photo"
        onChange={onPickFile}
      />

      <section>
        <SectionLabel>The official voice</SectionLabel>
        <Card pad="default" className="mt-2 flex items-start gap-3">
          <ClassPointMark official round className="h-10 w-10" />
          <div className="min-w-0">
            <p className="font-semibold">{CLASSPOINT.name}</p>
            <p className="mt-0.5 text-sm text-muted">
              Announcements, events and class updates appear as ClassPoint, not as you. Your messages in chat
              and comments appear with the name and photo above.
            </p>
          </div>
        </Card>
      </section>

      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => setConfirmOut(true)}
        icon={<LogOutIcon className="h-5 w-5" />}
      >
        Sign out
      </Button>

      <ConfirmDialog
        open={confirmPhoto}
        title="Remove your photo?"
        message="Students will see the ClassPoint logo next to your messages until you add another."
        confirmLabel="Remove photo"
        busy={uploading}
        onConfirm={() => void onRemovePhoto()}
        onClose={() => setConfirmPhoto(false)}
      />
      <ConfirmDialog
        open={confirmOut}
        title="Sign out?"
        message="You will need your email and password to get back in."
        confirmLabel="Sign out"
        variant="default"
        onConfirm={() => void signOut()}
        onClose={() => setConfirmOut(false)}
      />
      <SuccessTick show={tick} onDone={() => setTick(false)} />
    </div>
  )
}

function Editor({
  profile,
  uploading,
  onPickPhoto,
  onRemovePhoto,
  onSaved,
}: {
  profile: Profile | null
  uploading: boolean
  onPickPhoto: () => void
  onRemovePhoto: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [title, setTitle] = useState(profile?.title ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const { nameMax, titleMax, bioMax } = INSTRUCTOR_LIMITS

  const draft: Profile = {
    displayName: blank(name),
    title: blank(title),
    bio: blank(bio),
    avatarUrl: profile?.avatarUrl ?? null,
  }
  const error = profileError({ displayName: name, title, bio })
  const dirty =
    draft.displayName !== (profile?.displayName ?? null) ||
    draft.title !== (profile?.title ?? null) ||
    draft.bio !== (profile?.bio ?? null)
  const shownName = instructorName(draft)

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (error || saving) return
    setSaving(true)
    try {
      setInstructorProfile(await updateInstructorProfile(draft))
      onSaved()
    } catch (err) {
      toast(errorText(err, 'Could not save your profile.'), 'error')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-plate-2 to-plate px-5 pb-6 pt-7 text-center text-white ring-1 ring-white/10">
        <div className="relative mx-auto h-24 w-24">
          {draft.avatarUrl ? (
            <Avatar name={shownName} url={draft.avatarUrl} className="h-24 w-24" textClassName="text-3xl" />
          ) : (
            <ClassPointMark round className="h-24 w-24" />
          )}
          <button
            type="button"
            onClick={onPickPhoto}
            disabled={uploading}
            aria-label={draft.avatarUrl ? 'Change your photo' : 'Add a photo'}
            className="cp-tap-44 absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-950 shadow-md ring-2 ring-plate focus:outline-none focus-visible:ring-ring disabled:opacity-60"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 break-words font-display text-2xl font-bold leading-tight">{shownName}</p>
        {(draft.title || draft.displayName) && (
          <p className="mt-1 text-sm font-semibold text-gold-300">{instructorTitle(draft)}</p>
        )}
        {draft.bio ? (
          <p className="mx-auto mt-4 max-w-xs break-words text-sm leading-relaxed text-white/80">{draft.bio}</p>
        ) : (
          <p className="mx-auto mt-4 max-w-xs text-sm text-white/55">
            Add a line about yourself. Students see it when they tap your photo.
          </p>
        )}
        {draft.avatarUrl && (
          <button
            type="button"
            onClick={onRemovePhoto}
            disabled={uploading}
            className="cp-tap-y mt-3 text-xs font-medium text-white/55 underline-offset-2 hover:text-white hover:underline disabled:opacity-60"
          >
            Remove photo
          </button>
        )}
      </div>

      <form onSubmit={onSave} className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, nameMax))}
          placeholder="Instructor"
          hint={`${name.length}/${nameMax} · shown beside your messages. Leave blank to show “Instructor”.`}
        />
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, titleMax))}
          placeholder="Instructor"
          hint={`${title.length}/${titleMax} · for example “IT 32 · Platform Technologies”.`}
        />
        <div className="w-full">
          <Textarea
            id="instructor-bio"
            label="Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, bioMax))}
            placeholder="A short line students see on your card."
            rows={3}
          />
          <p className="mt-1.5 text-right text-xs tabular-nums text-muted">
            {bio.length}/{bioMax}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={!dirty || !!error || saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
      </form>
    </>
  )
}
