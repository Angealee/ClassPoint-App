import type { ReactNode } from 'react'
import { QrScanner } from '@/components/attendance/QrScanner'
import { cn } from '@/lib/cn'

export function ScanStage({
  scanKey,
  onDetect,
  caption,
  footer,
  className,
}: {
  scanKey: number
  onDetect: (text: string) => void
  caption: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex h-full min-h-[60dvh] flex-col', className)}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <QrScanner key={scanKey} onDetect={onDetect} />
        <p className="max-w-xs text-center text-sm text-muted">{caption}</p>
      </div>

      {footer && <div className="shrink-0 pt-4">{footer}</div>}
    </div>
  )
}
