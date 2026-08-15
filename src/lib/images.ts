/**
 * Client-side image downscaling for profile uploads.
 *
 * Why this exists: a modern phone camera photo is 3–8 MB, and the app was
 * uploading it verbatim to render a 40px avatar — then every roster, podium and
 * leaderboard view downloaded that same original again, because Supabase Storage
 * serves the raw object with no transform. On a 40-student roster that was
 * comfortably the largest bandwidth cost in the app, paid on campus wifi.
 *
 * Resizing to a sane display size before upload cuts both directions by ~95%.
 */

/** Avatars render at ≤96px; 512 keeps them crisp on a 3x screen. */
export const AVATAR_MAX_PX = 512
/** Banners span the profile card width. */
export const BANNER_MAX_PX = 1280

const QUALITY = 0.82

/**
 * Downscale and re-encode an image, preserving aspect ratio.
 *
 * Fails SOFT: if anything in the canvas path breaks (an exotic format, a
 * browser without WebP encoding, a decode error), the original file is returned
 * and the upload proceeds exactly as it did before. A resize is an optimisation
 * — it must never be the reason a student can't set their picture.
 */
export async function downscaleImage(file: File, maxPx: number): Promise<File> {
  // Nothing useful to do with SVGs or GIFs (animation would be flattened).
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

    // If the "optimised" version somehow came out larger, keep the original.
    if (blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.webp`, { type: 'image/webp' })
  } catch {
    // Any failure at all: upload what the student picked.
    return file
  }
}
