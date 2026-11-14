/*
 * The one export path for every "save as image" card (leaderboard, grades): render a DOM node
 * to a JPEG, then hand it to the OS share sheet or fall back to a download. It was written
 * inside the leaderboard's ShareSheet and is shared here rather than copied: a second copy
 * is how the JPEG quality or the font wait would drift between the two.
 */
export interface RenderOptions {
  width: number
  height: number
  background: string
}

export async function renderJpeg(node: HTMLElement, o: RenderOptions): Promise<Blob | null> {
  const { domToBlob } = await import('modern-screenshot')

  // Everything must be paint-ready before the clone is taken.
  try {
    await document.fonts.ready
  } catch {
    /* not fatal: worst case the export uses a fallback face */
  }
  await Promise.all(
    [...node.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)),
  )

  return domToBlob(node, {
    width: o.width,
    height: o.height,
    scale: 1,
    backgroundColor: o.background,
    type: 'image/jpeg',
    quality: 0.92,
  })
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 'shared' = the OS sheet took it (or the user closed it), 'saved' = it was downloaded. */
export async function shareOrDownload(blob: Blob, filename: string): Promise<'shared' | 'saved'> {
  const file = new File([blob], filename, { type: 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (err) {
      // The user tapping "cancel" in the OS sheet is not an error.
      if ((err as Error)?.name === 'AbortError') return 'shared'
    }
  }
  download(blob, filename)
  return 'saved'
}
