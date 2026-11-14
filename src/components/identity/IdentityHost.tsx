import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { CLASSPOINT, INSTRUCTOR_ROLE, instructorName, instructorTitle } from '@/lib/instructor-identity'
import { useInstructorProfile } from '@/lib/useInstructorProfile'
import { ClassPointMark } from './ClassPointMark'
import { closeIdentity, useOpenIdentity } from './identity-store'

/**
 * The single host for the two identity cards. Mounted once per layout (student and instructor)
 * and driven by `openIdentity()`, so no avatar owns a sheet. Both cards are the same fixed dark
 * plate as the rest of the redesigned screens.
 */
export function IdentityHost() {
  const who = useOpenIdentity()
  const profile = useInstructorProfile()
  const instructor = who === 'instructor'

  return (
    <Sheet open={who !== null} onClose={closeIdentity} title={instructor ? INSTRUCTOR_ROLE : CLASSPOINT.name}>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-plate-2 to-plate px-5 py-6 text-center text-white ring-1 ring-white/10">
          <div className="mx-auto flex h-24 w-24 items-center justify-center">
            {instructor && profile?.avatarUrl ? (
              <Avatar name={instructorName(profile)} url={profile.avatarUrl} className="h-24! w-24!" textClassName="text-3xl" />
            ) : (
              <ClassPointMark round official={!instructor} className="h-24 w-24" />
            )}
          </div>

          <p className="mt-4 font-display text-2xl font-bold leading-tight">
            {instructor ? instructorName(profile) : CLASSPOINT.name}
          </p>
          {(!instructor || profile?.title || profile?.displayName) && (
            <p className="mt-1 text-sm font-semibold text-gold-300">
              {instructor ? instructorTitle(profile) : 'Official account'}
            </p>
          )}

          {instructor ? (
            profile?.bio && <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-white/80">{profile.bio}</p>
          ) : (
            <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-white/80">{CLASSPOINT.blurb}</p>
          )}
        </div>

        <Button size="lg" variant="outline" className="w-full" onClick={closeIdentity}>
          Done
        </Button>
      </div>
    </Sheet>
  )
}
