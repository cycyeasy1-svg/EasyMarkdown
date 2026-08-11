const MARKDOWN_FILE_RE = /\.(?:md|markdown|mdx)$/i
const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf])
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'out'
])

export function isMarkdownFileName(name) {
  return MARKDOWN_FILE_RE.test(String(name || ''))
}

export function detectLineEnding(content) {
  return String(content || '').includes('\r\n') ? 'CRLF' : 'LF'
}

export function decodeUtf8Bytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0)
  const bom =
    view.length >= 3 &&
    view[0] === UTF8_BOM[0] &&
    view[1] === UTF8_BOM[1] &&
    view[2] === UTF8_BOM[2]
  return {
    bom,
    content: new TextDecoder('utf-8').decode(bom ? view.subarray(3) : view)
  }
}

export function encodeUtf8Text(content, bom = false) {
  const body = new TextEncoder().encode(String(content ?? ''))
  if (!bom) return body
  const result = new Uint8Array(UTF8_BOM.length + body.length)
  result.set(UTF8_BOM, 0)
  result.set(body, UTF8_BOM.length)
  return result
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function normalizeWorkspacePath(value) {
  const parts = []
  for (const part of String(value || '')
    .replace(/\\/g, '/')
    .split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

export function resolveWorkspacePath(fromFilePath, rawTarget) {
  let target = String(rawTarget || '').trim()
  if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) return null
  target = safeDecodeURIComponent(target.split('#')[0].split('?')[0]).replace(/\\/g, '/')
  if (!target || target.startsWith('/') || /^[a-z]:/i.test(target)) return null
  const base = String(fromFilePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .slice(0, -1)
  return normalizeWorkspacePath([...base, target].join('/'))
}

export function flattenWorkspaceFiles(nodes, result = []) {
  for (const node of nodes || []) {
    if (node.type === 'file') result.push(node)
    else flattenWorkspaceFiles(node.children, result)
  }
  return result
}

export function sortWorkspaceNodes(nodes) {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export function supportsFileSystemAccess() {
  return (
    typeof window !== 'undefined' &&
    typeof window.showOpenFilePicker === 'function' &&
    typeof window.showDirectoryPicker === 'function'
  )
}

export function isFileHandle(value) {
  return !!value && value.kind === 'file' && typeof value.getFile === 'function'
}

export function isDirectoryHandle(value) {
  return !!value && value.kind === 'directory' && typeof value.entries === 'function'
}

export async function requestHandlePermission(handle, mode = 'read') {
  if (!handle) return false
  const options = { mode }
  try {
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission(options)
      if (current === 'granted') return true
    }
    if (typeof handle.requestPermission === 'function') {
      return (await handle.requestPermission(options)) === 'granted'
    }
    return true
  } catch {
    return false
  }
}

export async function readMarkdownSource(source) {
  const file = isFileHandle(source) ? await source.getFile() : source
  if (!file || typeof file.arrayBuffer !== 'function')
    throw new TypeError('A readable file is required')
  const decoded = decodeUtf8Bytes(await file.arrayBuffer())
  return {
    ...decoded,
    name: file.name || source?.name || 'document.md',
    lastModified: Number(file.lastModified) || 0,
    size: Number(file.size) || 0
  }
}

export async function writeMarkdownHandle(handle, content, { bom = false } = {}) {
  if (!isFileHandle(handle)) throw new TypeError('A writable file handle is required')
  if (!(await requestHandlePermission(handle, 'readwrite'))) {
    const error = new Error('Write permission was not granted')
    error.code = 'permission-denied'
    throw error
  }
  const writable = await handle.createWritable()
  try {
    await writable.write(encodeUtf8Text(content, bom))
    await writable.close()
  } catch (error) {
    try {
      await writable.abort?.()
    } catch {
      // Preserve the original write error.
    }
    throw error
  }
  const file = await handle.getFile()
  return { lastModified: Number(file.lastModified) || Date.now(), size: Number(file.size) || 0 }
}

export async function pickMarkdownHandles() {
  if (typeof window.showOpenFilePicker === 'function') {
    return window.showOpenFilePicker({
      multiple: true,
      types: [
        {
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown', '.mdx'] }
        }
      ]
    })
  }
  return pickFilesWithInput({ multiple: true })
}

export async function pickWorkspaceHandle() {
  if (typeof window.showDirectoryPicker !== 'function') return null
  return window.showDirectoryPicker({ mode: 'readwrite' })
}

export async function pickSaveHandle(suggestedName = 'document.md') {
  if (typeof window.showSaveFilePicker !== 'function') return null
  return window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'Markdown',
        accept: { 'text/markdown': ['.md', '.markdown', '.mdx'] }
      }
    ]
  })
}

function pickFilesWithInput({ multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.mdx,text/markdown,text/plain'
    input.multiple = multiple
    input.addEventListener(
      'change',
      () => resolve(Array.from(input.files || []).filter((file) => isMarkdownFileName(file.name))),
      { once: true }
    )
    input.click()
  })
}

export async function scanMarkdownWorkspace(rootHandle, { maxFiles = 5000, maxDepth = 20 } = {}) {
  if (!isDirectoryHandle(rootHandle)) throw new TypeError('A directory handle is required')
  const state = { count: 0, truncated: false, errors: [] }

  const visit = async (directory, parentPath, depth) => {
    if (depth > maxDepth || state.count >= maxFiles) {
      state.truncated = true
      return []
    }
    const children = []
    try {
      for await (const [name, handle] of directory.entries()) {
        if (state.count >= maxFiles) {
          state.truncated = true
          break
        }
        const path = parentPath ? `${parentPath}/${name}` : name
        if (handle.kind === 'directory') {
          if (SKIPPED_DIRECTORIES.has(name.toLowerCase())) continue
          const nested = await visit(handle, path, depth + 1)
          if (nested.length) {
            children.push({ type: 'directory', name, path, handle, children: nested })
          }
        } else if (handle.kind === 'file' && isMarkdownFileName(name)) {
          state.count += 1
          children.push({ type: 'file', name, path, handle })
        }
      }
    } catch (error) {
      state.errors.push({ path: parentPath, message: error?.message || String(error) })
    }
    return sortWorkspaceNodes(children)
  }

  const tree = await visit(rootHandle, '', 0)
  return {
    tree,
    files: flattenWorkspaceFiles(tree),
    count: state.count,
    truncated: state.truncated,
    errors: state.errors
  }
}

export async function getFileHandleAtPath(rootHandle, relativePath) {
  const normalized = normalizeWorkspacePath(relativePath)
  if (!normalized) return null
  const parts = normalized.split('/')
  const fileName = parts.pop()
  let directory = rootHandle
  try {
    for (const part of parts) directory = await directory.getDirectoryHandle(part)
    return await directory.getFileHandle(fileName)
  } catch {
    return null
  }
}

export async function handlesFromDrop(dataTransfer) {
  const handles = []
  for (const item of Array.from(dataTransfer?.items || [])) {
    if (typeof item.getAsFileSystemHandle !== 'function') continue
    try {
      const handle = await item.getAsFileSystemHandle()
      if (handle) handles.push(handle)
    } catch {
      // Fall back to DataTransfer.files below.
    }
  }
  if (handles.length) return handles
  return Array.from(dataTransfer?.files || []).filter((file) => isMarkdownFileName(file.name))
}

export function downloadMarkdown(name, content, { bom = false } = {}) {
  const blob = new Blob([encodeUtf8Text(content, bom)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = isMarkdownFileName(name) ? name : `${name || 'document'}.md`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
