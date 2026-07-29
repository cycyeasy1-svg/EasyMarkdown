// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyRichToClipboard } from '../src/renderer/src/ui.js'

describe('copyRichToClipboard', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: undefined
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    })
  })

  it('prefers the Electron bridge for packaged desktop renderers', async () => {
    const copyRich = vi.fn().mockResolvedValue(true)
    const browserWrite = vi.fn()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { copyRich }
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: browserWrite }
    })

    await expect(copyRichToClipboard('<b>apple</b>', 'apple')).resolves.toBe(true)
    expect(copyRich).toHaveBeenCalledWith('<b>apple</b>', 'apple')
    expect(browserWrite).not.toHaveBeenCalled()
  })

  it('falls back to plain text when rich Web Clipboard writes are rejected', async () => {
    const write = vi.fn().mockRejectedValue(new Error('rich clipboard denied'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write, writeText }
    })

    await expect(copyRichToClipboard('<b>apple</b>', 'apple')).resolves.toBe(true)
    expect(write).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('apple')
  })
})
