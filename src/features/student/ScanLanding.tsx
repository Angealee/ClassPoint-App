import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Splash } from '@/components/layout/Splash'
import { useAuth } from '@/lib/auth'
import { parsePayload } from '@/lib/qr'
import { enqueue, syncOfflineScans } from '@/lib/offline-scans'
import { ScanIcon } from '@/components/ui/icons'

/**
 * Landing route for a NATIVE camera scan of the attendance QR (which now encodes
 * `…/scan#CP1|…`). Public on purpose — a logged-out or not-yet-installed student
 * must land somewhere.
 *
 * Capture-first: the proof is queued the instant we parse it, BEFORE anything
 * else, so the 15-second window can't expire while the student signs in. If
 * they're a signed-in student we push the sync and drop them on Attendance; if
 * signed out we send them to sign-in, and the app-start sync (StudentData)
 * submits the queued proof once they're in — status still counts from the
 * captured window, however long login took.
 */
export function ScanLanding() {
  const { loading, user, role } = useAuth()
  const navigate = useNavigate()
  const capturedRef = useRef(false)
  const [bad, setBad] = useState(false)

  // Capture the proof once, immediately, independent of auth state.
  useEffect(() => {
    if (capturedRef.current) return
    capturedRef.current = true
    const parsed = parsePayload(window.location.hash.replace(/^#/, ''))
    if (!parsed) {
      setBad(true)
      return
    }
    enqueue({
      sessionId: parsed.sessionId,
      windowIndex: parsed.windowIndex,
      code: parsed.code,
    })
  }, [])

  // Route once auth resolves.
  useEffect(() => {
    if (bad || loading) return
    if (!user) {
      navigate('/signin', { replace: true })
      return
    }
    if (role === 'student') {
      // Fire-and-forget: Attendance shows the queued/result card either way.
      void syncOfflineScans()
      navigate('/app/attendance', { replace: true })
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
        <button
          type="button"
          onClick={() => navigate('/app/attendance', { replace: true })}
          className="mt-2 h-11 rounded-xl bg-brand-500 px-5 text-sm font-medium text-white"
        >
          Open ClassPoint
        </button>
      </div>
    )
  }

  if (!loading && user && role === 'instructor') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <h1 className="font-display text-lg font-bold">That's the student check-in link</h1>
        <p className="max-w-xs text-sm text-muted">
          Students scan this to check in. You're signed in as the instructor.
        </p>
        <button
          type="button"
          onClick={() => navigate('/teach/attendance', { replace: true })}
          className="mt-2 h-11 rounded-xl bg-brand-500 px-5 text-sm font-medium text-white"
        >
          Go to Attendance
        </button>
      </div>
    )
  }

  // Capturing / routing — brief.
  return <Splash />
}
