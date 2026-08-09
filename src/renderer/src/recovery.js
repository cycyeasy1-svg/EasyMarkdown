import { LS } from './paths.js'
import { SETTINGS_KEY } from './settings.js'

export const RENDERER_SAFE_MODE_KEY = 'easymarkdown.safe-mode.renderer.v1'

export function isRendererSafeModeRequested(storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem(RENDERER_SAFE_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function requestRendererSafeMode(storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(RENDERER_SAFE_MODE_KEY, '1')
    return true
  } catch {
    return false
  }
}

export function clearRendererSafeModeRequest(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(RENDERER_SAFE_MODE_KEY)
    return true
  } catch {
    return false
  }
}

export function resetRecoveryState(kind, storage = globalThis.localStorage) {
  const key = kind === 'session' ? LS : kind === 'settings' ? SETTINGS_KEY : null
  if (!key) throw new TypeError(`Unsupported recovery reset: ${kind}`)
  storage?.removeItem(key)
  return key
}
