import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem, shell, net, nativeTheme, session, clipboard } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, basename, extname, resolve, relative, sep } from 'node:path'
import fs from 'node:fs/promises'
import { existsSync, statSync, constants as fsConstants } from 'node:fs'
import chokidar from 'chokidar'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  MD_EXTS,
  MD_RE,
  isAbsolutePath,
  isRestrictedRoot,
  imageNameParts,
  attachmentNameParts,
  getAllowedExternalUrl,
  searchContentLines,
  extractMarkdownHeadings,
  shouldSkipWorkspaceEntry,
  docLangAttr,
  winDefaultOpenerRegOps
} from './helpers.js'
import {
  appendLocalHistorySnapshot,
  localHistoryMetadata
} from './local-history.js'
import {
  createFileRenamePlan,
  createHeadingRenamePlan,
  diagnoseMarkdownContent,
  findMarkdownReferences
} from './markdown-links.js'
import { canGrantLocalFonts, createLocalFontGrant } from './security.js'
import {
  DEFAULT_FONT_WRITE_EN,
  DEFAULT_FONT_WRITE_ZH,
  DEFAULT_FONT_WRITE_JA,
  exportTypographyCss
} from '../shared/fonts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isInternalDemoBuild = __INTERNAL_UPDATE_DEMO__

async function openExternalUrl(url) {
  const allowedUrl = getAllowedExternalUrl(url)
  if (!allowedUrl) return { ok: false, error: 'Unsupported external URL.' }
  try {
    await shell.openExternal(allowedUrl)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
}

// Keep the app responsive when it comes back from being backgrounded — i.e. the
// "lags for a beat after I unlock / re-focus" complaint. Chromium aggressively
// power-saves a hidden window: it throttles background timers, lowers the
// renderer process priority, and — the big one for lock-screen — treats a fully
// occluded window as hidden, releasing compositor/GPU state that then has to be
// re-acquired (a visible hitch) on the next activation. These switches turn that
// off so re-focus is instant. Trade-off: slightly higher idle power/CPU while in
// the background, which is fine for a foreground editing app. Must be set before
// app is ready, so they live at module top level. See webPreferences.
// backgroundThrottling below (the per-window twin of the timer-throttling flag).
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

// MD_EXTS / MD_RE (Markdown file types), isAbsolutePath, isRestrictedRoot and
// imageNameParts are pure — they live in ./helpers.js so the unit tests can
// import them without an Electron runtime.

// Print stylesheet for PDF export — a clean, warm reading layout.
const PDF_CSS = `
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .doc {
    font-family: ${DEFAULT_FONT_WRITE_EN};
    font-size: 14.5px; line-height: 1.75; color: #2a2620;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    word-wrap: break-word;
  }
  /* docLangAttr selects the CJK fallback stack while Latin glyphs continue to
     come from the English stack. Keep these defaults aligned with app.css. */
  .doc:lang(zh) {
    font-family: ${DEFAULT_FONT_WRITE_ZH};
  }
  .doc:lang(ja) {
    font-family: ${DEFAULT_FONT_WRITE_JA};
  }
  .doc > :first-child { margin-top: 0 !important; }
  .doc h1, .doc h2, .doc h3, .doc h4, .doc h5, .doc h6 {
    color: #16130e; font-weight: 700; line-height: 1.3; margin: 1.6em 0 0.6em;
    page-break-after: avoid;
  }
  .doc h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 2px solid #e6e1d8; letter-spacing: -0.01em; }
  .doc h2 { font-size: 1.5em; padding-bottom: 0.2em; border-bottom: 1px solid #ece7de; }
  .doc h3 { font-size: 1.25em; }
  .doc h4 { font-size: 1.05em; }
  .doc h5 { font-size: 1em; }
  .doc h6 { font-size: 0.92em; color: #6b655c; }
  .doc p { margin: 0.85em 0; }
  .doc a { color: #c86b35; text-decoration: none; border-bottom: 1px solid rgba(200,107,53,.35); }
  .doc strong { font-weight: 700; color: #16130e; }
  .doc em { font-style: italic; }
  .doc ul, .doc ol { margin: 0.8em 0; padding-left: 1.6em; }
  .doc li { margin: 0.32em 0; }
  .doc li::marker { color: #c86b35; }
  /* Keep mode's blocks come through verbatim (renderDoc with forExport), so the
     export honors the same two source signals the screen does: a loose list (blank
     line between items) and, when the blank-line-spacing setting is on, the --km-gap
     that a run of blank lines stamps on the following block. */
  .doc ul.km-loose > li, .doc ol.km-loose > li { margin: 0.85em 0; }
  .doc .km-block[data-gap] { margin-top: calc(var(--km-gap, 0) * 1.75em); }
  /* ==highlight== / <mark class="hm-hl-…">, same palette as the app. */
  .doc mark { color: inherit; padding: 0.05em 0.15em; border-radius: 2px; background: #fff3a3; }
  .doc mark.hm-hl-red { background: #ffc6c6; }
  .doc mark.hm-hl-blue { background: #bcd9ff; }
  .doc blockquote {
    margin: 1em 0; padding: 0.5em 1.1em; border-left: 3px solid #c86b35;
    background: rgba(200,107,53,.06); color: #6b655c; border-radius: 0 6px 6px 0;
    page-break-inside: avoid;
  }
  .doc blockquote p { margin: 0.3em 0; }
  .doc code {
    font-family: 'SF Mono', SFMono-Regular, Consolas, Monaco, monospace; font-size: 0.88em;
    background: #f4f1ea; padding: 0.12em 0.4em; border-radius: 4px; color: #b3431f;
  }
  .doc pre {
    background: #f4f1ea; border: 1px solid #e6e1d8; border-radius: 8px;
    padding: 14px 16px; margin: 1em 0; overflow: hidden; page-break-inside: avoid;
  }
  .doc pre code {
    background: none; padding: 0; color: #2a2620; font-size: 0.86em; line-height: 1.6;
    white-space: pre-wrap; word-break: break-word;
  }
  .doc table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.95em; page-break-inside: avoid; }
  .doc th, .doc td { border: 1px solid #e6e1d8; padding: 8px 12px; text-align: left; vertical-align: top; }
  .doc th { background: #f4f1ea; font-weight: 700; color: #16130e; }
  .doc tr:nth-child(even) td { background: #faf8f4; }
  .doc img { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 1em auto; page-break-inside: avoid; }
  .doc hr { border: none; border-top: 1px solid #e6e1d8; margin: 1.8em 0; }
  .doc input[type="checkbox"] { margin-right: 0.4em; }
`

let mainWindow = null
let localFontGrant = null
// When true, the window is allowed to close without re-prompting (the renderer
// has confirmed there are no unsaved changes, or the user chose to discard).
let allowClose = false
// True once a real app quit is underway (Cmd/Ctrl+Q, menu Quit). Lets the close
// handler tell "quit the app" apart from "just close the window" (macOS keeps the
// app running on window close, but Cmd+Q must fully quit).
let isQuitting = false
// Non-null only for the separately packaged `internal-demo` distribution.
// Public ZIP/NSIS builds do not carry its distribution marker.
let internalDemoUpdater = null
const watchers = new Map() // folder path -> watcher
const fileWatchers = new Map() // file path -> { watcher, timer }

// ---- Safety net: never let a stray async error abort the whole app ----
// chokidar (and other fs/network async work) can reject with EACCES/EPERM when
// it touches a path we can't read — e.g. watching a folder whose subtree
// includes restricted system files. With Node's default unhandled-rejection
// behaviour an unhandled one of these would crash (SIGABRT) the main process on
// launch. Log and swallow instead; the watcher's own error handler does the rest.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (ignored):', reason?.message || reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (ignored):', err?.message || err)
})

// ---- Single instance: route any second launch into the existing window ----
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const { files, folders } = extractArgs(argv)
    focusMainWindow()
    if (folders.length) sendOpen('open-folder', folders[0])
    if (files.length) sendOpen('open-paths', files)
  })
}

// Split launch args into markdown files and folders. A folder argument (from
// the Explorer "Open with EasyMarkdown" folder menu) opens as a workspace; markdown
// files open as tabs. Non-existent paths and flags are ignored.
function extractArgs(argv) {
  const files = []
  const folders = []
  // The app's own directory (in dev, argv includes "." / the project path). Never
  // open it as a workspace — that's how a bogus relative/CWD workspace slipped in.
  let appDir = null
  try {
    appDir = resolve(app.getAppPath())
  } catch {
    /* not ready yet */
  }
  for (const a of argv.slice(1)) {
    if (a.startsWith('-')) continue
    // Resolve to an absolute path so a relative arg (e.g. ".") never becomes a
    // workspace that later resolves against the process CWD.
    const abs = resolve(a)
    if (appDir && abs === appDir) continue
    if (!existsSync(abs)) continue
    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) folders.push(abs)
    else if (MD_RE.test(abs)) files.push(abs)
  }
  return { files, folders }
}

function focusMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

// ---- Launch-file delivery: queue until the renderer is listening ----
// webContents.send is fire-and-forget: an 'open-paths'/'open-folder' sent
// before the renderer has mounted its IPC listeners is silently dropped. That
// race is widest exactly when it hurts — a cold boot (Defender scanning the
// unsigned exe, cold disk cache) where ready-to-show / a second double-click
// fires while React is still loading, or before the window even exists. So
// launch-file sends go through this queue and flush when the renderer says
// 'app:renderer-ready' (App.jsx mount, after it registers the listeners).
let rendererReady = false
const pendingOpens = []
function sendOpen(channel, payload) {
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  } else {
    pendingOpens.push([channel, payload])
  }
}
ipcMain.on('app:renderer-ready', () => {
  rendererReady = true
  for (const [channel, payload] of pendingOpens.splice(0)) sendToRenderer(channel, payload)
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    // Match the boot splash's background (index.html: light #ebe7e0 / dark
    // #16130e via prefers-color-scheme) so the first painted frame doesn't
    // flash a mismatched tint — the old fixed dark value showed a dark flicker
    // on light-theme systems.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16130e' : '#ebe7e0',
    // Dev-only window icon: the packaged app already gets its icon from
    // build/icon.ico|icns via electron-builder, and build/ isn't bundled into
    // the asar — so only point at it when running unpacked (npm run dev), else
    // Electron warns about a missing file.
    icon: app.isPackaged ? undefined : join(__dirname, '../../build/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    // macOS: place the traffic lights at a fixed spot so the renderer can
    // reserve a matching gap (see `.app.is-mac` rules in app.css). y centers the
    // ~12px buttons within the 40px top bar.
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    // Windows/Linux: no native caption-button overlay — the renderer draws its
    // own minimize / maximize / close controls (so they can have custom hover
    // states). macOS keeps its native traffic lights via hiddenInset above.
    titleBarOverlay: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // Security: keep the renderer isolated from Node. These are Electron's
      // defaults, but we set them explicitly so the posture is obvious and
      // robust against future default changes. sandbox stays off because the
      // preload is an ES module (the sandbox requires a CommonJS preload).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      // Don't throttle rendering/timers when the window is in the background —
      // the per-window twin of the disable-background-timer-throttling switch
      // set at module top. Keeps re-focus after idle/lock snappy.
      backgroundThrottling: false
    }
  })

  // Enter the default maximized state while the window is still hidden. If we
  // wait until ready-to-show, Windows can expose the 1280x820 restore bounds for
  // a frame before the maximize transition completes.
  mainWindow.maximize()

  // A cold boot can hold first paint back for many seconds (Defender scans the
  // unsigned exe + asar on the first run after a reboot, on a cold disk cache).
  // With show:false + ready-to-show only, that reads as "double-click did
  // nothing" and invites a second click. Show the window (splash-matched
  // backgroundColor) after a few seconds even if the renderer hasn't painted,
  // so the user sees the app IS starting.
  const showFallbackTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      if (!mainWindow.isMaximized()) mainWindow.maximize()
      focusMainWindow()
    }
  }, 3000)

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallbackTimer)
    // Open maximized by default so the user doesn't have to click the
    // maximize button on every launch. The 1280×820 size above is the
    // restore size once they un-maximize.
    if (!mainWindow.isMaximized()) mainWindow.maximize()
    focusMainWindow()
    const { files, folders } = extractArgs(process.argv)
    if (folders.length) sendOpen('open-folder', folders[0])
    if (files.length) sendOpen('open-paths', files)
  })

  // A reload (e.g. Ctrl+R in dev) tears the renderer's listeners down — treat
  // it as not-ready again so launch-file sends queue instead of vanishing.
  mainWindow.webContents.on('did-start-loading', () => {
    rendererReady = false
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url)
    return { action: 'deny' }
  })

  // Security: never let the window navigate away from our own app content
  // (e.g. a malicious link in a Markdown file). Open external URLs in the
  // user's browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    void openExternalUrl(url)
  })

  // Spellcheck is an opt-in preference (settings), reported by the renderer via
  // 'spell:set' after mount. Start disabled so Chinese/Japanese prose isn't
  // covered in squiggles before the preference arrives.
  mainWindow.webContents.session.setSpellCheckerEnabled(false)

  // Native context menu ONLY for misspelled words (suggestions + add-to-dict).
  // Everything else keeps the renderer's own context menus untouched.
  mainWindow.webContents.on('context-menu', (_e, params) => {
    if (!params.misspelledWord) return
    const wc = mainWindow.webContents
    const L = MENU_STRINGS[menuLang] || MENU_STRINGS.en
    const menu = new Menu()
    for (const s of (params.dictionarySuggestions || []).slice(0, 5)) {
      menu.append(new MenuItem({ label: s, click: () => wc.replaceMisspelling(s) }))
    }
    if (params.dictionarySuggestions?.length) menu.append(new MenuItem({ type: 'separator' }))
    menu.append(
      new MenuItem({
        label: L.addToDictionary || MENU_STRINGS.en.addToDictionary,
        click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
    )
    menu.popup()
  })

  // Keep the renderer's maximize/restore button icon in sync with the real
  // window state (e.g. double-click drag-to-maximize, OS shortcuts).
  const emitMaxState = () => sendToRenderer('window:maximized', mainWindow?.isMaximized() ?? false)
  mainWindow.on('maximize', emitMaxState)
  mainWindow.on('unmaximize', emitMaxState)

  // Warn about unsaved changes before the window closes (macOS traffic light,
  // the custom Windows close button, Cmd/Ctrl+Q). The dirty state lives in the
  // renderer, so defer the close and ask it; it calls back via 'app:confirm-close'
  // (proceed) or 'app:cancel-close' (abort).
  allowClose = false
  mainWindow.on('close', (e) => {
    if (allowClose) return
    e.preventDefault()
    sendToRenderer('app-close-request')
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// macOS: opening a file from Finder
app.on('open-file', (event, path) => {
  event.preventDefault()
  focusMainWindow()
  sendOpen('open-paths', [path])
})

app.whenReady().then(() => {
  ensureThemesDir()
  buildMenu()
  const allowLocalFonts = (webContents, permission, requestingUrl, isMainFrame) =>
    canGrantLocalFonts({
      permission,
      webContentsId: webContents?.id,
      trustedWebContentsId: mainWindow?.webContents.id,
      requestingUrl,
      currentUrl: webContents?.getURL() || '',
      devRendererUrl: process.env.ELECTRON_RENDERER_URL,
      isMainFrame,
      grant: localFontGrant
    })
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(allowLocalFonts(webContents, permission, details?.requestingUrl || '', details?.isMainFrame))
  })
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
    allowLocalFonts(webContents, permission, details?.requestingUrl || requestingOrigin, details?.isMainFrame)
  )
  createWindow()
  if (isInternalDemoBuild) {
    void import('./internal-updater.js')
      .then(({ createInternalDemoUpdater }) => createInternalDemoUpdater({
        app,
        resourcesPath: process.resourcesPath,
        sendState: (state) => sendToRenderer('update:state', state)
      }))
      .then((updater) => {
        internalDemoUpdater = updater
        if (updater) console.info('[updater] Internal demo update channel enabled.')
      })
      .catch((error) => {
        console.warn('[updater] Internal demo update channel was not enabled:', error?.message || error)
      })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// A real quit is starting (Cmd/Ctrl+Q, menu Quit, app.quit()). Mark it so the
// window 'close' handler quits the app rather than just closing the window.
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ----------------------------- IPC: file system -----------------------------

ipcMain.handle('dialog:openFiles', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: MD_EXTS },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return res.canceled ? [] : res.filePaths
})

ipcMain.handle('dialog:openAttachments', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Attach Files'
  })
  return res.canceled ? [] : res.filePaths
})

ipcMain.handle('dialog:openFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  return res.canceled ? null : res.filePaths[0]
})

ipcMain.handle('dialog:saveAs', async (_e, defaultName) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'Untitled.md',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
  })
  return res.canceled ? null : res.filePath
})

// Export the current document (inline-styled HTML from the renderer) to a PDF
// by rendering it in a hidden window and using Chromium's printToPDF.
ipcMain.handle('export:pdf', async (_e, { html, defaultName, typography }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'Untitled.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (res.canceled || !res.filePath) return { canceled: true }

  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${PDF_CSS}${exportTypographyCss(typography)}</style></head><body><div class="doc"${docLangAttr(html)}>${html}</div></body></html>`

  const tmp = join(app.getPath('temp'), `easymarkdown-export-${Date.now()}.html`)
  await fs.writeFile(tmp, doc, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { webSecurity: false } })
  try {
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await fs.writeFile(res.filePath, pdf)
  } finally {
    if (!win.isDestroyed()) win.destroy()
    fs.unlink(tmp).catch(() => {})
  }
  shell.openPath(res.filePath)
  return { path: res.filePath }
})

// Export the current document as a self-contained .html file: same inline-
// styled snapshot the PDF pipeline uses, wrapped in a standalone page with the
// print stylesheet, with local (file://) images inlined as data: URLs so the
// file survives being mailed / moved on its own.
const HTML_EXPORT_CSS = `
  @media screen { body { max-width: 880px; margin: 0 auto; padding: 44px 28px; } }
`

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon'
}

async function inlineFileImages(html) {
  const urls = new Set()
  for (const m of html.matchAll(/src="(file:\/\/[^"]+)"/g)) urls.add(m[1])
  let out = html
  for (const url of urls) {
    try {
      const p = fileURLToPath(decodeURI(url).replace(/&amp;/g, '&'))
      const mime = MIME_BY_EXT[extname(p).toLowerCase()]
      if (!mime) continue
      const data = await fs.readFile(p)
      out = out.split(`src="${url}"`).join(`src="data:${mime};base64,${data.toString('base64')}"`)
    } catch {
      /* unreadable image — leave the file:// src in place */
    }
  }
  return out
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

ipcMain.handle('export:html', async (_e, { html, defaultName, title, typography }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'Untitled.html',
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (res.canceled || !res.filePath) return { canceled: true }
  const body = await inlineFileImages(html)
  const doc =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(title)}</title>` +
    `<style>${PDF_CSS}${exportTypographyCss(typography)}${HTML_EXPORT_CSS}</style></head>` +
    `<body><div class="doc"${docLangAttr(body)}>${body}</div></body></html>`
  await fs.writeFile(res.filePath, doc, 'utf8')
  shell.openPath(res.filePath)
  return { path: res.filePath }
})

// ── Workspace full-text search ──
// Streaming: search:start returns an id immediately, then per-file result
// batches arrive on 'search:batch' and a final 'search:done' — the UI shows
// hits as they're found instead of blocking on the whole workspace. Guards:
// only absolute non-restricted roots, IGNORED_DIRS/dot-dirs skipped, files
// > 1 MB skipped, ≤ 50 hits per file, ≤ 500 total (then truncated), depth ≤ 12.
// A new search (or search:cancel) bumps the token; the running walk sees the
// stale token and stops silently.
let searchGeneration = 0
const SEARCH_MAX_TOTAL = 500
const SEARCH_MAX_PER_FILE = 50
const SEARCH_MAX_FILE_BYTES = 1024 * 1024
const SEARCH_MAX_DEPTH = 12

async function runWorkspaceSearch(id, roots, query, options) {
  let total = 0
  let filesScanned = 0
  let truncated = false
  const stale = () => id !== searchGeneration

  const walk = async (dir, depth) => {
    if (stale() || truncated || depth > SEARCH_MAX_DEPTH) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (stale() || truncated) return
      if (shouldSkipWorkspaceEntry(e.name, e.isDirectory(), options?.showHidden)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(p, depth + 1)
      } else if (e.isFile() && MD_RE.test(e.name)) {
        try {
          const st = await fs.stat(p)
          if (st.size > SEARCH_MAX_FILE_BYTES) continue
          const content = await fs.readFile(p, 'utf8')
          if (stale()) return
          filesScanned++
          const { matches } = searchContentLines(content, query, options, SEARCH_MAX_PER_FILE)
          if (!matches.length) continue
          let items = matches
          if (total + items.length >= SEARCH_MAX_TOTAL) {
            items = items.slice(0, SEARCH_MAX_TOTAL - total)
            truncated = true
          }
          total += items.length
          if (items.length) sendToRenderer('search:batch', { id, path: p, items })
        } catch {
          /* unreadable file — skip */
        }
      }
    }
  }

  for (const root of roots) {
    if (stale() || truncated) break
    if (typeof root !== 'string' || isRestrictedRoot(root)) continue
    await walk(root, 0)
  }
  if (!stale()) sendToRenderer('search:done', { id, total, filesScanned, truncated })
}

ipcMain.handle('search:start', (_e, { roots, query, options }) => {
  const id = ++searchGeneration
  const q = String(query ?? '')
  if (!q.trim()) return { id, error: '' }
  // Validate a regex up front so the UI can flag it without waiting for a walk.
  if (options?.regex) {
    try {
      new RegExp(q)
    } catch {
      return { id, error: 'regex' }
    }
  }
  runWorkspaceSearch(id, Array.isArray(roots) ? roots : [], q, options || {})
  return { id, error: '' }
})

ipcMain.handle('search:cancel', () => {
  searchGeneration++
})

// ── Markdown link intelligence ──
// All workspace-wide work is deliberately on demand: opening the Problems /
// References surface or requesting a rename starts a bounded walk. Nothing is
// indexed during app startup or ordinary typing.
const LINK_INDEX_MAX_FILES = 5000
const LINK_INDEX_MAX_FILE_BYTES = 1024 * 1024
const LINK_INDEX_MAX_DEPTH = 12

async function readMarkdownWorkspaceFiles(roots, options = {}) {
  const files = []
  const seen = new Set()
  let scanned = 0
  let truncated = false
  let yieldedAt = 0
  const overrides = new Map(
    (Array.isArray(options.overrides) ? options.overrides : [])
      .filter((item) => item?.path && typeof item.content === 'string')
      .map((item) => [resolve(item.path), item.content])
  )
  const safeRoots = [...new Set(Array.isArray(roots) ? roots : [])]
    .filter((root) => typeof root === 'string' && !isRestrictedRoot(root))

  const addFile = async (path) => {
    const absolute = resolve(path)
    const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute
    if (seen.has(key) || files.length >= LINK_INDEX_MAX_FILES) return
    seen.add(key)
    scanned += 1
    try {
      const override = overrides.get(absolute)
      if (override != null) {
        files.push({ path: absolute, content: override })
      } else {
        const stat = await fs.stat(absolute)
        if (!stat.isFile() || stat.size > LINK_INDEX_MAX_FILE_BYTES) return
        files.push({ path: absolute, content: await fs.readFile(absolute, 'utf8') })
      }
    } catch {
      /* unreadable/deleted file — skip */
    }
    if (scanned - yieldedAt >= 25) {
      yieldedAt = scanned
      await new Promise((resolveYield) => setImmediate(resolveYield))
    }
  }

  const walk = async (dir, depth = 0) => {
    if (depth > LINK_INDEX_MAX_DEPTH || files.length >= LINK_INDEX_MAX_FILES) {
      truncated = true
      return
    }
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= LINK_INDEX_MAX_FILES) {
        truncated = true
        return
      }
      if (shouldSkipWorkspaceEntry(entry.name, entry.isDirectory(), options.showHidden)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path, depth + 1)
      else if (entry.isFile() && /\.(md|markdown|mdx)$/i.test(entry.name)) await addFile(path)
    }
  }

  for (const root of safeRoots) await walk(root, 0)
  // An open target can sit outside the current workspace. Include explicit
  // overrides even when no workspace root contains them.
  for (const path of overrides.keys()) await addFile(path)
  return { files, filesScanned: scanned, truncated }
}

ipcMain.handle('markdown-links:diagnose', async (_e, payload = {}) => {
  const docPath = typeof payload.docPath === 'string' ? payload.docPath : ''
  const content = String(payload.content ?? '')
  if (!docPath) return { problems: [], error: 'unsaved' }
  const problems = await diagnoseMarkdownContent({
    docPath,
    content,
    exists: async (path) => {
      try {
        return (await fs.stat(path)).isFile()
      } catch {
        return false
      }
    },
    readFile: (path) => fs.readFile(path, 'utf8')
  })
  return { problems, error: '' }
})

ipcMain.handle('markdown-links:references', async (_e, payload = {}) => {
  const targetPath = typeof payload.targetPath === 'string' ? payload.targetPath : ''
  if (!targetPath) return { groups: [], filesScanned: 0, truncated: false, error: 'no-target' }
  const roots = [...(Array.isArray(payload.roots) ? payload.roots : []), dirname(targetPath)]
  const indexed = await readMarkdownWorkspaceFiles(roots, {
    showHidden: !!payload.showHidden,
    overrides: payload.overrides
  })
  return {
    groups: findMarkdownReferences(indexed.files, targetPath, String(payload.anchor || '')),
    filesScanned: indexed.filesScanned,
    truncated: indexed.truncated,
    error: ''
  }
})

ipcMain.handle('markdown-links:plan-heading-rename', async (_e, payload = {}) => {
  const targetPath = typeof payload.targetPath === 'string' ? payload.targetPath : ''
  if (!targetPath) return { error: 'no-target', files: [], totalChanges: 0 }
  const roots = [...(Array.isArray(payload.roots) ? payload.roots : []), dirname(targetPath)]
  const indexed = await readMarkdownWorkspaceFiles(roots, {
    showHidden: !!payload.showHidden,
    overrides: payload.overrides
  })
  return {
    ...createHeadingRenamePlan(
      indexed.files,
      targetPath,
      payload.line,
      payload.newHeading
    ),
    filesScanned: indexed.filesScanned,
    truncated: indexed.truncated
  }
})

ipcMain.handle('markdown-links:plan-file-rename', async (_e, payload = {}) => {
  const oldPath = typeof payload.oldPath === 'string' ? payload.oldPath : ''
  const newPath = typeof payload.newPath === 'string' ? payload.newPath : ''
  if (!oldPath || !newPath) return { error: 'no-target', files: [], totalChanges: 0 }
  const roots = [...(Array.isArray(payload.roots) ? payload.roots : []), dirname(oldPath)]
  const indexed = await readMarkdownWorkspaceFiles(roots, {
    showHidden: !!payload.showHidden,
    overrides: payload.overrides
  })
  return {
    ...createFileRenamePlan(indexed.files, oldPath, newPath),
    filesScanned: indexed.filesScanned,
    truncated: indexed.truncated
  }
})

async function validateMarkdownPlan(plan) {
  if (!plan || !Array.isArray(plan.files)) throw new Error('Invalid Markdown update plan.')
  for (const file of plan.files) {
    if (!file?.path || typeof file.original !== 'string' || typeof file.updated !== 'string') {
      throw new Error('Invalid Markdown update plan.')
    }
    const current = await fs.readFile(file.path, 'utf8')
    if (current !== file.original) {
      throw new Error(`The file changed after preview: ${file.path}`)
    }
  }
}

async function writeMarkdownPlan(plan) {
  await validateMarkdownPlan(plan)
  const written = []
  try {
    for (const file of plan.files) {
      await fs.writeFile(file.path, file.updated, 'utf8')
      written.push(file)
    }
  } catch (error) {
    const rollbackErrors = []
    for (const file of written.reverse()) {
      try {
        await fs.writeFile(file.path, file.original, 'utf8')
      } catch (rollbackError) {
        rollbackErrors.push(`${file.path}: ${rollbackError?.message || rollbackError}`)
      }
    }
    const suffix = rollbackErrors.length
      ? ` Rollback also failed: ${rollbackErrors.join('; ')}`
      : ' Completed files were rolled back.'
    throw new Error(`${error?.message || error}${suffix}`)
  }
  const files = []
  for (const file of plan.files) {
    const stat = await fs.stat(file.path)
    files.push({ path: file.path, content: file.updated, mtimeMs: stat.mtimeMs })
  }
  return files
}

ipcMain.handle('markdown-links:apply-plan', async (_e, plan) => ({
  ok: true,
  files: await writeMarkdownPlan(plan)
}))

ipcMain.handle('markdown-links:rename-file', async (_e, payload = {}) => {
  const oldPath = String(payload.oldPath || '')
  const newPath = String(payload.newPath || '')
  if (!oldPath || !newPath) throw new Error('Invalid rename target.')
  if (existsSync(newPath) && newPath.toLowerCase() !== oldPath.toLowerCase()) {
    throw new Error('A file or folder with that name already exists.')
  }
  const plan = payload.updateLinks ? payload.plan : { files: [] }
  await validateMarkdownPlan(plan)
  const written = []
  try {
    for (const file of plan.files) {
      await fs.writeFile(file.path, file.updated, 'utf8')
      written.push(file)
    }
    await fs.rename(oldPath, newPath)
  } catch (error) {
    for (const file of written.reverse()) {
      try {
        await fs.writeFile(file.path, file.original, 'utf8')
      } catch {
        /* the thrown message below still makes the partial failure explicit */
      }
    }
    throw new Error(`${error?.message || error} Link changes were rolled back where possible.`)
  }
  const files = []
  for (const file of plan.files) {
    const resultPath = file.path.toLowerCase() === oldPath.toLowerCase() ? newPath : file.path
    const stat = await fs.stat(resultPath)
    files.push({ path: resultPath, content: file.updated, mtimeMs: stat.mtimeMs })
  }
  return { ok: true, files }
})

// Print the current document via the system print dialog. Same hidden-window
// rendering pipeline as export:pdf, but ends in webContents.print() so the
// user picks a printer / paper / copies natively.
ipcMain.handle('print:html', async (_e, { html, typography }) => {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${PDF_CSS}${exportTypographyCss(typography)}</style></head><body><div class="doc"${docLangAttr(html)}>${html}</div></body></html>`
  const tmp = join(app.getPath('temp'), `easymarkdown-print-${Date.now()}.html`)
  await fs.writeFile(tmp, doc, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { webSecurity: false } })
  try {
    await win.loadFile(tmp)
    // The window must stay alive until the dialog is done — print() resolves
    // its callback after the user prints or cancels.
    const ok = await new Promise((resolve) => {
      win.webContents.print({ printBackground: true }, (success) => resolve(success))
    })
    return { ok }
  } finally {
    if (!win.isDestroyed()) win.destroy()
    fs.unlink(tmp).catch(() => {})
  }
})

ipcMain.handle('fs:readFile', async (_e, path) => {
  const content = await fs.readFile(path, 'utf8')
  const stat = await fs.stat(path)
  return { content, mtimeMs: stat.mtimeMs }
})

ipcMain.handle('fs:writeFile', async (_e, path, content) => {
  await fs.writeFile(path, content, 'utf8')
  const stat = await fs.stat(path)
  return { mtimeMs: stat.mtimeMs }
})

const LOCAL_HISTORY_MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
const LOCAL_HISTORY_MAX_TOTAL_BYTES = 64 * 1024 * 1024
const localHistoryDir = () => join(app.getPath('userData'), 'local-history')
const localHistoryKey = (docPath) =>
  createHash('sha256')
    .update(process.platform === 'win32' ? docPath.toLowerCase() : docPath)
    .digest('hex')
const localHistoryFile = (docPath) => join(localHistoryDir(), `${localHistoryKey(docPath)}.json`)

async function readLocalHistoryRecord(docPath) {
  try {
    const record = JSON.parse(await fs.readFile(localHistoryFile(docPath), 'utf8'))
    return record?.path === docPath && Array.isArray(record.snapshots)
      ? record
      : { version: 1, path: docPath, snapshots: [] }
  } catch {
    return { version: 1, path: docPath, snapshots: [] }
  }
}

async function writeLocalHistoryRecord(docPath, record) {
  await fs.mkdir(localHistoryDir(), { recursive: true })
  await fs.writeFile(localHistoryFile(docPath), JSON.stringify(record), 'utf8')
}

async function pruneLocalHistoryStorage(protectedFile = '') {
  let entries
  try {
    entries = await fs.readdir(localHistoryDir(), { withFileTypes: true })
  } catch {
    return
  }
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = join(localHistoryDir(), entry.name)
    try {
      const stat = await fs.stat(path)
      files.push({ path, size: stat.size, mtimeMs: stat.mtimeMs })
    } catch {
      /* file disappeared while pruning */
    }
  }
  let total = files.reduce((sum, file) => sum + file.size, 0)
  files.sort((a, b) => {
    if (a.path === protectedFile) return 1
    if (b.path === protectedFile) return -1
    return a.mtimeMs - b.mtimeMs
  })
  for (const file of files) {
    if (total <= LOCAL_HISTORY_MAX_TOTAL_BYTES) break
    try {
      await fs.rm(file.path, { force: true })
      total -= file.size
    } catch {
      /* best effort */
    }
  }
}

ipcMain.handle('history:add', async (_e, payload) => {
  const docPath = payload?.path
  const content = payload?.content
  if (!isAbsolutePath(docPath) || typeof content !== 'string') {
    return { ok: false, error: 'Invalid history snapshot.' }
  }
  const size = Buffer.byteLength(content, 'utf8')
  if (size > LOCAL_HISTORY_MAX_SNAPSHOT_BYTES) {
    return { ok: false, skipped: 'too-large' }
  }
  const record = await readLocalHistoryRecord(docPath)
  const result = appendLocalHistorySnapshot(record, {
    id: randomUUID(),
    path: docPath,
    content,
    reason: payload?.reason === 'autosave' ? 'autosave' : 'manual',
    size
  })
  if (result.changed) {
    await writeLocalHistoryRecord(docPath, result.record)
    await pruneLocalHistoryStorage(localHistoryFile(docPath))
  }
  return { ok: true, entries: localHistoryMetadata(result.record) }
})

ipcMain.handle('history:list', async (_e, docPath) => {
  if (!isAbsolutePath(docPath)) return []
  return localHistoryMetadata(await readLocalHistoryRecord(docPath))
})

ipcMain.handle('history:read', async (_e, docPath, snapshotId) => {
  if (!isAbsolutePath(docPath) || typeof snapshotId !== 'string') return null
  const record = await readLocalHistoryRecord(docPath)
  const snapshot = record.snapshots.find((item) => item.id === snapshotId)
  return snapshot
    ? {
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        reason: snapshot.reason,
        size: snapshot.size,
        content: snapshot.content
      }
    : null
})

ipcMain.handle('history:delete', async (_e, docPath, snapshotId) => {
  if (!isAbsolutePath(docPath)) return { ok: false }
  const file = localHistoryFile(docPath)
  if (!snapshotId) {
    await fs.rm(file, { force: true })
    return { ok: true, entries: [] }
  }
  const record = await readLocalHistoryRecord(docPath)
  const next = {
    ...record,
    snapshots: record.snapshots.filter((item) => item.id !== snapshotId)
  }
  if (next.snapshots.length) await writeLocalHistoryRecord(docPath, next)
  else await fs.rm(file, { force: true })
  return { ok: true, entries: localHistoryMetadata(next) }
})

ipcMain.handle('history:clear', async () => {
  const userDataRoot = resolve(app.getPath('userData'))
  const root = resolve(localHistoryDir())
  if (root !== userDataRoot && root.startsWith(userDataRoot + sep)) {
    await fs.rm(root, { recursive: true, force: true })
    return { ok: true }
  }
  return { ok: false }
})

ipcMain.handle('fs:rename', async (_e, oldPath, newPath) => {
  // Don't clobber an existing different file/folder (fs.rename overwrites
  // silently → data loss). Still allow a case-only rename on case-insensitive
  // filesystems (e.g. Foo.md → foo.md), where target and source are "the same".
  if (existsSync(newPath) && newPath.toLowerCase() !== oldPath.toLowerCase()) {
    throw new Error('A file or folder with that name already exists.')
  }
  await fs.rename(oldPath, newPath)
  return true
})

ipcMain.handle('fs:delete', async (_e, path) => {
  await shell.trashItem(path)
  return true
})

ipcMain.handle('fs:createFile', async (_e, path, content = '') => {
  await fs.writeFile(path, content, { flag: 'wx' })
  return true
})

ipcMain.handle('fs:createDir', async (_e, path) => {
  await fs.mkdir(path, { recursive: true })
  return true
})

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.DS_Store', '.obsidian', 'out', 'dist'])

async function readTree(dir, { showHidden = false } = {}) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const nodes = []
  for (const e of entries) {
    if (shouldSkipWorkspaceEntry(e.name, e.isDirectory(), showHidden)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      nodes.push({ name: e.name, path: full, type: 'dir', children: null })
    } else if (MD_RE.test(e.name)) {
      nodes.push({ name: e.name, path: full, type: 'file' })
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

ipcMain.handle('fs:readDir', async (_e, dir, options) => readTree(dir, options))

async function readTreeRecursive(dir, options = {}, depth = 0, acc = {}) {
  const requestedDepth = Number(options?.maxDepth)
  const maxDepth = Number.isFinite(requestedDepth)
    ? Math.min(30, Math.max(0, requestedDepth))
    : 12
  if (depth > maxDepth) return acc
  const nodes = await readTree(dir, options)
  acc[dir] = nodes
  for (const node of nodes) {
    if (node.type === 'dir') await readTreeRecursive(node.path, options, depth + 1, acc)
  }
  return acc
}

ipcMain.handle('fs:readDirRecursive', async (_e, dir, options) => readTreeRecursive(dir, options))

async function listFilesFlat(root, dir, acc, depth) {
  if (depth > 12 || acc.length > 5000) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue
      await listFilesFlat(root, full, acc, depth + 1)
    } else if (MD_RE.test(e.name)) {
      acc.push({ name: e.name, path: full, rel: full.slice(root.length + 1).replace(/\\/g, '/') })
    }
  }
}

ipcMain.handle('fs:listFiles', async (_e, root) => {
  const acc = []
  await listFilesFlat(root, root, acc, 0)
  return acc
})

const WORKSPACE_HEADING_MAX_FILES = 5000
const WORKSPACE_HEADING_MAX_ITEMS = 3000
const WORKSPACE_HEADING_MAX_FILE_BYTES = 1024 * 1024

ipcMain.handle('workspace-headings:index', async (_e, roots, options = {}) => {
  const items = []
  let filesScanned = 0
  let truncated = false
  let yieldedAt = 0
  const safeRoots = [...new Set(Array.isArray(roots) ? roots : [])]
    .filter((root) => !isRestrictedRoot(root))

  const walk = async (root, dir, depth = 0) => {
    if (
      depth > 12 ||
      truncated ||
      filesScanned >= WORKSPACE_HEADING_MAX_FILES ||
      items.length >= WORKSPACE_HEADING_MAX_ITEMS
    ) {
      truncated = true
      return
    }
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (truncated) return
      if (shouldSkipWorkspaceEntry(entry.name, entry.isDirectory(), options.showHidden)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(root, path, depth + 1)
        continue
      }
      if (!/\.(md|markdown|mdx)$/i.test(entry.name)) continue
      filesScanned += 1
      try {
        const stat = await fs.stat(path)
        if (stat.size > WORKSPACE_HEADING_MAX_FILE_BYTES) continue
        const content = await fs.readFile(path, 'utf8')
        const headings = extractMarkdownHeadings(
          content,
          WORKSPACE_HEADING_MAX_ITEMS - items.length
        )
        const rel = relative(root, path).replace(/\\/g, '/')
        for (const heading of headings) {
          items.push({
            ...heading,
            path,
            name: entry.name,
            rel: `${basename(root)}/${rel}`
          })
          if (items.length >= WORKSPACE_HEADING_MAX_ITEMS) {
            truncated = true
            break
          }
        }
      } catch {
        /* unreadable file — skip */
      }
      if (filesScanned - yieldedAt >= 25) {
        yieldedAt = filesScanned
        await new Promise((resolveYield) => setImmediate(resolveYield))
      }
      if (filesScanned >= WORKSPACE_HEADING_MAX_FILES) truncated = true
    }
  }

  for (const root of safeRoots) {
    await walk(root, root)
    if (truncated) break
  }
  return { items, filesScanned, truncated }
})

ipcMain.handle('fs:openFolderTree', async (_e, dir) => ({
  root: { name: basename(dir), path: dir, type: 'dir' },
  children: await readTree(dir)
}))

// Paths we must never descend into: system/device trees that throw EACCES/EPERM
// when watched, plus the usual noise dirs. Watching e.g. "/" would otherwise hit
// /dev/* device files and crash the watcher.
const WATCH_IGNORE_RE =
  /(^|[\\/])(\.(git|obsidian)|node_modules)([\\/]|$)/
// isAbsolutePath / isRestrictedRoot moved to ./helpers.js (imported above).

// Watch a SINGLE directory, one level deep (NOT the whole subtree). The sidebar
// is a lazy tree — it only ever shows the directories the user has expanded — so
// the renderer watches each loaded dir on its own (see Sidebar.loadDir) instead of
// asking us to recursively crawl the root. That crawl was the startup killer:
// `depth: 12` over a workspace with hundreds of nested folders made chokidar stat
// the entire tree (×N roots) on launch, saturating the single main-process event
// loop so the renderer's own IPC (reading the active doc) stalled for seconds.
// depth:0 = one readdir + one dir watch per expanded folder; a change deep in a
// collapsed folder isn't watched (it's not visible) and is picked up fresh when
// the user expands it.
ipcMain.handle('watch:start', async (_e, dir) => {
  if (watchers.has(dir)) return true
  // Don't watch the filesystem root or restricted system trees — they contain
  // device/permission-protected files that make the watch throw.
  if (isRestrictedRoot(dir)) return false
  const w = chokidar.watch(dir, {
    ignored: (p) => WATCH_IGNORE_RE.test(p) || isRestrictedRoot(p),
    ignoreInitial: true,
    depth: 0,
    // Don't follow symlinks (they can point into restricted trees) and don't let
    // permission errors bubble up as fatal.
    followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })
  // Swallow watcher errors (EACCES/EPERM on protected paths) so they never become
  // an unhandled rejection that crashes the process.
  w.on('error', (err) => console.error('watch:start error (ignored):', err?.message || err))
  let timer = null
  // Coalesce bursts of fs events (git checkout, bulk writes, save-heavy flows) into
  // a single renderer notification — each `watch:changed` makes the Sidebar reload
  // every expanded dir, so a short window meant a flood of re-reads + tree flicker.
  // 500ms collapses a burst to one refresh; the tree updating ~0.5s after an
  // external change is imperceptible.
  const ping = () => {
    clearTimeout(timer)
    timer = setTimeout(() => sendToRenderer('watch:changed', dir), 500)
  }
  w.on('add', ping).on('unlink', ping).on('addDir', ping).on('unlinkDir', ping)
  watchers.set(dir, w)
  return true
})

ipcMain.handle('watch:stop', async (_e, dir) => {
  const w = watchers.get(dir)
  if (w) {
    await w.close()
    watchers.delete(dir)
  }
  return true
})

// Watch a single open file for external content changes (e.g. an agent edits
// the file on disk). Emits `file:changed` with the new mtime so the renderer
// can reload the tab.
ipcMain.handle('watch:file', async (_e, path) => {
  if (fileWatchers.has(path)) return true
  const w = chokidar.watch(path, {
    ignoreInitial: true,
    // Poll the file (instead of native fs events). Many editors/tools save via
    // "atomic replace" (write temp + rename over), which swaps the file's inode
    // and makes a native single-file watch go deaf after the first such save.
    // Polling re-stats the path, so it keeps catching changes regardless.
    usePolling: true,
    interval: 400,
    binaryInterval: 600,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })
  const entry = { watcher: w, timer: null }
  const notify = async () => {
    clearTimeout(entry.timer)
    entry.timer = setTimeout(async () => {
      let mtimeMs = 0
      try {
        mtimeMs = (await fs.stat(path)).mtimeMs
      } catch {
        /* file may have been removed */
      }
      sendToRenderer('file:changed', { path, mtimeMs })
    }, 80)
  }
  w.on('change', notify).on('add', notify)
  w.on('error', (err) => console.error('watch:file error (ignored):', err?.message || err))
  fileWatchers.set(path, entry)
  return true
})

ipcMain.handle('watch:unfile', async (_e, path) => {
  const entry = fileWatchers.get(path)
  if (entry) {
    clearTimeout(entry.timer)
    await entry.watcher.close()
    fileWatchers.delete(path)
  }
  return true
})

ipcMain.handle('shell:openExternal', async (event, url) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    return { ok: false, error: 'Untrusted renderer.' }
  }
  return openExternalUrl(url)
})

ipcMain.handle('clipboard:writeText', (event, text) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return false
  clipboard.writeText(String(text ?? ''))
  return true
})

ipcMain.handle('permissions:allowLocalFonts', (event) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return false
  localFontGrant = createLocalFontGrant(event.sender.id)
  return true
})
ipcMain.handle('shell:showInFolder', async (_e, path) => shell.showItemInFolder(path))

// ----------------------------- custom themes -------------------------------
// User-supplied CSS themes (e.g. migrated Typora themes) live in a `themes`
// folder under userData. Users drop a .css file in — OR a whole downloaded theme
// folder (Typora themes often ship as `name/coding/name.css` + assets), so we
// scan subfolders too. The renderer lists them, reads the CSS, and injects it.
const themesDir = () => join(app.getPath('userData'), 'themes')
async function ensureThemesDir() {
  try {
    await fs.mkdir(themesDir(), { recursive: true })
  } catch {
    /* ignore */
  }
}

async function collectThemeCss(dir, root, depth, acc) {
  if (depth > 4 || acc.length > 300) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      await collectThemeCss(full, root, depth + 1, acc)
    } else if (/\.css$/i.test(e.name)) {
      const rel = full.slice(root.length + 1).replace(/\\/g, '/')
      const relDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
      acc.push({ file: rel, name: e.name.replace(/\.css$/i, ''), dir: relDir })
    }
  }
}

ipcMain.handle('themes:list', async () => {
  await ensureThemesDir()
  const acc = []
  await collectThemeCss(themesDir(), themesDir(), 0, acc)
  return acc.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))
})

ipcMain.handle('themes:read', async (_e, file) => {
  // A .css path inside the themes dir (may be nested). Reject traversal.
  if (!file || !/\.css$/i.test(file) || file.includes('..')) throw new Error('Invalid theme file.')
  const root = resolve(themesDir())
  const full = resolve(root, file)
  if (full !== root && !full.startsWith(root + sep)) throw new Error('Invalid theme path.')
  let css = await fs.readFile(full, 'utf8')
  // Rewrite relative url(...) to absolute file:// so theme fonts/images (referenced
  // relative to the CSS file) still load when the CSS is injected into the page.
  const baseDir = dirname(full)
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, p) => {
    const t = (p || '').trim()
    if (!t || /^(https?:|data:|file:|blob:)/i.test(t) || t.startsWith('//') || t.startsWith('#')) {
      return m
    }
    try {
      return `url("${pathToFileURL(resolve(baseDir, t)).href}")`
    } catch {
      return m
    }
  })
  return css
})

ipcMain.handle('themes:reveal', async () => {
  await ensureThemesDir()
  return shell.openPath(themesDir())
})

// Pick a non-clobbering filename for `name` inside `dir`.
const uniqueImageFile = (dir, name) => {
  const { stem, ext } = imageNameParts(name)
  let file = join(dir, `${stem}${ext}`)
  let n = 1
  while (existsSync(file)) file = join(dir, `${stem}-${n++}${ext}`)
  return file
}

const uniqueAttachmentFile = (dir, name) => {
  const { stem, ext } = attachmentNameParts(name)
  let file = join(dir, `${stem}${ext}`)
  let n = 1
  while (existsSync(file)) file = join(dir, `${stem}-${n++}${ext}`)
  return file
}

ipcMain.handle('attachment:save', async (_e, docPath, sourcePath) => {
  try {
    if (!docPath) return { ok: false, error: 'Save the document before attaching files.' }
    if (!sourcePath) return { ok: false, error: 'No attachment selected.' }
    const stat = await fs.stat(sourcePath)
    if (!stat.isFile()) return { ok: false, error: 'Only files can be attached.' }
    const assetsDir = join(dirname(docPath), 'assets')
    await fs.mkdir(assetsDir, { recursive: true })
    const [sourceReal, assetsReal] = await Promise.all([fs.realpath(sourcePath), fs.realpath(assetsDir)])
    if (dirname(sourceReal) === assetsReal) {
      return { ok: true, path: 'assets/' + basename(sourceReal), name: basename(sourceReal) }
    }
    const file = uniqueAttachmentFile(assetsDir, basename(sourcePath))
    await fs.copyFile(sourcePath, file, fsConstants.COPYFILE_EXCL)
    return { ok: true, path: 'assets/' + basename(file), name: basename(sourcePath) }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
})

// The app-global folder where images pasted into an UNSAVED doc are parked (we
// don't know a document folder yet). Mirrors Typora's global image folder; on
// the doc's first save they're moved into its ./assets (see image:inlineForSave).
const pasteImagesDir = () => join(app.getPath('userData'), 'paste-images')

// Save a pasted/dropped image next to the document, in an `assets/` subfolder,
// and return the relative path to insert into the Markdown (Typora-style). The
// path for a SAVED doc; without it, pasted images become in-memory blob: URLs
// that vanish on reload.
ipcMain.handle('image:save', async (_e, docPath, name, bytes) => {
  try {
    if (!docPath) return { ok: false, error: 'No document path.' }
    const dir = join(dirname(docPath), 'assets')
    await fs.mkdir(dir, { recursive: true })
    const file = uniqueImageFile(dir, name)
    await fs.writeFile(file, Buffer.from(bytes))
    // POSIX-relative link so it round-trips in Markdown on every OS.
    return { ok: true, path: 'assets/' + basename(file) }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
})

// Save an image pasted into an UNSAVED doc to the global paste folder and return
// a file:// URL — so it shows immediately as a real path (not a base64 blob),
// like Typora. It's relocated into ./assets when the doc is first saved.
ipcMain.handle('image:savePaste', async (_e, name, bytes) => {
  try {
    const dir = pasteImagesDir()
    await fs.mkdir(dir, { recursive: true })
    const file = uniqueImageFile(dir, name)
    await fs.writeFile(file, Buffer.from(bytes))
    return { ok: true, url: pathToFileURL(file).href }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
})

// At save time, rewrite a doc's Markdown so no image link is a giant base64 blob
// or an absolute paste-folder path: base64 data URLs and file:// links in the
// global paste folder are written/moved into the doc's ./assets and rewritten to
// short relative paths (the Typora end-state). Other links are left untouched.
ipcMain.handle('image:inlineForSave', async (_e, content, targetPath) => {
  try {
    if (!content || !targetPath) return { content, changed: false }
    const matches = [...content.matchAll(/(!\[[^\]]*\]\()([^)\s]+)(\))/g)]
    if (!matches.length) return { content, changed: false }
    const assetsDir = join(dirname(targetPath), 'assets')
    // Real path so the startsWith test below survives symlinks (e.g. macOS
    // /tmp → /private/tmp), since the link's path and userData may differ.
    let pdir = pasteImagesDir()
    try {
      pdir = await fs.realpath(pdir)
    } catch {
      /* folder not created yet — nothing to relocate from it */
    }
    let ensured = false
    const ensure = async () => {
      if (!ensured) {
        await fs.mkdir(assetsDir, { recursive: true })
        ensured = true
      }
    }
    let out = ''
    let cursor = 0
    let changed = false
    for (const m of matches) {
      const [full, pre, url] = m
      out += content.slice(cursor, m.index)
      cursor = m.index + full.length
      let replacement = full
      try {
        const dataM = url.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.*)$/i)
        if (dataM) {
          await ensure()
          const ext = dataM[1].toLowerCase() === 'jpeg' ? 'jpg' : dataM[1].toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
          const file = uniqueImageFile(assetsDir, `image.${ext}`)
          await fs.writeFile(file, Buffer.from(dataM[2], 'base64'))
          replacement = pre + 'assets/' + basename(file) + ')'
          changed = true
        } else if (/^file:\/\//i.test(url)) {
          const fsPath = fileURLToPath(url)
          let realFsPath = fsPath
          try {
            realFsPath = await fs.realpath(fsPath)
          } catch {
            /* missing file — leave the link as-is */
          }
          if (realFsPath.startsWith(pdir) && existsSync(fsPath)) {
            await ensure()
            const file = uniqueImageFile(assetsDir, basename(fsPath))
            await fs.copyFile(fsPath, file)
            fs.rm(fsPath, { force: true }).catch(() => {})
            replacement = pre + 'assets/' + basename(file) + ')'
            changed = true
          }
        }
      } catch {
        /* keep the original link so the image is never lost */
      }
      out += replacement
    }
    out += content.slice(cursor)
    return { content: out, changed }
  } catch {
    return { content, changed: false }
  }
})

// Copy a file next to itself as "<name> copy<ext>", picking a free name.
ipcMain.handle('fs:duplicate', async (_e, path) => {
  const dir = dirname(path)
  const ext = extname(path)
  const stem = basename(path, ext)
  let target = join(dir, `${stem} copy${ext}`)
  let i = 2
  while (existsSync(target)) target = join(dir, `${stem} copy ${i++}${ext}`)
  // COPYFILE_EXCL: fail rather than overwrite if the target appeared between the
  // existsSync check and the copy (TOCTOU).
  await fs.copyFile(path, target, fsConstants.COPYFILE_EXCL)
  return target
})

// ----------------------------- window controls -----------------------------
// Custom min/max/close buttons (the native overlay is disabled so the renderer
// can style their hover states). macOS keeps its native traffic lights.
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
  return mainWindow.isMaximized()
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// The renderer confirmed it's safe to close (no unsaved changes, or the user
// chose to discard). If a quit is underway (Cmd/Ctrl+Q), quit the whole app;
// otherwise just close the window (macOS keeps the app running).
ipcMain.on('app:confirm-close', () => {
  allowClose = true
  if (isQuitting) app.quit()
  else mainWindow?.close()
})
// The user cancelled the close. Clear the quit intent so a later window-close
// (e.g. the macOS traffic light) isn't mistaken for a quit.
ipcMain.on('app:cancel-close', () => {
  isQuitting = false
})

// ----------------------------- update check --------------------------------
// Notify-only update check: ask GitHub for the latest *published* release
// (drafts/prereleases are excluded by this endpoint) and report its version so
// the renderer can show a "new version available" prompt. No download here.
ipcMain.handle('update:check', async () => {
  if (internalDemoUpdater) return internalDemoUpdater.checkForUpdates()
  // An internal build never falls back to the public GitHub channel. If its
  // marker/provider is invalid, fail closed and leave the editor unaffected.
  if (isInternalDemoBuild) {
    return { ok: false, internal: true, error: 'The internal update channel is not configured.' }
  }
  try {
    // Use Electron's net (Chromium's network stack), NOT Node's global fetch:
    // Node's fetch resolves DNS via the bundled c-ares, which can abort() the
    // whole main process for an unsigned app launched by Finder/launchd (observed
    // as an instant crash on open). net.fetch goes through Chromium's resolver,
    // which fails gracefully instead of crashing.
    const res = await net.fetch('https://api.github.com/repos/cycyeasy1-svg/EasyMarkdown/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EasyMarkdown-Updater' }
    })
    if (!res.ok) return { ok: false }
    const data = await res.json()
    const latest = String(data.tag_name || '').replace(/^v/i, '')
    return {
      ok: true,
      latest,
      current: app.getVersion(),
      url: data.html_url || 'https://github.com/cycyeasy1-svg/EasyMarkdown/releases',
      // The release notes (Markdown) so the prompt can show "what's new". Capped
      // so a huge changelog can't bloat the IPC payload / the toast.
      name: typeof data.name === 'string' ? data.name : '',
      notes: typeof data.body === 'string' ? data.body.slice(0, 4000) : ''
    }
  } catch {
    return { ok: false }
  }
})

ipcMain.handle('update:download', async () => {
  if (!internalDemoUpdater) {
    return { ok: false, internal: false, error: 'Internal auto-update is disabled for this distribution.' }
  }
  return internalDemoUpdater.downloadUpdate()
})

ipcMain.handle('update:install', () => {
  if (!internalDemoUpdater) {
    return { ok: false, internal: false, error: 'Internal auto-update is disabled for this distribution.' }
  }
  // The renderer has already flushed the session and confirmed any unsaved
  // documents. Let electron-updater close without triggering the same prompt a
  // second time, which could otherwise prevent the installer from launching.
  allowClose = true
  isQuitting = true
  const result = internalDemoUpdater.installDownloadedUpdate()
  if (!result?.ok) {
    allowClose = false
    isQuitting = false
  }
  return result
})

// Menu actions are forwarded to renderer as commands.
function menuCmd(cmd) {
  return () => sendToRenderer('menu', cmd)
}

// Menu labels follow the renderer's UI language (app:setLang rebuilds the menu).
// English omits role labels so Electron's native ones apply; zh/ja override
// role labels too, since the OS locale may not match the in-app language.
const MENU_STRINGS = {
  en: {
    file: 'File',
    newFile: 'New File',
    openFile: 'Open File…',
    openFolder: 'Open Folder…',
    save: 'Save',
    saveAs: 'Save As…',
    attach: 'Attach Files…',
    exportPdf: 'Export as PDF…',
    exportHtml: 'Export as HTML…',
    print: 'Print…',
    settings: 'Settings…',
    closeTab: 'Close Tab',
    reopenClosedTab: 'Reopen Closed Tab',
    edit: 'Edit',
    find: 'Find',
    replace: 'Replace',
    view: 'View',
    palette: 'Command Palette',
    searchWorkspace: 'Search in Workspace',
    toggleSidebar: 'Toggle Sidebar',
    toggleOutline: 'Toggle Outline',
    toggleSource: 'Toggle Source Mode',
    toggleTheme: 'Toggle Theme',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomReset: 'Reset Zoom',
    help: 'Help',
    userGuide: 'User Guide',
    keyboardShortcuts: 'Keyboard Shortcuts',
    addToDictionary: 'Add to Dictionary'
  },
  zh: {
    file: '文件',
    newFile: '新建文件',
    openFile: '打开文件…',
    openFolder: '打开文件夹…',
    save: '保存',
    saveAs: '另存为…',
    attach: '添加附件…',
    exportPdf: '导出为 PDF…',
    exportHtml: '导出为 HTML…',
    print: '打印…',
    settings: '设置…',
    closeTab: '关闭标签页',
    reopenClosedTab: '重新打开已关闭的标签',
    closeWindow: '关闭窗口',
    quit: '退出',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    find: '查找',
    replace: '替换',
    view: '视图',
    palette: '命令面板',
    searchWorkspace: '在工作区中搜索',
    toggleSidebar: '切换侧边栏',
    toggleOutline: '切换大纲',
    toggleSource: '切换源码模式',
    toggleTheme: '切换主题',
    zoomIn: '放大',
    zoomOut: '缩小',
    zoomReset: '重置缩放',
    fullscreen: '切换全屏',
    devTools: '开发者工具',
    window: '窗口',
    help: '帮助',
    userGuide: '使用指南',
    keyboardShortcuts: '键盘快捷键',
    addToDictionary: '添加到词典'
  },
  ja: {
    file: 'ファイル',
    newFile: '新規ファイル',
    openFile: 'ファイルを開く…',
    openFolder: 'フォルダーを開く…',
    save: '保存',
    saveAs: '名前を付けて保存…',
    attach: '添付ファイルを追加…',
    exportPdf: 'PDF として書き出す…',
    exportHtml: 'HTML として書き出す…',
    print: '印刷…',
    settings: '設定…',
    closeTab: 'タブを閉じる',
    reopenClosedTab: '閉じたタブを再度開く',
    closeWindow: 'ウィンドウを閉じる',
    quit: '終了',
    edit: '編集',
    undo: '元に戻す',
    redo: 'やり直す',
    cut: '切り取り',
    copy: 'コピー',
    paste: '貼り付け',
    selectAll: 'すべて選択',
    find: '検索',
    replace: '置換',
    view: '表示',
    palette: 'コマンドパレット',
    searchWorkspace: 'ワークスペース内を検索',
    toggleSidebar: 'サイドバーの切替',
    toggleOutline: 'アウトラインの切替',
    toggleSource: 'ソースモードの切替',
    toggleTheme: 'テーマの切替',
    zoomIn: '拡大',
    zoomOut: '縮小',
    zoomReset: 'ズームをリセット',
    fullscreen: 'フルスクリーンの切替',
    devTools: '開発者ツール',
    window: 'ウィンドウ',
    help: 'ヘルプ',
    userGuide: '使い方ガイド',
    keyboardShortcuts: 'キーボードショートカット',
    addToDictionary: '辞書に追加'
  }
}

let menuLang = 'en'

// A role item keeps Electron's native (OS-localized) label unless the current
// menu language provides an explicit override.
function roleItem(role, label, extra) {
  return label ? { role, label, ...extra } : { role, ...extra }
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const L = MENU_STRINGS[menuLang] || MENU_STRINGS.en
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: L.file,
      submenu: [
        { label: L.newFile, accelerator: 'CmdOrCtrl+N', click: menuCmd('new') },
        { label: L.openFile, accelerator: 'CmdOrCtrl+O', click: menuCmd('open') },
        { label: L.openFolder, accelerator: 'CmdOrCtrl+Shift+O', click: menuCmd('openFolder') },
        { type: 'separator' },
        { label: L.save, accelerator: 'CmdOrCtrl+S', click: menuCmd('save') },
        { label: L.saveAs, accelerator: 'CmdOrCtrl+Shift+S', click: menuCmd('saveAs') },
        { label: L.attach, click: menuCmd('attach') },
        { label: L.exportPdf, accelerator: 'CmdOrCtrl+Shift+E', click: menuCmd('exportPdf') },
        { label: L.exportHtml, accelerator: 'CmdOrCtrl+Shift+H', click: menuCmd('exportHtml') },
        // Ctrl/Cmd+P is the command palette, so print gets the Alt variant.
        { label: L.print, accelerator: 'CmdOrCtrl+Alt+P', click: menuCmd('print') },
        { type: 'separator' },
        { label: L.settings, accelerator: 'CmdOrCtrl+,', click: menuCmd('settings') },
        { type: 'separator' },
        { label: L.closeTab, accelerator: 'CmdOrCtrl+W', click: menuCmd('closeTab') },
        {
          label: L.reopenClosedTab,
          accelerator: 'CmdOrCtrl+Shift+T',
          // Renderer capture handles this so the shortcut also works while an
          // editor/input owns focus. Keep the accelerator visible in the menu
          // without registering a second native handler that would double-fire.
          registerAccelerator: false,
          click: menuCmd('reopenClosedTab')
        },
        // macOS: give "Close Window" Shift+Cmd+W so it doesn't fight Close Tab
        // for Cmd+W (role 'close' otherwise defaults to Cmd+W). Windows: Quit.
        isMac
          ? roleItem('close', L.closeWindow, { accelerator: 'Shift+CmdOrCtrl+W' })
          : roleItem('quit', L.quit)
      ]
    },
    {
      label: L.edit,
      submenu: [
        roleItem('undo', L.undo),
        roleItem('redo', L.redo),
        { type: 'separator' },
        roleItem('cut', L.cut),
        roleItem('copy', L.copy),
        roleItem('paste', L.paste),
        roleItem('selectAll', L.selectAll),
        { type: 'separator' },
        { label: L.find, accelerator: 'CmdOrCtrl+F', click: menuCmd('find') },
        // macOS: ⌘H hides the app, so replace uses the VS Code-style ⌥⌘F there.
        { label: L.replace, accelerator: isMac ? 'Alt+Cmd+F' : 'Ctrl+H', click: menuCmd('replace') }
      ]
    },
    {
      label: L.view,
      submenu: [
        { label: L.palette, accelerator: 'CmdOrCtrl+P', click: menuCmd('palette') },
        { label: L.searchWorkspace, accelerator: 'CmdOrCtrl+Shift+F', click: menuCmd('searchWorkspace') },
        // Sidebar toggle is handled in the renderer (capture phase) so it wins
        // over the editor's Ctrl/Cmd+B "bold" binding instead of conflicting.
        { label: L.toggleSidebar, click: menuCmd('toggleSidebar') },
        { label: L.toggleOutline, accelerator: 'CmdOrCtrl+Shift+L', click: menuCmd('toggleOutline') },
        { label: L.toggleSource, accelerator: 'CmdOrCtrl+/', click: menuCmd('toggleSource') },
        { type: 'separator' },
        { label: L.toggleTheme, click: menuCmd('toggleTheme') },
        { type: 'separator' },
        // Content-only zoom (not Electron's whole-window webFrame zoom): the
        // renderer scales just the editor document. Keep the familiar
        // accelerators so Cmd/Ctrl +/-/0 feel native.
        //
        // zoomReset deliberately carries NO accelerator: a menu accelerator does
        // not consume the keydown, so Cmd/Ctrl+0 would reach the rich editor's
        // own Ctrl+0 (heading → paragraph) as well, and one keypress would do
        // two unrelated things. The renderer binds Cmd/Ctrl+0 in the capture
        // phase instead and dispatches by caret location — see App.jsx.
        { label: L.zoomIn, accelerator: 'CmdOrCtrl+=', click: menuCmd('zoomIn') },
        { label: L.zoomIn, accelerator: 'CmdOrCtrl+Plus', click: menuCmd('zoomIn'), visible: false, acceleratorWorksWhenHidden: true },
        { label: L.zoomOut, accelerator: 'CmdOrCtrl+-', click: menuCmd('zoomOut') },
        { label: L.zoomReset, click: menuCmd('zoomReset') },
        { type: 'separator' },
        roleItem('togglefullscreen', L.fullscreen),
        roleItem('toggleDevTools', L.devTools)
      ]
    },
    roleItem('windowMenu', L.window),
    {
      role: 'help',
      label: L.help,
      submenu: [
        {
          label: L.userGuide,
          accelerator: 'F1',
          registerAccelerator: false,
          click: menuCmd('help')
        },
        { label: L.keyboardShortcuts, click: menuCmd('shortcuts') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Renderer reports its UI language (on mount and on every switch) so the
// native menu follows the in-app language instead of staying English.
ipcMain.handle('app:setLang', (_e, lang) => {
  const next = MENU_STRINGS[lang] ? lang : 'en'
  if (next === menuLang) return
  menuLang = next
  buildMenu()
})

// "Set as default Markdown app" (Settings → System). Windows 10+ blocks
// programmatic UserChoice writes (hash-protected), so the legitimate flow is:
// (1) make sure this exe is registered as a per-user handler — the NSIS
// installer already registers per-machine, this also covers zip/portable
// builds; (2) open the system "how do you want to open .md files?" picker on a
// scratch file so the user confirms once with "always". Skipped when not
// packaged (process.execPath is the bare electron.exe in dev — registering it
// would associate .md with a broken command). macOS has no supported API at
// all → return { manual: true } and the renderer shows Finder instructions.
ipcMain.handle('app:setDefaultOpener', async () => {
  if (process.platform !== 'win32') return { ok: false, manual: true }
  try {
    if (app.isPackaged) {
      for (const args of winDefaultOpenerRegOps(process.execPath, ['md', 'markdown', 'mdx'])) {
        await new Promise((resolve, reject) =>
          execFile('reg.exe', args, (err) => (err ? reject(err) : resolve()))
        )
      }
    }
    const scratch = join(app.getPath('userData'), 'set-default-opener.md')
    await fs.writeFile(scratch, '# EasyMarkdown\n')
    // OpenAs_RunDLL treats the REST OF THE COMMAND LINE as the file name and
    // does not strip quotes — verbatim args stop Node from quoting a path that
    // contains spaces (e.g. a user name with a space).
    spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', scratch], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true
    }).unref()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
})

// Toggle Chromium's built-in spellchecker (opt-in preference; default off).
// Windows/Linux use Hunspell dictionaries — pick the OS locale + English,
// filtered to what's actually available (zh/ja have no dictionaries, which is
// fine: the spellchecker just skips CJK text). macOS uses the native system
// spellchecker, where setSpellCheckerLanguages is a no-op.
ipcMain.handle('spell:set', (_e, enabled) => {
  const ses = mainWindow?.webContents.session
  if (!ses) return
  if (enabled && process.platform !== 'darwin') {
    try {
      const avail = ses.availableSpellCheckerLanguages || []
      const want = [app.getLocale(), 'en-US'].filter((l) => avail.includes(l))
      ses.setSpellCheckerLanguages([...new Set(want)])
    } catch {
      /* keep whatever Chromium defaults to */
    }
  }
  ses.setSpellCheckerEnabled(!!enabled)
})
