import { describe, expect, it, vi } from 'vitest'
import { registerWindowIpc } from '../src/main/window-ipc.js'

function createIpcMain() {
  const handlers = new Map()
  const listeners = new Map()
  return {
    handlers,
    listeners,
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel),
    on: (channel, listener) => listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel)
    },
    invoke: (channel, ...args) => handlers.get(channel)({}, ...args),
    emit: (channel, ...args) => listeners.get(channel)?.({}, ...args)
  }
}

function setup({ maximized = false, quitting = false } = {}) {
  const ipcMain = createIpcMain()
  let isMaximized = maximized
  let allowClose = false
  let isQuitting = quitting
  const window = {
    minimize: vi.fn(),
    maximize: vi.fn(() => {
      isMaximized = true
    }),
    unmaximize: vi.fn(() => {
      isMaximized = false
    }),
    isMaximized: vi.fn(() => isMaximized),
    close: vi.fn()
  }
  const app = { quit: vi.fn() }
  const unregister = registerWindowIpc({
    ipcMain,
    app,
    getMainWindow: () => window,
    getIsQuitting: () => isQuitting,
    setAllowClose: (value) => {
      allowClose = value
    },
    setIsQuitting: (value) => {
      isQuitting = value
    }
  })
  return {
    ipcMain,
    window,
    app,
    unregister,
    getState: () => ({ allowClose, isQuitting })
  }
}

describe('window IPC', () => {
  it('registers the complete window and close-confirmation contract', () => {
    const { ipcMain } = setup()
    expect([...ipcMain.handlers.keys()]).toEqual([
      'window:minimize',
      'window:toggleMaximize',
      'window:close',
      'window:isMaximized'
    ])
    expect([...ipcMain.listeners.keys()]).toEqual(['app:confirm-close', 'app:cancel-close'])
  })

  it('minimizes, toggles maximize state, and closes the active window', () => {
    const { ipcMain, window } = setup()
    ipcMain.invoke('window:minimize')
    expect(window.minimize).toHaveBeenCalledOnce()
    expect(ipcMain.invoke('window:toggleMaximize')).toBe(true)
    expect(window.maximize).toHaveBeenCalledOnce()
    expect(ipcMain.invoke('window:toggleMaximize')).toBe(false)
    expect(window.unmaximize).toHaveBeenCalledOnce()
    ipcMain.invoke('window:close')
    expect(window.close).toHaveBeenCalledOnce()
  })

  it('returns safe defaults when no main window exists', () => {
    const ipcMain = createIpcMain()
    registerWindowIpc({
      ipcMain,
      app: { quit: vi.fn() },
      getMainWindow: () => null,
      getIsQuitting: () => false,
      setAllowClose: vi.fn(),
      setIsQuitting: vi.fn()
    })
    expect(ipcMain.invoke('window:isMaximized')).toBe(false)
    expect(ipcMain.invoke('window:toggleMaximize')).toBe(false)
    expect(() => ipcMain.invoke('window:minimize')).not.toThrow()
    expect(() => ipcMain.invoke('window:close')).not.toThrow()
  })

  it('confirms an ordinary close without quitting the macOS app lifecycle', () => {
    const { ipcMain, window, app, getState } = setup()
    ipcMain.emit('app:confirm-close')
    expect(getState().allowClose).toBe(true)
    expect(window.close).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
  })

  it('confirms a real quit and clears a cancelled quit intent', () => {
    const { ipcMain, window, app, getState } = setup({ quitting: true })
    ipcMain.emit('app:confirm-close')
    expect(app.quit).toHaveBeenCalledOnce()
    expect(window.close).not.toHaveBeenCalled()
    ipcMain.emit('app:cancel-close')
    expect(getState().isQuitting).toBe(false)
  })

  it('unregisters every channel it owns', () => {
    const { ipcMain, unregister } = setup()
    unregister()
    expect(ipcMain.handlers.size).toBe(0)
    expect(ipcMain.listeners.size).toBe(0)
  })
})
