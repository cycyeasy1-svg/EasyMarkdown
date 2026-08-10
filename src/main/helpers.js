// Pure main-process helpers — no Electron, no Node-runtime state — so they can be
// imported by both src/main/index.js AND the unit tests (which run without an
// Electron runtime). Keep this module dependency-free: anything needing `app`,
// `fs`, or chokidar stays in index.js.

export {
  attachmentLinkMarkdown,
  extractMarkdownLinks,
  slugifyMarkdownAnchor
} from '../shared/markdown.js'

// Supported Markdown file types — single source for the open-dialog filter and
// the extension test used while scanning folders / launch args.
export const MD_EXTS = ['md', 'markdown', 'mdx', 'txt']
export const MD_RE = new RegExp(`\\.(${MD_EXTS.join('|')})$`, 'i')

// External links cross from untrusted Markdown content into the OS. Keep the
// protocol allowlist in this pure helper so both the main process and unit tests
// share the exact same gate. file:/javascript:/data:/custom app schemes must
// never reach shell.openExternal.
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])
export function getAllowedExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = new URL(value)
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null
    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && !parsed.hostname)
      return null
    return parsed.href
  } catch {
    return null
  }
}

// An absolute path: POSIX "/…", Windows "C:\…"/"C:/…", or a UNC "\\…".
export const isAbsolutePath = (p) => /^\//.test(p) || /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\/.test(p)

// Paths we must never watch recursively: a non-absolute path (resolves against
// the process CWD — "/" under Finder/launchd, so it would recurse the whole
// filesystem and crash the watcher), plus macOS system/device trees that throw
// EACCES/EPERM when watched.
export const isRestrictedRoot = (p) => {
  const norm = (p || '').replace(/[\\/]+$/, '')
  if (norm === '' || norm === '/' || norm === '.' || norm === '..') return true
  if (!isAbsolutePath(norm)) return true
  return /^\/(dev|proc|System\/Volumes|private\/var\/(db|folders)|\.vol)(\/|$)/.test(norm)
}

// ── Workspace full-text search: per-file matching ──
// Line-oriented so results carry a 1-based line number the renderer can jump
// to. Options mirror the in-document find bar (caseSensitive / wholeWord /
// regex) so both searches behave identically. Pure — the fs walk lives in
// index.js; this only sees one file's content.
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u
const isWordChar = (ch) => !!ch && WORD_CHAR_RE.test(ch)
const isWholeWordMatch = (text, start, len) =>
  !isWordChar(text[start - 1]) && !isWordChar(text[start + len])

// Long lines are excerpted around the first match so a minified/one-line file
// can't flood the results UI. `textCol` is the match position INSIDE `text`.
const EXCERPT_MAX = 240
function makeHit(lineIdx, col, len, line) {
  let text = line
  let textCol = col
  if (line.length > EXCERPT_MAX) {
    const start = Math.max(0, col - 60)
    const prefix = start > 0 ? '…' : ''
    text = prefix + line.slice(start, start + EXCERPT_MAX)
    textCol = col - start + prefix.length
  }
  return { line: lineIdx + 1, col, len, text, textCol }
}

export function searchContentLines(content, query, options = {}, cap = 50) {
  const q = String(query ?? '')
  if (!q) return { matches: [], error: '' }
  let re = null
  if (options.regex) {
    try {
      re = new RegExp(q, options.caseSensitive ? 'g' : 'gi')
    } catch {
      return { matches: [], error: 'regex' }
    }
  }
  const out = []
  const lines = String(content ?? '').split('\n')
  for (let i = 0; i < lines.length && out.length < cap; i++) {
    const line = lines[i]
    if (re) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(line)) && out.length < cap) {
        if (!m[0]) {
          re.lastIndex += 1
          continue
        }
        if (options.wholeWord && !isWholeWordMatch(line, m.index, m[0].length)) continue
        out.push(makeHit(i, m.index, m[0].length, line))
      }
    } else {
      const hay = options.caseSensitive ? line : line.toLowerCase()
      const needle = options.caseSensitive ? q : q.toLowerCase()
      let idx = hay.indexOf(needle)
      while (idx !== -1 && out.length < cap) {
        if (!options.wholeWord || isWholeWordMatch(line, idx, q.length)) {
          out.push(makeHit(i, idx, q.length, line))
        }
        idx = hay.indexOf(needle, idx + Math.max(1, needle.length))
      }
    }
  }
  return { matches: out, error: '' }
}

// Language attribute for the exported/printed `.doc` wrapper: kana in the
// document HTML → ` lang="ja"` so PDF_CSS's `.doc:lang(ja)` switches to the
// Japanese font stack (Japanese glyph forms for kanji). Kana is a definitive
// Japanese signal; Han characters are shared with Chinese, so they are not.
// (Mirrors detectDocLang in src/renderer/src/keep-parser.js — keep in sync;
// duplicated because main must not import renderer modules.)
const KANA_RE = /[ぁ-ゖァ-ヺｦ-ﾝ]/
const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
export const docLangAttr = (html) => {
  const value = String(html ?? '')
  if (KANA_RE.test(value)) return ' lang="ja"'
  if (HAN_RE.test(value)) return ' lang="zh"'
  return ''
}

// Lightweight ATX-heading index for Quick Open's workspace-symbol mode. It
// deliberately ignores fenced code and YAML front matter so examples such as
// "# not a heading" don't pollute navigation results. Setext headings are not
// indexed here because their two-line form is uncommon in workspace navigation
// and would make the scanner less predictable.
export function extractMarkdownHeadings(content, cap = 200) {
  const lines = String(content ?? '').split('\n')
  const out = []
  let fence = null
  let frontMatter = lines[0]?.replace(/\r$/, '') === '---'
  for (let i = 0; i < lines.length && out.length < cap; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (frontMatter) {
      if (i > 0 && (line === '---' || line === '...')) frontMatter = false
      continue
    }
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence) continue
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const text = match[2].trim()
    if (!text) continue
    out.push({ text, level: match[1].length, line: i + 1 })
  }
  return out
}

// Split a desired image filename into a filesystem-safe { stem, ext }, stripping
// path/reserved chars. The fs collision check (appending -1, -2…) lives in
// uniqueImageFile in index.js — this is just the pure naming part.
export const imageNameParts = (name) => {
  const safe = (name || 'image.png').replace(/[\\/:*?"<>|]/g, '_') || 'image.png'
  const dot = safe.lastIndexOf('.')
  const ext = dot > 0 ? safe.slice(dot) : '.png'
  const stem = (dot > 0 ? safe.slice(0, dot) : safe) || 'image'
  return { stem, ext }
}

// Ordinary attachments keep their original extension (or lack of one), unlike
// images which default to .png. Reserved path characters are replaced so a
// picked file can never escape the document's assets directory.
export const attachmentNameParts = (name) => {
  const safe = (name || 'attachment').replace(/[\\/:*?"<>|]/g, '_') || 'attachment'
  const dot = safe.lastIndexOf('.')
  const hasExt = dot > 0
  return {
    stem: (hasExt ? safe.slice(0, dot) : safe) || 'attachment',
    ext: hasExt ? safe.slice(dot) : ''
  }
}

// High-confidence executable, installer, script, shortcut and system-control
// file types. Copying one from EasyMarkdown into a document's assets folder can
// look like executable payload creation to endpoint protection, even though the
// app never launches attachments. Keep the main-process check authoritative.
export const BLOCKED_ATTACHMENT_EXTENSIONS = Object.freeze([
  '.bat',
  '.chm',
  '.cmd',
  '.com',
  '.cpl',
  '.dll',
  '.exe',
  '.hta',
  '.jar',
  '.js',
  '.jse',
  '.lnk',
  '.msi',
  '.msp',
  '.mst',
  '.pif',
  '.ps1',
  '.psd1',
  '.psm1',
  '.reg',
  '.scf',
  '.scr',
  '.sys',
  '.url',
  '.vbe',
  '.vbs',
  '.wsf',
  '.wsh'
])

const BLOCKED_ATTACHMENT_EXTENSION_SET = new Set(BLOCKED_ATTACHMENT_EXTENSIONS)

export function blockedAttachmentExtension(name) {
  // Windows ignores trailing dots/spaces in ordinary file names. Normalize them
  // before extracting the final extension so "payload.exe. " cannot bypass the
  // denylist; double extensions such as "invoice.pdf.exe" are caught naturally.
  const normalized = String(name ?? '')
    .trimEnd()
    .replace(/[. ]+$/g, '')
  const dot = normalized.lastIndexOf('.')
  if (dot < 0) return ''
  const extension = normalized.slice(dot).toLowerCase()
  return BLOCKED_ATTACHMENT_EXTENSION_SET.has(extension) ? extension : ''
}

const ALWAYS_IGNORED_WORKSPACE_DIRS = new Set(['.git', 'node_modules', '.obsidian', 'out', 'dist'])

// Shared gate for the lazy tree, recursive refresh, and workspace search.
// Hidden entries may be shown, but expensive/private implementation trees stay
// excluded even when the preference is enabled.
export function shouldSkipWorkspaceEntry(name, isDirectory, showHidden = false) {
  if (!name) return true
  if (isDirectory && ALWAYS_IGNORED_WORKSPACE_DIRS.has(name)) return true
  if (name === '.DS_Store') return true
  return name.startsWith('.') && name !== '.gitignore' && !showHidden
}
