import { describe, expect, it, vi } from 'vitest'
import { createTrustedIpcMain, UNTRUSTED_IPC_RESULT } from '../src/main/trusted-ipc.js'

function createRawIpcMain() {
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
    }
  }
}

describe('trusted IPC facade', () => {
  it('runs handlers only for a trusted event with a valid payload', async () => {
    const raw = createRawIpcMain()
    const trustedEvent = { trusted: true }
    const handler = vi.fn((_event, value) => value * 2)
    const ipc = createTrustedIpcMain({
      ipcMain: raw,
      isTrustedEvent: (event) => event === trustedEvent,
      validateArgs: (_channel, args) => typeof args[0] === 'number'
    })
    ipc.handle('sample:double', handler)

    expect(raw.handlers.get('sample:double')(trustedEvent, 4)).toBe(8)
    expect(raw.handlers.get('sample:double')({ trusted: false }, 4)).toBe(UNTRUSTED_IPC_RESULT)
    expect(() => raw.handlers.get('sample:double')(trustedEvent, '4')).toThrow(
      'Invalid IPC payload for sample:double.'
    )
    expect(handler).toHaveBeenCalledOnce()
  })

  it('ignores untrusted events and removes the wrapped listener by its original identity', () => {
    const raw = createRawIpcMain()
    const trustedEvent = { trusted: true }
    const listener = vi.fn()
    const ipc = createTrustedIpcMain({
      ipcMain: raw,
      isTrustedEvent: (event) => event === trustedEvent
    })
    ipc.on('sample:event', listener)
    const wrapped = raw.listeners.get('sample:event')
    wrapped({ trusted: false }, 'ignored')
    wrapped(trustedEvent, 'accepted')
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(trustedEvent, 'accepted')
    ipc.removeListener('sample:event', listener)
    expect(raw.listeners.has('sample:event')).toBe(false)
  })
})
