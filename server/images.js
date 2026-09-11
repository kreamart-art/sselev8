import crypto from 'node:crypto'
import path from 'node:path'
import { unlinkSync } from 'node:fs'
import sharp from 'sharp'
import { UPLOAD_DIR } from './db.js'

const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff'])

// Re-encodes every upload: strips EXIF (incl. GPS), fixes rotation, caps the size,
// and writes a full and a small WebP. The original bytes are never stored.
export async function saveImage(buffer) {
  const base = sharp(buffer, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate()
  const meta = await base.metadata()
  if (!ALLOWED.has(meta.format)) throw new Error('Dit bestandstype wordt niet ondersteund.')
  const id = crypto.randomBytes(9).toString('base64url')
  await base.clone().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(UPLOAD_DIR, `${id}.webp`))
  await base.clone().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(UPLOAD_DIR, `${id}-800.webp`))
  // Share previews (WhatsApp, LinkedIn) are only reliable with a JPEG at 1200x630.
  await base.clone().resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(UPLOAD_DIR, `${id}-og.jpg`))
  return { url: `/uploads/${id}.webp`, thumb: `/uploads/${id}-800.webp` }
}

export const thumbOf = (url) => (url && url.startsWith('/uploads/') ? url.replace(/\.webp$/, '-800.webp') : url)

export function deleteImage(url) {
  if (!url || !url.startsWith('/uploads/')) return
  const name = path.basename(url)
  for (const f of [name, name.replace(/\.webp$/, '-800.webp'), name.replace(/\.webp$/, '-og.jpg')]) {
    try {
      unlinkSync(path.join(UPLOAD_DIR, f))
    } catch {
      /* already gone */
    }
  }
}
