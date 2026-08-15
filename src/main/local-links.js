import { posix, win32 } from 'node:path'
import { blockedAttachmentExtension, isAbsolutePath } from './helpers.js'
import { resolveMarkdownTarget } from './markdown-links.js'

export const LOCAL_LINK_MAX_LENGTH = 32_767
export const LOCAL_MARKDOWN_RE = /\.(md|markdown|mdx)$/i

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function fileUrlPath(value) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'file:' || parsed.username || parsed.password || parsed.port)
      return null
    const pathname = safeDecode(parsed.pathname || '')
    if (parsed.hostname && parsed.hostname.toLowerCase() !== 'localhost') {
      return win32.normalize(
        `\\\\${parsed.hostname}\\${pathname.replace(/^\/+/, '').replaceAll('/', '\\')}`
      )
    }
    if (/^\/[a-zA-Z]:\//.test(pathname)) return win32.normalize(pathname.slice(1))
    return posix.normalize(pathname)
  } catch {
    return null
  }
}

export function resolveLocalLinkPath(fromPath, href) {
  if (
    typeof href !== 'string' ||
    !href.trim() ||
    href.length > LOCAL_LINK_MAX_LENGTH ||
    href.includes('\0') ||
    typeof fromPath !== 'string' ||
    !isAbsolutePath(fromPath)
  )
    return { ok: false, error: 'Invalid local link.' }

  const raw = href.trim()
  let path = null
  if (/^file:/i.test(raw)) {
    path = fileUrlPath(raw)
  } else {
    const resolved = resolveMarkdownTarget(fromPath, raw)
    if (resolved.kind === 'local') path = resolved.path
  }
  if (
    !path ||
    !isAbsolutePath(path) ||
    path.length > LOCAL_LINK_MAX_LENGTH ||
    path.includes('\0')
  ) {
    return { ok: false, error: 'Unsupported local link.' }
  }
  const blockedExtension = blockedAttachmentExtension(path)
  return {
    ok: true,
    path,
    markdown: LOCAL_MARKDOWN_RE.test(path),
    blockedExtension
  }
}
