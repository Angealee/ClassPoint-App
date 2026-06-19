import { cn } from '@/lib/cn'

/** ClassPoint crest — academic shield with an RPG star. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('h-8 w-8', className)}
      role="img"
      aria-label="ClassPoint"
    >
      <defs>
        <linearGradient id="logo-red" x1="96" y1="64" x2="416" y2="448" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f04452" />
          <stop offset="0.55" stopColor="#e11d2a" />
          <stop offset="1" stopColor="#a30c18" />
        </linearGradient>
        <linearGradient id="logo-gold" x1="176" y1="150" x2="336" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd770" />
          <stop offset="1" stopColor="#e8a317" />
        </linearGradient>
      </defs>
      <path
        d="M256 72l132 44v118c0 92-56 154-132 186-76-32-132-94-132-186V116l132-44z"
        fill="url(#logo-red)"
        stroke="currentColor"
        strokeOpacity="0.14"
        strokeWidth="6"
      />
      <path
        d="M256 150l27.8 56.4 62.2 9-45 43.9 10.6 61.9L256 332l-55.6 29.2 10.6-61.9-45-43.9 62.2-9z"
        fill="url(#logo-gold)"
      />
    </svg>
  )
}
