import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * Renders a QR code onto a canvas. The `qrcode` library is heavy-ish, so it's
 * dynamically imported (its own chunk) and only loaded when a QR is actually
 * shown. Always drawn dark-on-white for reliable scanning in either theme.
 */
export function QrCode({
  value,
  size = 240,
  className,
}: {
  value: string
  size?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const QRCode = (await import('qrcode')).default
      if (cancelled || !canvasRef.current) return
      await QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0d0d10', light: '#ffffff' },
      })
    })().catch(() => {
      /* transient — the next rotation redraws */
    })
    return () => {
      cancelled = true
    }
  }, [value, size])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={cn('rounded-xl', className)}
      aria-label="Attendance QR code"
    />
  )
}
