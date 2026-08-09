import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontMatter } from './check-feature-dossiers.mjs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const REQUIRED_METADATA = ['doc_version', 'doc_status', 'doc_owner', 'last_verified']
const ALLOWED_DOC_STATUSES = new Set(['active', 'template', 'archived'])
const ROOT_LINK_DOCUMENTS = [
  'AGENTS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'NOTICE.md',
  'PRIVACY.md',
  'README.en.md',
  'README.md',
  'RELEASE_NOTES.md',
  'ROADMAP.md',
  'SECURITY.md',
  'SUPPORT.md'
]
const EXTRA_LINK_DOCUMENTS = [
  'ios/App/CapApp-SPM/README.md',
  'packages/vscode-extension/CHANGELOG.md',
  'packages/vscode-extension/README.md',
  'packages/vscode-extension/RELEASE_NOTES.zh-CN.md',
  'website/index.md'
]
const REQUIRED_GOVERNANCE_DOCUMENTS = [
  'docs/documentation-governance.md',
  'docs/archive/README.md'
]

function toPosix(path) {
  return path.replaceAll('\\', '/')
}

function isValidDate(value) {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function isTemplatePath(path) {
  const normalized = toPosix(path)
  return (
    normalized.includes('/_template/') ||
    normalized.endsWith('/_template.md') ||
    normalized.endsWith('/0000-template.md')
  )
}

function isArchivedContentPath(path) {
  const normalized = toPosix(path)
  return normalized.includes('/archive/') && !normalized.endsWith('/archive/README.md')
}

export function validateDocumentMetadata({
  text,
  path = 'docs/example.md',
  today = new Date().toISOString().slice(0, 10)
}) {
  const parsed = parseFrontMatter(text, path)
  const errors = [...parsed.errors]
  const metadata = parsed.metadata

  for (const key of REQUIRED_METADATA) {
    if (!metadata[key]) errors.push(`${path}: metadata "${key}" が必要です`)
  }
  if (metadata.doc_version && (!/^\d+$/.test(metadata.doc_version) || Number(metadata.doc_version) < 1)) {
    errors.push(`${path}: doc_version は 1 以上の整数です`)
  }
  if (metadata.doc_status && !ALLOWED_DOC_STATUSES.has(metadata.doc_status)) {
    errors.push(`${path}: doc_status "${metadata.doc_status}" は未対応です`)
  }
  if (metadata.last_verified && !isValidDate(metadata.last_verified)) {
    errors.push(`${path}: last_verified は有効な YYYY-MM-DD 形式です`)
  } else if (metadata.last_verified && isValidDate(today) && metadata.last_verified > today) {
    errors.push(`${path}: last_verified が未来日です (${metadata.last_verified})`)
  }
  if (metadata.doc_owner && metadata.doc_owner.toLowerCase() === 'unassigned') {
    errors.push(`${path}: doc_owner を割り当ててください`)
  }

  if (isTemplatePath(path) && metadata.doc_status && metadata.doc_status !== 'template') {
    errors.push(`${path}: template の doc_status は template です`)
  }
  if (!isTemplatePath(path) && metadata.doc_status === 'template') {
    errors.push(`${path}: template 以外に doc_status template は指定できません`)
  }
  if (isArchivedContentPath(path) && metadata.doc_status && metadata.doc_status !== 'archived') {
    errors.push(`${path}: archive document の doc_status は archived です`)
  }
  if (!isArchivedContentPath(path) && metadata.doc_status === 'archived') {
    errors.push(`${path}: archive 外に doc_status archived は指定できません`)
  }

  return { errors, metadata, body: parsed.body }
}

function stripCommentsAndCode(text) {
  const withoutComments = String(text).replace(/<!--[\s\S]*?-->/g, '')
  const output = []
  let fence = null

  for (const line of withoutComments.split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(?:>\s*)?(`{3,}|~{3,})/)
    if (marker) {
      const current = marker[1]
      if (!fence) fence = { character: current[0], length: current.length }
      else if (current[0] === fence.character && current.length >= fence.length) fence = null
      output.push('')
      continue
    }
    if (fence) {
      output.push('')
      continue
    }
    output.push(line.replace(/(`+)(.*?)\1/g, ''))
  }

  return output.join('\n')
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length
}

export function extractDocumentLinks(text) {
  const source = stripCommentsAndCode(text)
  const links = []
  const patterns = [
    /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)\n]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^\n)]*\)))?\s*\)/g,
    /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm,
    /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      links.push({ target: match[1], line: lineNumberAt(source, match.index || 0) })
    }
  }
  return links
}

function decodeTarget(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function markdownLinkParts(rawTarget) {
  let target = String(rawTarget).trim()
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
  target = target.replaceAll('&amp;', '&')
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null

  const hashIndex = target.indexOf('#')
  const rawPath = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  const rawFragment = hashIndex >= 0 ? target.slice(hashIndex + 1) : ''
  const queryIndex = rawPath.indexOf('?')
  const path = queryIndex >= 0 ? rawPath.slice(0, queryIndex) : rawPath
  return { path: decodeTarget(path), fragment: decodeTarget(rawFragment).toLowerCase() }
}

function inspectPathCase(repositoryRoot, targetPath) {
  const relativeTarget = relative(repositoryRoot, targetPath)
  if (!relativeTarget) return { exists: true, exact: true }
  let current = repositoryRoot
  for (const segment of relativeTarget.split(/[\\/]/)) {
    if (!existsSync(current) || !statSync(current).isDirectory()) {
      return { exists: false, exact: false }
    }
    const entries = readdirSync(current)
    if (entries.includes(segment)) {
      current = resolve(current, segment)
      continue
    }
    const caseInsensitive = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase())
    if (caseInsensitive) return { exists: true, exact: false }
    return { exists: false, exact: false }
  }
  return { exists: true, exact: true }
}

function stripFencedCode(text) {
  const output = []
  let fence = null
  for (const line of String(text).split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (marker) {
      const current = marker[1]
      if (!fence) fence = { character: current[0], length: current.length }
      else if (current[0] === fence.character && current.length >= fence.length) fence = null
      continue
    }
    if (!fence) output.push(line)
  }
  return output.join('\n')
}

export function githubHeadingAnchors(text) {
  const anchors = new Set()
  const counts = new Map()
  const source = stripFencedCode(text).replace(/<!--[\s\S]*?-->/g, '')

  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
    if (!heading) continue
    const label = heading[1]
      .replace(/`+([^`]*)`+/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^\p{Letter}\p{Number}\p{Mark}\s_-]/gu, '')
      .replace(/\s/g, '-')
    const duplicate = counts.get(label) || 0
    counts.set(label, duplicate + 1)
    anchors.add(duplicate === 0 ? label : `${label}-${duplicate}`)
  }

  return anchors
}

export function validateDocumentLinks({ repositoryRoot, sourcePath, text, anchorCache = new Map() }) {
  const root = resolve(repositoryRoot)
  const absoluteSource = resolve(root, sourcePath)
  const displaySource = toPosix(relative(root, absoluteSource))
  const errors = []
  let count = 0

  for (const link of extractDocumentLinks(text)) {
    const parts = markdownLinkParts(link.target)
    if (!parts) continue
    count += 1
    if (parts.path.includes('\\')) {
      errors.push(`${displaySource}:${link.line}: local link は / 区切りにしてください (${link.target})`)
      continue
    }

    const targetPath = parts.path
      ? parts.path.startsWith('/')
        ? resolve(root, parts.path.slice(1))
        : resolve(dirname(absoluteSource), parts.path)
      : absoluteSource
    const relativeTarget = relative(root, targetPath)
    const normalizedRelativeTarget = toPosix(relativeTarget)
    if (
      normalizedRelativeTarget === '..' ||
      normalizedRelativeTarget.startsWith('../') ||
      isAbsolute(relativeTarget)
    ) {
      errors.push(`${displaySource}:${link.line}: repository 外を参照しています (${link.target})`)
      continue
    }
    const pathCase = inspectPathCase(root, targetPath)
    if (!pathCase.exists) {
      errors.push(`${displaySource}:${link.line}: link target が存在しません (${link.target})`)
      continue
    }
    if (!pathCase.exact) {
      errors.push(
        `${displaySource}:${link.line}: link path の大文字小文字が一致しません (${link.target})`
      )
      continue
    }

    if (parts.fragment && statSync(targetPath).isFile() && extname(targetPath).toLowerCase() === '.md') {
      let anchors = anchorCache.get(targetPath)
      if (!anchors) {
        anchors = githubHeadingAnchors(readFileSync(targetPath, 'utf8'))
        anchorCache.set(targetPath, anchors)
      }
      if (!anchors.has(parts.fragment)) {
        errors.push(`${displaySource}:${link.line}: heading anchor が存在しません (${link.target})`)
      }
    }
  }

  return { errors, count }
}

function markdownFiles(directory) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...markdownFiles(path))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(path)
  }
  return files.sort()
}

export function checkDocumentationRepository(
  repositoryRoot,
  { today = new Date().toISOString().slice(0, 10) } = {}
) {
  const root = resolve(repositoryRoot)
  const docsRoot = resolve(root, 'docs')
  const errors = []
  const docFiles = markdownFiles(docsRoot)

  if (docFiles.length === 0) errors.push('docs/: Markdown document がありません')
  for (const required of REQUIRED_GOVERNANCE_DOCUMENTS) {
    if (!existsSync(resolve(root, required))) errors.push(`${required}: required document がありません`)
  }

  for (const path of docFiles) {
    const displayPath = toPosix(relative(root, path))
    const result = validateDocumentMetadata({
      text: readFileSync(path, 'utf8'),
      path: displayPath,
      today
    })
    errors.push(...result.errors)
  }

  const linkFiles = new Set(docFiles)
  for (const path of [...ROOT_LINK_DOCUMENTS, ...EXTRA_LINK_DOCUMENTS]) {
    const absolute = resolve(root, path)
    if (existsSync(absolute)) linkFiles.add(absolute)
  }

  const anchorCache = new Map()
  let linkCount = 0
  for (const path of [...linkFiles].sort()) {
    const result = validateDocumentLinks({
      repositoryRoot: root,
      sourcePath: path,
      text: readFileSync(path, 'utf8'),
      anchorCache
    })
    errors.push(...result.errors)
    linkCount += result.count
  }

  return { errors, docCount: docFiles.length, linkFileCount: linkFiles.size, linkCount }
}

function runCli() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const result = checkDocumentationRepository(root)
  if (result.errors.length > 0) {
    console.error(`[docs] ${result.errors.length} 件の問題:`)
    for (const error of result.errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }
  console.log(
    `[docs] ${result.docCount} documents / ${result.linkFileCount} link sources / ${result.linkCount} local links: OK`
  )
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (entryPath === fileURLToPath(import.meta.url)) runCli()
