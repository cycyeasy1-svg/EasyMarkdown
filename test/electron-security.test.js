import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { isTrustedIpcEvent } from '../src/main/security.js'

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')

describe('Electron security baseline', () => {
  it('accepts only the trusted webContents main frame at the current app URL', () => {
    const mainFrame = { url: 'file:///app/out/renderer/index.html' }
    const trustedWebContents = {
      mainFrame,
      getURL: () => 'file:///app/out/renderer/index.html'
    }
    const trustedEvent = { sender: trustedWebContents, senderFrame: mainFrame }
    expect(isTrustedIpcEvent({ event: trustedEvent, trustedWebContents })).toBe(true)
    expect(
      isTrustedIpcEvent({
        event: { ...trustedEvent, senderFrame: { url: mainFrame.url } },
        trustedWebContents
      })
    ).toBe(false)
    expect(
      isTrustedIpcEvent({
        event: { sender: {}, senderFrame: mainFrame },
        trustedWebContents
      })
    ).toBe(false)
  })

  it('allows the configured dev origin but rejects an unrelated sender URL', () => {
    const mainFrame = { url: 'http://127.0.0.1:5173/' }
    const trustedWebContents = { mainFrame, getURL: () => mainFrame.url }
    const event = { sender: trustedWebContents, senderFrame: mainFrame }
    expect(
      isTrustedIpcEvent({
        event,
        trustedWebContents,
        devRendererUrl: 'http://127.0.0.1:5173/'
      })
    ).toBe(true)
    mainFrame.url = 'https://attacker.invalid/'
    expect(
      isTrustedIpcEvent({
        event,
        trustedWebContents,
        devRendererUrl: 'http://127.0.0.1:5173/'
      })
    ).toBe(false)
  })

  it('locks the build to a sandbox-compatible preload and forbids webSecurity opt-out', async () => {
    const [main, config] = await Promise.all([
      readSource('src/main/index.js'),
      readSource('electron.vite.config.mjs')
    ])
    expect(main).toContain("preload: join(__dirname, '../preload/index.cjs')")
    expect(main).toMatch(
      /contextIsolation:\s*true[\s\S]*nodeIntegration:\s*false[\s\S]*sandbox:\s*true/
    )
    expect(main).not.toMatch(/webSecurity:\s*false/)
    expect(config).toMatch(/format:\s*'cjs'/)
    expect(config).toMatch(/entryFileNames:\s*'\[name\]\.cjs'/)
  })

  it('keeps default-app registration and its system process chain out of runtime code', async () => {
    const [main, preload] = await Promise.all([
      readSource('src/main/index.js'),
      readSource('src/preload/index.js')
    ])
    for (const source of [main, preload]) {
      expect(source).not.toContain('app:setDefaultOpener')
      expect(source).not.toContain('setDefaultOpener')
      expect(source).not.toMatch(/reg\.exe|rundll32\.exe/i)
    }
  })
})
