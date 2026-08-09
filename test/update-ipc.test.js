import { describe, expect, it, vi } from 'vitest'
import {
  LATEST_RELEASE_API,
  RELEASES_URL,
  checkForUpdate,
  registerUpdateIpc
} from '../src/main/update-ipc.js'

describe('update IPC', () => {
  it('normalizes the latest release and caps notes sent to the renderer', async () => {
    const fetchRelease = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v2.3.4',
        html_url: 'https://example.test/release',
        name: 'Warm update',
        body: 'x'.repeat(5000)
      })
    }))
    const result = await checkForUpdate({
      fetchRelease,
      getCurrentVersion: () => '1.4.0'
    })
    expect(fetchRelease).toHaveBeenCalledWith(
      LATEST_RELEASE_API,
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'EasyMarkdown-Updater' })
      })
    )
    expect(result).toEqual({
      ok: true,
      latest: '2.3.4',
      current: '1.4.0',
      url: 'https://example.test/release',
      name: 'Warm update',
      notes: 'x'.repeat(4000)
    })
  })

  it('uses safe defaults for optional release metadata', async () => {
    const result = await checkForUpdate({
      fetchRelease: async () => ({ ok: true, json: async () => ({ tag_name: '1.5.0' }) }),
      getCurrentVersion: () => '1.4.0'
    })
    expect(result).toEqual({
      ok: true,
      latest: '1.5.0',
      current: '1.4.0',
      url: RELEASES_URL,
      name: '',
      notes: ''
    })
  })

  it('fails closed for HTTP, network, and JSON errors', async () => {
    await expect(
      checkForUpdate({
        fetchRelease: async () => ({ ok: false }),
        getCurrentVersion: () => '1.4.0'
      })
    ).resolves.toEqual({ ok: false })
    await expect(
      checkForUpdate({
        fetchRelease: async () => {
          throw new Error('offline')
        },
        getCurrentVersion: () => '1.4.0'
      })
    ).resolves.toEqual({ ok: false })
    await expect(
      checkForUpdate({
        fetchRelease: async () => ({
          ok: true,
          json: async () => {
            throw new Error('invalid JSON')
          }
        }),
        getCurrentVersion: () => '1.4.0'
      })
    ).resolves.toEqual({ ok: false })
  })

  it('registers and removes the update channel', async () => {
    const handlers = new Map()
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel)
    }
    const unregister = registerUpdateIpc({
      ipcMain,
      fetchRelease: async () => ({ ok: false }),
      getCurrentVersion: () => '1.4.0'
    })
    await expect(handlers.get('update:check')()).resolves.toEqual({ ok: false })
    unregister()
    expect(handlers.has('update:check')).toBe(false)
  })
})
