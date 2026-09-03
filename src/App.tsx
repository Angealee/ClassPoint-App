import { MotionConfig } from 'framer-motion'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/lib/theme'
import { AuthProvider } from '@/lib/auth'
import { PwaInstallProvider } from '@/lib/pwa'
import { ToastProvider } from '@/components/ui/Toast'
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { OfflineBanner } from '@/components/pwa/OfflineBanner'
import { router } from '@/router'
import { Analytics } from "@vercel/analytics/next"

export default function App() {
  return (
    // reducedMotion="user" honours the OS setting across EVERY framer-motion
    // animation in the app. The CSS reset in styles/index.css only neutralises
    // CSS transitions — JS-driven transforms bypass it entirely, and only 5 of
    // the 26 files using motion called useReducedMotion themselves. This is the
    // one-line fix for the other 21 (sheets, toasts, bursts, live roster rows).
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <PwaInstallProvider>
            <AuthProvider>
              <RouterProvider router={router} />
              <Analytics />
              <OfflineBanner />
              <UpdatePrompt />
              <InstallPrompt />
            </AuthProvider>
          </PwaInstallProvider>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}
