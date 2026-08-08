import fs from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_PDF_IMAGE_BYTES = 32 * 1024 * 1024
export const MAX_PDF_IMAGE_TOTAL_BYTES = 256 * 1024 * 1024

const MIME_EXTENSIONS = Object.freeze({
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp'
})
const IMAGE_EXTENSIONS = new Set(Object.values(MIME_EXTENSIONS))

const imageExtension = (src, contentType = '') => {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (MIME_EXTENSIONS[mime]) return MIME_EXTENSIONS[mime]
  try {
    const extension = extname(new URL(src).pathname).toLowerCase()
    if (IMAGE_EXTENSIONS.has(extension)) return extension
  } catch {
    const extension = extname(String(src || '')).toLowerCase()
    if (IMAGE_EXTENSIONS.has(extension)) return extension
  }
  return '.img'
}

const escapeHtmlAttribute = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const localImagePath = (src) => {
  if (/^file:/i.test(src)) return fileURLToPath(src)
  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('/')) return src
  return null
}

const readResponseBytes = async (response, maximumBytes) => {
  const reader = response.body?.getReader?.()
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer())
    return bytes.length <= maximumBytes ? bytes : null
  }
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maximumBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(Buffer.from(value))
  }
  return size ? Buffer.concat(chunks, size) : null
}

export async function stagePdfImages(source, {
  assetsDir,
  fetchImpl,
  signal,
  maximumBytes = MAX_PDF_IMAGE_BYTES,
  maximumTotalBytes = MAX_PDF_IMAGE_TOTAL_BYTES
} = {}) {
  if (!source || typeof source === 'string' || !Array.isArray(source.images) || !source.images.length) {
    return { source, stagedImages: 0, unresolvedImages: 0, stagedBytes: 0 }
  }

  let html = String(source.html || '')
  let stagedImages = 0
  let unresolvedImages = 0
  let stagedBytes = 0
  await fs.mkdir(assetsDir, { recursive: true })

  for (let index = 0; index < source.images.length; index += 1) {
    if (signal?.aborted) throw new Error('PDF preview canceled')
    const image = source.images[index]
    const placeholder = String(image?.placeholder || '')
    const src = String(image?.src || '')
    if (!placeholder || !src || !html.includes(placeholder)) continue
    const available = Math.max(0, Math.min(maximumBytes, maximumTotalBytes - stagedBytes))
    const base = `image-${String(index + 1).padStart(4, '0')}`
    let staged = null
    try {
      const local = localImagePath(src)
      if (local && available > 0) {
        const info = await fs.stat(local)
        if (info.isFile() && info.size <= available) {
          const filename = `${base}${imageExtension(src)}`
          await fs.copyFile(local, join(assetsDir, filename))
          staged = { filename, size: info.size }
        }
      } else if (/^https?:/i.test(src) && typeof fetchImpl === 'function' && available > 0) {
        const response = await fetchImpl(src, {
          signal,
          headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
        })
        const declared = Number(response?.headers?.get?.('content-length') || 0)
        if (response?.ok && declared <= available) {
          const bytes = await readResponseBytes(response, available)
          if (bytes?.length) {
            const filename = `${base}${imageExtension(src, response.headers?.get?.('content-type'))}`
            await fs.writeFile(join(assetsDir, filename), bytes)
            staged = { filename, size: bytes.length }
          }
        }
      }
    } catch {
      staged = null
    }

    const replacement = staged ? `./${staged.filename}` : src
    if (staged) {
      stagedImages += 1
      stagedBytes += staged.size
    } else unresolvedImages += 1
    html = html.split(placeholder).join(escapeHtmlAttribute(replacement))
  }

  return {
    source: { ...source, html, images: undefined },
    stagedImages,
    unresolvedImages,
    stagedBytes
  }
}
