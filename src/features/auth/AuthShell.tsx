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
  icon?: ReactNode
  children: ReactNode
  below?: ReactNode
  footer?: ReactNode
}

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
