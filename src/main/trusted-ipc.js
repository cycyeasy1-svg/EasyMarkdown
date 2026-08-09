export const UNTRUSTED_IPC_RESULT = Object.freeze({
  ok: false,
  error: 'Untrusted renderer.'
})

// A small facade over Electron's ipcMain. Every handler/listener registered
// through it receives the same sender-frame and argument-policy checks, so a
// newly added channel cannot accidentally omit the security boundary.
export function createTrustedIpcMain({ ipcMain, isTrustedEvent, validateArgs = () => true }) {
  const listenerWrappers = new Map()

  const facade = {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedEvent(event)) return UNTRUSTED_IPC_RESULT
        if (!validateArgs(channel, args)) {
          throw new TypeError(`Invalid IPC payload for ${channel}.`)
        }
        return handler(event, ...args)
      })
    },

    removeHandler(channel) {
      ipcMain.removeHandler(channel)
    },

    on(channel, listener) {
      const wrapped = (event, ...args) => {
        if (!isTrustedEvent(event) || !validateArgs(channel, args)) return
        return listener(event, ...args)
      }
      let channelListeners = listenerWrappers.get(channel)
      if (!channelListeners) {
        channelListeners = new Map()
        listenerWrappers.set(channel, channelListeners)
      }
      channelListeners.set(listener, wrapped)
      ipcMain.on(channel, wrapped)
      return facade
    },

    removeListener(channel, listener) {
      const channelListeners = listenerWrappers.get(channel)
      const wrapped = channelListeners?.get(listener)
      ipcMain.removeListener(channel, wrapped || listener)
      channelListeners?.delete(listener)
      if (channelListeners && channelListeners.size === 0) listenerWrappers.delete(channel)
      return facade
    }
  }

  return facade
}
