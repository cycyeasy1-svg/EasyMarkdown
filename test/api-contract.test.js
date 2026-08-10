import { describe, expect, it } from 'vitest'
import {
  assertApiContract,
  CAPABILITY_KEYS,
  CAPABILITY_METHODS,
  CORE_API_METHODS,
  DESKTOP_CAPABILITIES,
  MOBILE_CAPABILITIES,
  validateApiContract
} from '../src/shared/api-contract.js'

const noop = () => {}

function makeApi(capabilities = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, false]))) {
  const api = { platform: 'test', safeMode: false, capabilities }
  for (const method of CORE_API_METHODS) api[method] = noop
  for (const key of CAPABILITY_KEYS) {
    if (!capabilities[key]) continue
    for (const method of CAPABILITY_METHODS[key]) api[method] = noop
  }
  return api
}

describe('window.api contract', () => {
  it('keeps complete boolean capability profiles for desktop and mobile', () => {
    for (const profile of [DESKTOP_CAPABILITIES, MOBILE_CAPABILITIES]) {
      expect(Object.keys(profile).sort()).toEqual([...CAPABILITY_KEYS].sort())
      expect(Object.values(profile).every((value) => typeof value === 'boolean')).toBe(true)
    }
  })

  it('accepts a complete API and returns it from the assertion', () => {
    const api = makeApi(DESKTOP_CAPABILITIES)
    expect(validateApiContract(api, 'desktop')).toEqual([])
    expect(assertApiContract(api, 'desktop')).toBe(api)
  })

  it('requires every capability key and core method', () => {
    const capabilities = { ...MOBILE_CAPABILITIES }
    delete capabilities.diagnostics
    capabilities.futureCapability = true
    const api = makeApi(capabilities)
    delete api.readFile
    const errors = validateApiContract(api, 'mobile')
    expect(errors).toContain('mobile: capability "diagnostics" must be a boolean')
    expect(errors).toContain('mobile: unknown capability "futureCapability"')
    expect(errors).toContain('mobile: core method "readFile" is required')
  })

  it('requires methods only when a capability is advertised', () => {
    const disabled = makeApi(MOBILE_CAPABILITIES)
    expect(validateApiContract(disabled)).toEqual([])

    const enabled = makeApi({ ...MOBILE_CAPABILITIES, diagnostics: true })
    delete enabled.exportDiagnostics
    expect(validateApiContract(enabled)).toContain(
      'window.api: capability "diagnostics" requires method "exportDiagnostics"'
    )
  })

  it('fails closed with a readable aggregate error', () => {
    expect(() => assertApiContract(null, 'bridge')).toThrow('bridge: API object is required')
  })
})
