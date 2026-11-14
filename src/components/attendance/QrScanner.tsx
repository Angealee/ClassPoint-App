import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BoltIcon } from '@/components/ui/icons'

interface NativeDetector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
interface DetectorCtor {
  new (opts: { formats: string[] }): NativeDetector
  getSupportedFormats?: () => Promise<string[]>
}

export function QrScanner({ onDetect }: { onDetect: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const [canTorch, setCanTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

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
        setStarting(false)
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
      } catch {
        setError('Camera access is blocked. Allow the camera for this site, then reopen the scanner.')
        setStarting(false)
        return
      }
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      await video.play().catch(() => {})
      setStarting(false)

      const track = stream.getVideoTracks()[0] ?? null
      trackRef.current = track
      try {
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined
        if (caps?.torch) setCanTorch(true)
      } catch {
        /* getCapabilities unsupported — no torch button */
      }

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
      trackRef.current = null
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetect])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      setCanTorch(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-card-2 p-6 text-center text-sm text-muted">
        {error}
      </div>
    )
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(85vw,22rem)] overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      {/* Viewfinder frame + sweeping aim line */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-6 top-6 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-white/90" />
        <div className="absolute right-6 top-6 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-white/90" />
        <div className="absolute bottom-6 left-6 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-white/90" />
        <div className="absolute bottom-6 right-6 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-white/90" />
        {!starting && (
          <motion.div
            aria-hidden
            className="absolute inset-x-8 h-[3px] rounded-full bg-accent-solid/80"
            initial={{ top: '16%' }}
            animate={{ top: ['16%', '84%', '16%'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {starting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-sm text-white/80">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Starting camera…
        </div>
      )}

      {canTorch && !starting && (
        <button
          type="button"
          onClick={() => void toggleTorch()}
          aria-pressed={torchOn}
          aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/75 px-4 py-2 text-xs font-semibold text-white"
        >
          <BoltIcon className="h-4 w-4" />
          {torchOn ? 'Light on' : 'Light'}
        </button>
      )}
    </div>
  )
}
