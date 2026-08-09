const WINDOW_HANDLE_CHANNELS = [
  'window:minimize',
  'window:toggleMaximize',
  'window:close',
  'window:isMaximized'
]

// Window IPC is dependency-injected so its lifecycle rules stay unit-testable
// without importing Electron. index.js owns the mutable app/window state; this
// module owns the channel contract and transitions.
export function registerWindowIpc({
  ipcMain,
  app,
  getMainWindow,
  getIsQuitting,
  setAllowClose,
  setIsQuitting
}) {
  const minimize = () => getMainWindow()?.minimize()
  const toggleMaximize = () => {
    const window = getMainWindow()
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  }
  const close = () => getMainWindow()?.close()
  const isMaximized = () => getMainWindow()?.isMaximized() ?? false

  ipcMain.handle('window:minimize', minimize)
  ipcMain.handle('window:toggleMaximize', toggleMaximize)
  ipcMain.handle('window:close', close)
  ipcMain.handle('window:isMaximized', isMaximized)

  // The renderer confirmed there are no unsaved changes, or the user chose to
  // discard them. A real quit closes the app; an ordinary window close keeps
  // the macOS app lifecycle intact.
  const confirmClose = () => {
    setAllowClose(true)
    if (getIsQuitting()) app.quit()
    else getMainWindow()?.close()
  }
  const cancelClose = () => setIsQuitting(false)

  ipcMain.on('app:confirm-close', confirmClose)
  ipcMain.on('app:cancel-close', cancelClose)

  return () => {
    for (const channel of WINDOW_HANDLE_CHANNELS) ipcMain.removeHandler(channel)
    ipcMain.removeListener('app:confirm-close', confirmClose)
    ipcMain.removeListener('app:cancel-close', cancelClose)
  }
}
