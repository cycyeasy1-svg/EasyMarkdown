// @ts-check

/**
 * Renderer-visible feature flags. Every platform must publish every key as a
 * boolean; a false value is an explicit unsupported contract, not a missing
 * implementation that the renderer has to guess about.
 *
 * @typedef {'folderWorkspace' | 'workspaceSearch' | 'watch' | 'windowControls' |
 *   'pdfExport' | 'htmlExport' | 'print' | 'spellcheck' | 'nativeMenus' |
 *   'externalShell' | 'revealInFolder' | 'splitView' | 'fileAttachments' |
 *   'localHistory' | 'diagnostics' | 'localFileOpen' | 'canShare'} CapabilityKey
 * @typedef {Readonly<Record<CapabilityKey, boolean>>} CapabilityMap
 * @typedef {{
 *   platform: string,
 *   safeMode: boolean,
 *   capabilities: CapabilityMap
 * } & Record<string, unknown>} EasyMarkdownApi
 */

/** @type {readonly CapabilityKey[]} */
export const CAPABILITY_KEYS = Object.freeze([
  'folderWorkspace',
  'workspaceSearch',
  'watch',
  'windowControls',
  'pdfExport',
  'htmlExport',
  'print',
  'spellcheck',
  'nativeMenus',
  'externalShell',
  'revealInFolder',
  'splitView',
  'fileAttachments',
  'localHistory',
  'diagnostics',
  'localFileOpen',
  'canShare'
])

export const CORE_API_METHODS = Object.freeze([
  'openFiles',
  'openFolder',
  'saveAs',
  'readFile',
  'writeFile',
  'rename',
  'deleteItem',
  'createFile',
  'createDir',
  'duplicate',
  'readDir',
  'readDirRecursive',
  'listFiles',
  'openFolderTree',
  'themesList',
  'themeRead',
  'themesReveal',
  'checkUpdate',
  'confirmAppClose',
  'cancelAppClose',
  'rendererReady',
  'onOpenPaths',
  'onOpenFolderPath',
  'onMenu',
  'onAppCloseRequest'
])

/** @type {Readonly<Record<CapabilityKey, readonly string[]>>} */
export const CAPABILITY_METHODS = Object.freeze({
  folderWorkspace: Object.freeze(['openFolder', 'readDir', 'readDirRecursive', 'listFiles']),
  workspaceSearch: Object.freeze([
    'searchStart',
    'searchCancel',
    'onSearchBatch',
    'onSearchDone',
    'listWorkspaceHeadings'
  ]),
  watch: Object.freeze([
    'watchStart',
    'watchStop',
    'watchFile',
    'unwatchFile',
    'onWatchChanged',
    'onFileChanged'
  ]),
  windowControls: Object.freeze([
    'windowMinimize',
    'windowToggleMaximize',
    'windowClose',
    'windowIsMaximized',
    'onWindowMaximized'
  ]),
  pdfExport: Object.freeze(['previewPDF', 'savePDFPreview', 'disposePDFPreview']),
  htmlExport: Object.freeze(['previewHTML', 'saveHTMLPreview', 'disposeHTMLPreview']),
  print: Object.freeze(['printHTML']),
  spellcheck: Object.freeze(['setSpellcheck']),
  nativeMenus: Object.freeze(['setAppLang', 'setMenuKeybindings', 'onMenu']),
  externalShell: Object.freeze(['openExternal']),
  revealInFolder: Object.freeze(['showInFolder']),
  splitView: Object.freeze([]),
  fileAttachments: Object.freeze(['openAttachments', 'saveAttachment']),
  localHistory: Object.freeze([
    'localHistoryAdd',
    'localHistoryList',
    'localHistoryRead',
    'localHistoryDelete',
    'localHistoryClear'
  ]),
  diagnostics: Object.freeze(['logDiagnostic', 'exportDiagnostics']),
  localFileOpen: Object.freeze(['openLocalPath']),
  canShare: Object.freeze(['shareFile'])
})

/** @type {CapabilityMap} */
export const DESKTOP_CAPABILITIES = Object.freeze({
  folderWorkspace: true,
  workspaceSearch: true,
  watch: true,
  windowControls: true,
  pdfExport: true,
  htmlExport: true,
  print: true,
  spellcheck: true,
  nativeMenus: true,
  externalShell: true,
  revealInFolder: true,
  splitView: true,
  fileAttachments: true,
  localHistory: true,
  diagnostics: true,
  localFileOpen: true,
  canShare: false
})

/** @type {CapabilityMap} */
export const MOBILE_CAPABILITIES = Object.freeze({
  folderWorkspace: false,
  workspaceSearch: false,
  watch: false,
  windowControls: false,
  pdfExport: false,
  htmlExport: false,
  print: false,
  spellcheck: false,
  nativeMenus: false,
  externalShell: true,
  revealInFolder: false,
  splitView: false,
  fileAttachments: false,
  localHistory: false,
  diagnostics: false,
  localFileOpen: false,
  canShare: true
})

/**
 * Validate the runtime bridge without importing Electron or Capacitor. A
 * capability may be false and omit its methods; once advertised as true, all
 * methods tied to that capability become mandatory.
 *
 * @param {unknown} api
 * @param {string} [label]
 * @returns {string[]}
 */
export function validateApiContract(api, label = 'window.api') {
  const errors = []
  if (!api || typeof api !== 'object') return [`${label}: API object is required`]

  const candidate = /** @type {Record<string, unknown>} */ (api)
  if (typeof candidate.platform !== 'string' || !candidate.platform) {
    errors.push(`${label}: platform must be a non-empty string`)
  }
  if (typeof candidate.safeMode !== 'boolean') {
    errors.push(`${label}: safeMode must be a boolean`)
  }

  const capabilities = candidate.capabilities
  if (!capabilities || typeof capabilities !== 'object') {
    errors.push(`${label}: capabilities object is required`)
  } else {
    const flags = /** @type {Record<string, unknown>} */ (capabilities)
    for (const key of CAPABILITY_KEYS) {
      if (typeof flags[key] !== 'boolean') {
        errors.push(`${label}: capability "${key}" must be a boolean`)
      }
    }
    for (const key of Object.keys(flags)) {
      if (!CAPABILITY_KEYS.includes(/** @type {CapabilityKey} */ (key))) {
        errors.push(`${label}: unknown capability "${key}"`)
      }
    }
  }

  for (const method of CORE_API_METHODS) {
    if (typeof candidate[method] !== 'function') {
      errors.push(`${label}: core method "${method}" is required`)
    }
  }

  if (capabilities && typeof capabilities === 'object') {
    const flags = /** @type {Record<string, unknown>} */ (capabilities)
    for (const key of CAPABILITY_KEYS) {
      if (flags[key] !== true) continue
      for (const method of CAPABILITY_METHODS[key]) {
        if (typeof candidate[method] !== 'function') {
          errors.push(`${label}: capability "${key}" requires method "${method}"`)
        }
      }
    }
  }

  return errors
}

/**
 * @template T
 * @param {T} api
 * @param {string} [label]
 * @returns {T}
 */
export function assertApiContract(api, label = 'window.api') {
  const errors = validateApiContract(api, label)
  if (errors.length) throw new TypeError(errors.join('\n'))
  return api
}
