import { useEffect, useRef, useState } from 'react'

/** Minimal shape of the parts of the native BarcodeDetector API we use. */
interface NativeDetector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
interface DetectorCtor {
  new (opts: { formats: string[] }): NativeDetector
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * Live camera QR scanner. Prefers the browser's native BarcodeDetector (fast,
 * battery-friendly on Android/Chrome); falls back to the pure-JS `jsqr` decoder
 * so it also works on iOS Safari and desktop. Calls `onDetect` once with the raw
 * decoded string, then stops — the parent decides what to do next.
 */
export function QrScanner({ onDetect }: { onDetect: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    let detector: NativeDetector | null = null
    let decodeFrame: ((data: Uint8ClampedArray, w: number, h: number) => string | null) | null = null
    let canvas: HTMLCanvasElement | null = null
    let ctx: CanvasRenderingContext2D | null = null

    function finish(text: string) {
      if (detectedRef.current) return
      detectedRef.current = true
      onDetect(text)
    }

    const tick = async () => {
      if (stopped || detectedRef.current) return
      const v = videoRef.current
      let found: string | null = null
      if (v && v.readyState >= 2 && v.videoWidth) {
        try {
          if (detector) {
            const codes = await detector.detect(v)
            if (codes.length) found = codes[0].rawValue
          } else if (decodeFrame && ctx && canvas) {
            const w = v.videoWidth
            const h = v.videoHeight
            canvas.width = w
            canvas.height = h
            ctx.drawImage(v, 0, 0, w, h)
            found = decodeFrame(ctx.getImageData(0, 0, w, h).data, w, h)
          }
        } catch {
          /* transient frame error — keep scanning */
        }
      }
      if (found) {
        finish(found)
        return
      }
      if (!stopped && !detectedRef.current) raf = requestAnimationFrame(() => void tick())
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This device or browser can’t open the camera.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
      } catch {
        setError('Camera access is blocked. Allow the camera for this site, then reopen the scanner.')
        return
      }
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      await video.play().catch(() => {})

      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
      if (Ctor) {
        try {
          const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code']
          if (formats.includes('qr_code')) detector = new Ctor({ formats: ['qr_code'] })
        } catch {
          detector = null
        }
      }
      if (!detector) {
        const jsQR = (await import('jsqr')).default
        canvas = document.createElement('canvas')
        ctx = canvas.getContext('2d', { willReadFrequently: true })
        decodeFrame = (data, w, h) => jsQR(data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null
      }
      raf = requestAnimationFrame(() => void tick())
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetect])

  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-card-2 p-6 text-center text-sm text-muted">
        {error}
      </div>
    )
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      {/* Viewfinder frame */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-6 top-6 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-white/90" />
        <div className="absolute right-6 top-6 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-white/90" />
        <div className="absolute bottom-6 left-6 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-white/90" />
        <div className="absolute bottom-6 right-6 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-white/90" />
      </div>
    </div>
  )
}
