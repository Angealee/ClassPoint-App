import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { instructorName } from '@/lib/instructor-identity'
import { useInstructorProfile } from '@/lib/useInstructorProfile'
import { ClassPointMark } from './ClassPointMark'
import { openIdentity } from './identity-store'

/*
 * The instructor's face wherever they speak: their photo when they set one, the ClassPoint logo
 * until then (so a half-set-up profile is never a bare initial). Tapping opens the instructor's
 * card. `interactive={false}` is for a spot that is itself already a button (a flying comment).
 */
export function InstructorAvatar({
  className,
  interactive = true,
}: {
  /** Size classes; defaults to 28px. */
  className?: string
  interactive?: boolean
}) {
  const profile = useInstructorProfile()
  const name = instructorName(profile)

  const face = profile?.avatarUrl ? (
    <Avatar name={name} url={profile.avatarUrl} className={cn('h-7 w-7', className)} textClassName="text-2xs" />
  ) : (
    <ClassPointMark round className={className} />
  )

  if (!interactive) return face
  return (
    <button
      type="button"
      onClick={() => openIdentity('instructor')}
      aria-label={`${name}, profile`}
      className="inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {face}
    </button>
  )
}
