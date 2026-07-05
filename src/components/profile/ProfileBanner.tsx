import { PlusIcon, XIcon } from '@/components/ui/icons'

interface Props {
  /** Up to 3 photo URLs. */
  urls: string[]
  /** When true, shows remove buttons + an "add" tile. */
  editable?: boolean
  onAdd?: () => void
  onRemove?: (url: string) => void
  busy?: boolean
}

/**
 * A student's showcase photos — up to 3, shown as a triptych. Read-only on a
 * classmate's preview; editable (add/remove) on your own Profile tab.
 */
export function ProfileBanner({ urls, editable, onAdd, onRemove, busy }: Props) {
  if (!editable && urls.length === 0) return null

  return (
    <div className="grid grid-cols-3 gap-2">
      {urls.map((url) => (
        <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-card-2">
          <img src={url} alt="Profile photo" loading="lazy" className="h-full w-full object-cover" />
          {editable && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(url)}
              disabled={busy}
              aria-label="Remove photo"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {editable && urls.length < 3 && (
        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          aria-label="Add photo"
          className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-line text-muted transition-colors hover:border-brand-500/50 hover:text-brand-500 disabled:opacity-60"
        >
          {busy ? '…' : <PlusIcon className="h-6 w-6" />}
        </button>
      )}
    </div>
  )
}
