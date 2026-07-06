/**
 * Rasterize the PWA icons from the source SVGs into the PNG sizes that browsers
 * actually require for installability + a crisp iOS home-screen icon.
 *
 * Run with:  npm run generate-icons
 *
 * Outputs into /public:
 *   icon-192.png            192×192  (manifest, purpose "any")
 *   icon-512.png            512×512  (manifest, purpose "any")
 *   icon-maskable-512.png   512×512  (manifest, purpose "maskable" — full-bleed)
 *   apple-touch-icon.png    180×180  (iOS Add-to-Home-Screen)
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const anySvg = readFileSync(join(pub, 'icon.svg')) // rounded card, transparent corners
const maskSvg = readFileSync(join(pub, 'icon-maskable.svg')) // full-bleed, safe-zone logo

async function png(svg, size, out) {
  // High density so the SVG rasterizes larger than the target, then downscales
  // crisply.
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(pub, out))
  // eslint-disable-next-line no-console
  console.log('✓ wrote public/' + out)
}

await png(anySvg, 192, 'icon-192.png')
await png(anySvg, 512, 'icon-512.png')
await png(maskSvg, 512, 'icon-maskable-512.png')
await png(maskSvg, 180, 'apple-touch-icon.png')
