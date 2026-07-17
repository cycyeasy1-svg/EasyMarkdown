import { extname, posix, win32 } from 'node:path'
import {
  extractMarkdownHeadings,
  extractMarkdownLinks,
  getAllowedExternalUrl,
  isAbsolutePath,
  slugifyMarkdownAnchor
} from './helpers.js'

const MARKDOWN_RE = /\.(md|markdown|mdx)$/i
const WINDOWS_PATH_RE = /^(?:[a-zA-Z]:[\\/]|\\\\)/

const pathApiFor = (...values) =>
  values.some((value) => WINDOWS_PATH_RE.test(String(value || '')) || String(value || '').includes('\\'))
    ? win32
    : posix

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const comparablePath = (value) => {
  const raw = String(value || '')
  const api = pathApiFor(raw)
  const normalized = api.normalize(raw).replace(/\\/g, '/')
  return api === win32 ? normalized.toLowerCase() : normalized
}

export const sameMarkdownPath = (left, right) =>
  !!left && !!right && comparablePath(left) === comparablePath(right)

const matchesMarkdownTargetPath = (resolvedPath, targetPath) =>
  sameMarkdownPath(resolvedPath, targetPath) ||
  (!extname(resolvedPath || '') && sameMarkdownPath(`${resolvedPath}.md`, targetPath))

export function splitMarkdownTarget(value) {
  const raw = String(value ?? '').trim()
  const hash = raw.indexOf('#')
  const beforeHash = hash >= 0 ? raw.slice(0, hash) : raw
  const queryAt = beforeHash.indexOf('?')
  return {
    raw,
    path: queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash,
    query: queryAt >= 0 ? beforeHash.slice(queryAt) : '',
    anchor: hash >= 0 ? safeDecode(raw.slice(hash + 1)) : '',
    hasAnchor: hash >= 0
  }
}

export function resolveMarkdownTarget(fromPath, target) {
  const parts = splitMarkdownTarget(target)
  if (!parts.raw) return { ...parts, kind: 'empty', path: null }
  if (/^data:image\//i.test(parts.raw)) return { ...parts, kind: 'embedded-image', path: null }
  if (!WINDOWS_PATH_RE.test(parts.path) && /^[a-z][a-z\d+.-]*:/i.test(parts.path)) {
    const allowedUrl = getAllowedExternalUrl(parts.raw)
    return { ...parts, kind: allowedUrl ? 'external' : 'invalid-url', url: allowedUrl, path: null }
  }
  if (!fromPath) return { ...parts, kind: 'unsaved', path: null }
  if (!parts.path) return { ...parts, kind: 'local', path: fromPath }
  const decoded = safeDecode(parts.path).replace(/\//g, pathApiFor(fromPath, parts.path).sep)
  const api = pathApiFor(fromPath, decoded)
  const resolved = isAbsolutePath(decoded)
    ? api.normalize(decoded)
    : api.resolve(api.dirname(fromPath), decoded)
  return { ...parts, kind: 'local', path: resolved }
}

export function collectMarkdownAnchors(content) {
  const anchors = new Map()
  const duplicates = new Map()
  for (const heading of extractMarkdownHeadings(content, 10000)) {
    const explicit = heading.text.match(/\s*\{#([^}\s]+)\}\s*$/)?.[1]
    const text = explicit ? heading.text.replace(/\s*\{#[^}]+\}\s*$/, '').trim() : heading.text
    const base = explicit || slugifyMarkdownAnchor(text)
    if (!base) continue
    const count = duplicates.get(base) || 0
    const anchor = count ? `${base}-${count}` : base
    duplicates.set(base, count + 1)
    anchors.set(anchor, heading.line)
    if (explicit) anchors.set(explicit, heading.line)
  }
  const htmlId = /\bid\s*=\s*["']([^"']+)["']/gi
  const source = String(content ?? '')
  let match
  while ((match = htmlId.exec(source))) {
    const line = source.slice(0, match.index).split('\n').length
    if (!anchors.has(match[1])) anchors.set(match[1], line)
  }
  return anchors
}

const excerptForLink = (content, link) => {
  const lineText = String(content ?? '').split('\n')[link.line - 1]?.replace(/\r$/, '') || ''
  const col = Math.max(0, link.column - 1)
  const start = Math.max(0, col - 50)
  const prefix = start ? '…' : ''
  const text = prefix + lineText.slice(start, start + 220)
  return {
    line: link.line,
    col,
    len: Math.max(1, link.target.length),
    text,
    textCol: col - start + prefix.length
  }
}

export async function diagnoseMarkdownContent({
  docPath,
  content,
  exists,
  readFile
}) {
  const problems = []
  const currentAnchors = collectMarkdownAnchors(content)
  for (const link of extractMarkdownLinks(content)) {
    const resolved = resolveMarkdownTarget(docPath, link.target)
    const base = {
      ...excerptForLink(content, link),
      target: link.target,
      isImage: link.isImage,
      path: resolved.path || null,
      anchor: resolved.anchor
    }
    if (resolved.kind === 'empty' || resolved.kind === 'external' || resolved.kind === 'embedded-image') {
      continue
    }
    if (resolved.kind === 'invalid-url') {
      problems.push({ ...base, kind: 'invalid-url' })
      continue
    }
    if (resolved.kind === 'unsaved') continue

    let targetPath = resolved.path
    let targetExists = await exists(targetPath)
    if (!targetExists && !link.isImage && !extname(targetPath)) {
      const markdownPath = `${targetPath}.md`
      if (await exists(markdownPath)) {
        targetPath = markdownPath
        targetExists = true
      }
    }
    if (!targetExists) {
      problems.push({
        ...base,
        path: targetPath,
        kind: link.isImage ? 'missing-image' : 'missing-document'
      })
      continue
    }
    if (!resolved.hasAnchor || link.isImage || !MARKDOWN_RE.test(targetPath)) continue
    let anchors
    if (sameMarkdownPath(targetPath, docPath)) anchors = currentAnchors
    else {
      try {
        anchors = collectMarkdownAnchors(await readFile(targetPath))
      } catch {
        problems.push({ ...base, path: targetPath, kind: 'unreadable-document' })
        continue
      }
    }
    if (!anchors.has(resolved.anchor)) {
      problems.push({ ...base, path: targetPath, kind: 'missing-anchor' })
    }
  }
  return problems
}

export function findMarkdownReferences(files, targetPath, anchor = '') {
  const groups = []
  for (const file of files) {
    const items = []
    for (const link of extractMarkdownLinks(file.content)) {
      const resolved = resolveMarkdownTarget(file.path, link.target)
      if (resolved.kind !== 'local' || !matchesMarkdownTargetPath(resolved.path, targetPath)) continue
      if (anchor && (!resolved.hasAnchor || resolved.anchor !== anchor)) continue
      items.push({ ...excerptForLink(file.content, link), target: link.target })
    }
    if (items.length) groups.push({ path: file.path, items })
  }
  return groups
}

const encodeMarkdownPath = (value) =>
  encodeURI(String(value || '').replace(/\\/g, '/'))
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')

export function relativeMarkdownPath(fromPath, targetPath, originalTarget = '') {
  const originalPath = splitMarkdownTarget(originalTarget).path
  if (isAbsolutePath(safeDecode(originalPath))) return encodeMarkdownPath(targetPath)
  const api = pathApiFor(fromPath, targetPath)
  let rel = api.relative(api.dirname(fromPath), targetPath).replace(/\\/g, '/')
  if (!rel) rel = api.basename(targetPath)
  if (originalPath.startsWith('./') && !rel.startsWith('.')) rel = `./${rel}`
  return encodeMarkdownPath(rel)
}

const replaceTargetPath = (target, nextPath) => {
  const parts = splitMarkdownTarget(target)
  return `${nextPath}${parts.query}${parts.hasAnchor ? `#${parts.anchor}` : ''}`
}

const replaceTargetAnchor = (target, nextAnchor) => {
  const parts = splitMarkdownTarget(target)
  return `${parts.path}${parts.query}#${nextAnchor}`
}

const buildFileChange = (file, replacements) => {
  if (!replacements.length) return null
  const ordered = [...replacements].sort((a, b) => b.start - a.start)
  let updated = file.content
  for (const replacement of ordered) {
    updated =
      updated.slice(0, replacement.start) +
      replacement.value +
      updated.slice(replacement.end)
  }
  if (updated === file.content) return null
  const beforeLines = file.content.split('\n')
  const afterLines = updated.split('\n')
  const changes = []
  const count = Math.max(beforeLines.length, afterLines.length)
  for (let index = 0; index < count; index++) {
    const before = beforeLines[index] ?? ''
    const after = afterLines[index] ?? ''
    if (before !== after) changes.push({ line: index + 1, before, after })
  }
  return { path: file.path, original: file.content, updated, changes }
}

const parseHeadingLine = (line) => {
  const match = String(line || '').match(/^(\s{0,3}#{1,6}\s+)(.*?)(\s+#+\s*)?$/)
  if (!match) return null
  const explicitMatch = match[2].match(/^(.*?)(\s+\{#([^}\s]+)\})$/)
  return {
    prefix: match[1],
    text: (explicitMatch?.[1] || match[2]).trim(),
    explicit: explicitMatch?.[3] || '',
    attribute: explicitMatch?.[2] || '',
    suffix: match[3] || ''
  }
}

export function createHeadingRenamePlan(files, targetPath, line, newHeading) {
  const target = files.find((file) => sameMarkdownPath(file.path, targetPath))
  const lines = target?.content.split('\n') || []
  const lineIndex = Math.max(0, Number(line) - 1)
  const parsed = parseHeadingLine(lines[lineIndex])
  const nextText = String(newHeading ?? '').trim()
  if (!target || !parsed || !nextText) return { error: 'invalid-heading', files: [], totalChanges: 0 }
  const oldAnchor = parsed.explicit || slugifyMarkdownAnchor(parsed.text)
  const newAnchor = parsed.explicit || slugifyMarkdownAnchor(nextText)
  if (!newAnchor) return { error: 'invalid-heading', files: [], totalChanges: 0 }

  const planned = []
  for (const file of files) {
    const replacements = []
    if (sameMarkdownPath(file.path, targetPath)) {
      let lineStart = 0
      for (let index = 0; index < lineIndex; index++) lineStart += lines[index].length + 1
      replacements.push({
        start: lineStart,
        end: lineStart + lines[lineIndex].length,
        value: `${parsed.prefix}${nextText}${parsed.attribute}${parsed.suffix}`
      })
    }
    if (oldAnchor !== newAnchor) {
      for (const link of extractMarkdownLinks(file.content)) {
        const resolved = resolveMarkdownTarget(file.path, link.target)
        if (
          resolved.kind === 'local' &&
          matchesMarkdownTargetPath(resolved.path, targetPath) &&
          resolved.hasAnchor &&
          resolved.anchor === oldAnchor
        ) {
          replacements.push({
            start: link.start,
            end: link.end,
            value: replaceTargetAnchor(link.target, newAnchor)
          })
        }
      }
    }
    const change = buildFileChange(file, replacements)
    if (change) planned.push(change)
  }
  return {
    kind: 'heading',
    targetPath,
    line: lineIndex + 1,
    oldHeading: parsed.text,
    newHeading: nextText,
    oldAnchor,
    newAnchor,
    files: planned,
    totalChanges: planned.reduce((sum, file) => sum + file.changes.length, 0)
  }
}

export function createFileRenamePlan(files, oldPath, newPath) {
  const planned = []
  for (const file of files) {
    const replacements = []
    const fileWillMove = sameMarkdownPath(file.path, oldPath)
    for (const link of extractMarkdownLinks(file.content)) {
      const resolved = resolveMarkdownTarget(file.path, link.target)
      if (resolved.kind !== 'local' || !splitMarkdownTarget(link.target).path) continue
      const targetsRenamedFile = matchesMarkdownTargetPath(resolved.path, oldPath)
      if (!fileWillMove && !targetsRenamedFile) continue
      const nextTarget = targetsRenamedFile ? newPath : resolved.path
      replacements.push({
        start: link.start,
        end: link.end,
        value: replaceTargetPath(
          link.target,
          relativeMarkdownPath(fileWillMove ? newPath : file.path, nextTarget, link.target)
        )
      })
    }
    const change = buildFileChange(file, replacements)
    if (change) planned.push(change)
  }
  return {
    kind: 'file',
    oldPath,
    newPath,
    files: planned,
    totalChanges: planned.reduce((sum, file) => sum + file.changes.length, 0)
  }
}
