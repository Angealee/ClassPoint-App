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
import { AuthTransitionProvider } from '@/components/auth/AuthTransition'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <PwaInstallProvider>
            <AuthProvider>
              <AuthTransitionProvider>
                <RouterProvider router={router} />
              </AuthTransitionProvider>
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
