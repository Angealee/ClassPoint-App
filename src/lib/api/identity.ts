import { supabase } from '@/lib/supabase'
import { AVATAR_MAX_PX, downscaleImage } from '@/lib/images'
import type { InstructorProfile } from '@/lib/types'
import { rpc } from './_internal'

type Raw = Partial<Record<keyof InstructorProfile, string | null>> | null

const shape = (raw: Raw): InstructorProfile | null =>
  raw
    ? {
        displayName: raw.displayName ?? null,
        title: raw.title ?? null,
        bio: raw.bio ?? null,
        avatarUrl: raw.avatarUrl ?? null,
      }
    : null

/** Anyone signed in may read the four public fields (0071). Null before the migration lands. */
export async function getInstructorProfile(): Promise<InstructorProfile | null> {
  return shape(await rpc<Raw>('get_instructor_profile'))
}

export async function updateInstructorProfile(input: InstructorProfile): Promise<InstructorProfile> {
  const saved = shape(
    await rpc<Raw>('update_instructor_profile', {
      p_display_name: input.displayName,
      p_title: input.title,
      p_bio: input.bio,
      p_avatar_url: input.avatarUrl,
    }),
  )
  if (!saved) throw new Error('Could not save your profile.')
  return saved
}

/**
 * The instructor's photo goes in their own uid folder of the avatars bucket, which the 0007
 * policy already allows for any signed-in user. Returns the public URL; saving it onto the
 * profile is a separate call so a failed upload never half-edits the profile.
 */
export async function uploadInstructorAvatar(userId: string, original: File): Promise<string> {
  const file = await downscaleImage(original, AVATAR_MAX_PX)
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${userId}/instructor-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
  if (error) throw error
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}
