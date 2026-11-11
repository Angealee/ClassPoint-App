import { Button } from '@/components/ui/Button'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Splash } from '@/components/layout/Splash'
import { useAuth } from '@/lib/auth'
import { parseEventPayload, parsePayload } from '@/lib/qr'
import { enqueue, syncOfflineScans } from '@/lib/offline-scans'
import { writeEventScanCapture } from '@/lib/event-scan-capture'
import { ScanIcon } from '@/components/ui/icons'

export function ScanLanding() {
  const { loading, user, role } = useAuth()
  const navigate = useNavigate()
  const capturedRef = useRef(false)
  const eventRef = useRef(false)
  const [bad, setBad] = useState(false)

  useEffect(() => {
    if (capturedRef.current) return
    capturedRef.current = true
    const hash = window.location.hash.replace(/^#/, '')
    // Class QR → the offline queue (unchanged).
    const parsed = parsePayload(hash)
    if (parsed) {
      enqueue({ sessionId: parsed.sessionId, windowIndex: parsed.windowIndex, code: parsed.code })
      return
    }
    // Global-event QR → stash for the event screen to submit.
    const ev = parseEventPayload(hash)
    if (ev) {
      eventRef.current = true
      writeEventScanCapture({ eventId: ev.eventId, windowIndex: ev.windowIndex, code: ev.code })
      return
    }
    setBad(true)
  }, [])

  // Route once auth resolves.
  useEffect(() => {
    if (bad || loading) return
    if (!user) {
      navigate('/signin', { replace: true })
      return
    }
    if (role === 'student') {
      if (eventRef.current) {
        navigate('/app/event', { replace: true })
      } else {
        void syncOfflineScans()
        navigate('/app/attendance', { replace: true })
      }
      return
    }
    // Instructor falls through to the notice below.
  }, [bad, loading, user, role, navigate])

  if (bad) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <ScanIcon className="h-9 w-9 text-muted" />
        <h1 className="font-display text-lg font-bold">Point your camera at the class QR</h1>
        <p className="max-w-xs text-sm text-muted">
          This link only works from the attendance QR your instructor is showing. Open ClassPoint
          and try the Attendance tab.
        </p>
        <Button className="mt-2" onClick={() => navigate('/app/attendance', { replace: true })}>
          Open ClassPoint
        </Button>
      </div>
    )
  }

  if (!loading && user && role === 'instructor') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <h1 className="font-display text-lg font-bold">That's the student attendance link</h1>
        <p className="max-w-xs text-sm text-muted">
          Students scan this to record their attendance. You're signed in as the instructor.
        </p>
        <Button className="mt-2" onClick={() => navigate('/teach/attendance', { replace: true })}>
          Go to Attendance
        </Button>
      </div>
    )
  }

  // Capturing / routing — brief.
  return <Splash />
}
