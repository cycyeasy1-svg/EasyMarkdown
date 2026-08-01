import { app } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// Dynamic imports are emitted under out/main/chunks/. Preserve the entry
// directory so the full main module resolves preload/renderer assets from
// out/main just as it did before code splitting.
globalThis.easymarkdownMainDir = dirname(fileURLToPath(import.meta.url))

// Keep the second-instance path deliberately tiny. Static imports are evaluated
// before a module body, so putting requestSingleInstanceLock() in the full main
// module still made every file-association launch load the whole application
// before it could forward argv to the running instance.
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  const queuedArgv = []
  const queuedOpenFiles = []
  let routeSecondInstance = null
  let routeOpenFile = null

  app.on('second-instance', (_event, argv) => {
    if (routeSecondInstance) routeSecondInstance(argv)
    else queuedArgv.push(argv)
  })
  // Finder can emit open-file before the dynamically imported main module has
  // registered its lifecycle handlers. Capture it at the bootstrap boundary.
  app.on('open-file', (event, path) => {
    event.preventDefault()
    if (routeOpenFile) routeOpenFile(path)
    else queuedOpenFiles.push(path)
  })

  try {
    // Await primary initialization so launch harnesses and Electron lifecycle
    // hooks do not observe a completed entry module before app.whenReady() and
    // the BrowserWindow setup have been registered. The lock-losing secondary
    // path above still exits without importing any of this code.
    const { handleOpenFile, handleSecondInstance } = await import('./index.js')
    routeSecondInstance = handleSecondInstance
    routeOpenFile = handleOpenFile
    for (const argv of queuedArgv.splice(0)) routeSecondInstance(argv)
    for (const path of queuedOpenFiles.splice(0)) routeOpenFile(path)
  } catch (error) {
    console.error('Failed to initialize EasyMarkdown:', error)
    app.quit()
  }
}
