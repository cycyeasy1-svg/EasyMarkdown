import { isAbsolutePath, isRestrictedRoot } from './helpers.js'

const MAX_PATH_LENGTH = 32_767
const DIAGNOSTIC_LEVELS = new Set(['debug', 'info', 'warn', 'error'])

export function isSafeIpcPath(value, { allowRestricted = true } = {}) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    !value.includes('\0') &&
    isAbsolutePath(value) &&
    (allowRestricted || !isRestrictedRoot(value))
  )
}

const PATH_ARGUMENTS = new Map([
  ['fs:readFile', [{ index: 0 }]],
  ['fs:pathExists', [{ index: 0 }]],
  ['fs:writeFile', [{ index: 0 }]],
  [
    'fs:rename',
    [
      { index: 0, allowRestricted: false },
      { index: 1, allowRestricted: false }
    ]
  ],
  ['fs:delete', [{ index: 0, allowRestricted: false }]],
  ['fs:createFile', [{ index: 0, allowRestricted: false }]],
  ['fs:createDir', [{ index: 0, allowRestricted: false }]],
  ['fs:readDir', [{ index: 0, allowRestricted: false }]],
  ['fs:readDirRecursive', [{ index: 0, allowRestricted: false }]],
  ['fs:listFiles', [{ index: 0, allowRestricted: false }]],
  ['fs:openFolderTree', [{ index: 0, allowRestricted: false }]],
  ['fs:duplicate', [{ index: 0, allowRestricted: false }]],
  ['history:list', [{ index: 0 }]],
  ['history:read', [{ index: 0 }]],
  ['history:delete', [{ index: 0 }]],
  ['watch:start', [{ index: 0, allowRestricted: false }]],
  ['watch:stop', [{ index: 0, allowRestricted: false }]],
  ['watch:file', [{ index: 0, allowRestricted: false }]],
  ['watch:unfile', [{ index: 0, allowRestricted: false }]],
  ['shell:showInFolder', [{ index: 0 }]],
  ['attachment:save', [{ index: 0, optional: true }, { index: 1 }]],
  ['image:save', [{ index: 0, optional: true }]],
  ['image:inlineForSave', [{ index: 1, optional: true }]]
])

// Unknown channels remain allowed here but are still sender-validated. Their
// feature handler owns the richer payload schema (e.g. Markdown link plans).
// Privileged raw filesystem paths are centralized above so accidental relative
// CWD access fails before any handler runs.
export function validateIpcArgs(channel, args) {
  const pathRules = PATH_ARGUMENTS.get(channel)
  if (pathRules) {
    for (const rule of pathRules) {
      if (rule.optional && args[rule.index] == null) continue
      if (!isSafeIpcPath(args[rule.index], { allowRestricted: rule.allowRestricted !== false })) {
        return false
      }
    }
  }
  if (channel === 'dialog:saveAs') {
    return args[0] == null || (typeof args[0] === 'string' && args[0].length <= 255)
  }
  if (channel === 'shell:openLocalPath') {
    const [href, fromPath] = args
    return (
      typeof href === 'string' &&
      href.length > 0 &&
      href.length <= MAX_PATH_LENGTH &&
      !href.includes('\0') &&
      isSafeIpcPath(fromPath)
    )
  }
  if (channel === 'spell:set') return typeof args[0] === 'boolean'
  if (channel === 'app:setLang') return ['en', 'zh', 'ja'].includes(args[0])
  if (channel === 'diagnostics:export') return args.length === 0
  if (channel === 'diagnostics:log') {
    const [level, event, details] = args
    if (!DIAGNOSTIC_LEVELS.has(level)) return false
    if (typeof event !== 'string' || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(event)) return false
    if (details != null && (typeof details !== 'object' || Array.isArray(details))) return false
    try {
      return JSON.stringify(details || {}).length <= 16_384
    } catch {
      return false
    }
  }
  return true
}
