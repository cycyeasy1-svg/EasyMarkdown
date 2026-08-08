import { describe, expect, it } from 'vitest'
import { shouldCreateMainWindow } from '../src/main/window-lifecycle.js'

describe('main window lifecycle', () => {
  it('recreates a missing or destroyed window only after Electron is ready', () => {
    expect(shouldCreateMainWindow({ isReady: true, windowExists: false, isDestroyed: false })).toBe(true)
    expect(shouldCreateMainWindow({ isReady: true, windowExists: true, isDestroyed: true })).toBe(true)
    expect(shouldCreateMainWindow({ isReady: true, windowExists: true, isDestroyed: false })).toBe(false)
    expect(shouldCreateMainWindow({ isReady: false, windowExists: false, isDestroyed: false })).toBe(false)
  })
})
