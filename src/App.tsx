import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/lib/theme'
import { AuthProvider } from '@/lib/auth'
import { ToastProvider } from '@/components/ui/Toast'
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { OfflineBanner } from '@/components/pwa/OfflineBanner'
import { router } from '@/router'

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <OfflineBanner />
          <UpdatePrompt />
          <InstallPrompt />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
