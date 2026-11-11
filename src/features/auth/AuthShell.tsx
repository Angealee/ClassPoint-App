import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Aurora } from '@/components/landing/Aurora'

interface AuthShellProps {
  title: string
  subtitle?: string
  /**
   * Optional glyph for the tile above the title — `<ShieldIcon className="h-6 w-6" />`.
   *
   * The shell owns the tile so the four auth screens cannot each invent one;
   * InstructorSignIn hand-rolled exactly this block before. Sign in passes
   * NOTHING on purpose: it is the default door, so its heading should be the
   * loudest thing on the page and the claim stub the only decorated element.
   */
  icon?: ReactNode
  children: ReactNode
  /**
   * Rendered between the card and the footer, OUTSIDE the card.
   *
   * Exists for the claim stub: it is a second door, not a form field, and
   * sitting inside the card that holds the form would say it was one.
   */
  below?: ReactNode
  footer?: ReactNode
}

/**
 * Centred layout shared by all four auth screens.
 *
 * ── WHY THE AURORA IS HERE ──────────────────────────────────────────────────
 * It is the landing page's own background, reused rather than re-invented, so
 * the screen a student lands on and the screen they sign in on belong to one
 * world. It is `pointer-events-none`, animates only transform/opacity on the
 * compositor, and the global reduced-motion block switches it off.
 *
 * It is hosted by a FULL-WIDTH root with `overflow-hidden`, not by the max-w-md
 * column: the blurs are 416px and 480px across and would be cropped to the
 * reading column otherwise. `overflow-hidden` is safe here only because nothing
 * in the auth area is `sticky` — elsewhere in the app that would break it.
 */
export function AuthShell({ title, subtitle, icon, children, below, footer }: AuthShellProps) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <Aurora />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5">
        <header className="flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="font-display text-lg font-bold tracking-tight">ClassPoint</span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 flex-col justify-center py-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {icon && (
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-accent-solid/20 bg-accent-solid/10 text-accent">
                {icon}
              </div>
            )}
            <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}

            <Card pad="roomy" className="mt-6">
              {children}
            </Card>

            {below && <div className="mt-4">{below}</div>}
            {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
