// Pure main-process helpers — no Electron, no Node-runtime state — so they can be
// imported by both src/main/index.js AND the unit tests (which run without an
// Electron runtime). Keep this module dependency-free: anything needing `app`,
// `fs`, or chokidar stays in index.js.

// Supported Markdown file types — single source for the open-dialog filter and
// the extension test used while scanning folders / launch args.
export const MD_EXTS = ['md', 'markdown', 'mdx', 'txt']
export const MD_RE = new RegExp(`\\.(${MD_EXTS.join('|')})$`, 'i')

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
