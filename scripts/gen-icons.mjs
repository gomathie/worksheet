// Generates PWA PNG icons from inline SVG using sharp.
// Run: node scripts/gen-icons.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const TEAL = '#128F72'
const CREAM = '#F5F1E6'

// Standard icon: rounded teal tile with the rotated "LG" stamp, some padding.
const standard = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${TEAL}"/>
  <g transform="rotate(-8 256 256)">
    <circle cx="256" cy="256" r="150" fill="none" stroke="${CREAM}" stroke-width="14"/>
    <text x="256" y="300" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
      font-weight="bold" font-size="150" fill="${CREAM}">LG</text>
  </g>
</svg>`

// Maskable icon: full-bleed background, logo kept within the ~80% safe zone.
const maskable = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${TEAL}"/>
  <g transform="rotate(-8 256 256)">
    <circle cx="256" cy="256" r="120" fill="none" stroke="${CREAM}" stroke-width="12"/>
    <text x="256" y="292" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
      font-weight="bold" font-size="120" fill="${CREAM}">LG</text>
  </g>
</svg>`

async function png(svg, size, name) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(outDir, name))
  console.log('wrote', name)
}

await png(standard(192), 192, 'icon-192.png')
await png(standard(512), 512, 'icon-512.png')
await png(maskable(512), 512, 'icon-maskable-512.png')
await png(standard(180), 180, 'apple-touch-icon.png')
