// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { LS } from '../src/renderer/src/paths.js'
import { SETTINGS_KEY } from '../src/renderer/src/settings.js'
import {
  RENDERER_SAFE_MODE_KEY,
  clearRendererSafeModeRequest,
  isRendererSafeModeRequested,
  requestRendererSafeMode,
  resetRecoveryState
} from '../src/renderer/src/recovery.js'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('renderer recovery state', () => {
  it('requests and clears a reload-scoped safe mode without deleting data', () => {
    localStorage.setItem(LS, '{"openPaths":["/tmp/note.md"]}')
    expect(requestRendererSafeMode()).toBe(true)
    expect(sessionStorage.getItem(RENDERER_SAFE_MODE_KEY)).toBe('1')
    expect(isRendererSafeModeRequested()).toBe(true)
    expect(localStorage.getItem(LS)).not.toBeNull()
    expect(clearRendererSafeModeRequest()).toBe(true)
    expect(isRendererSafeModeRequested()).toBe(false)
  })

  it('resets session and settings independently', () => {
    localStorage.setItem(LS, '{}')
    localStorage.setItem(SETTINGS_KEY, '{}')
    resetRecoveryState('session')
    expect(localStorage.getItem(LS)).toBeNull()
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('{}')

    localStorage.setItem(LS, '{}')
    resetRecoveryState('settings')
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull()
    expect(localStorage.getItem(LS)).toBe('{}')
  })
})
