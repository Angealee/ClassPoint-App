
export const AVATAR_MAX_PX = 512
/** Banners span the profile card width. */
export const BANNER_MAX_PX = 1280

const QUALITY = 0.82

export async function downscaleImage(file: File, maxPx: number): Promise<File> {
  if (!file.type.startsWith('image/') || /svg|gif/.test(file.type)) return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, maxPx / Math.max(width, height))

    // Already small enough — re-encoding would only lose quality.
    if (scale === 1) {
      bitmap.close()
      return file
    }

    const w = Math.round(width * scale)
    const h = Math.round(height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', QUALITY),
    )
    if (!blob) return file

    if (blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.webp`, { type: 'image/webp' })
  } catch {
    // Any failure at all: upload what the student picked.
    return file
  }
}
