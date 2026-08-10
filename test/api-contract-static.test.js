import { describe, expect, it } from 'vitest'
import {
  extractObjectPropertyIdentifier,
  extractObjectLiteralKeys,
  requiredApiKeys,
  validateApiSource
} from '../scripts/check-api-contract.mjs'
import { MOBILE_CAPABILITIES } from '../src/shared/api-contract.js'

describe('static platform API contract', () => {
  it('extracts explicit, shorthand and method members', () => {
    const result = extractObjectLiteralKeys(`
      const readFile = () => {}
      const api = { readFile, platform: 'test', save() {} }
    `)
    expect(result).toEqual({ keys: ['platform', 'readFile', 'save'], errors: [] })
  })

  it('rejects spread and computed members that would hide the surface', () => {
    const result = extractObjectLiteralKeys(`const api = { ...base, ['read' + 'File']: fn }`)
    expect(result.errors).toHaveLength(2)
  })

  it('requires the platform profile to be referenced directly', () => {
    const source = `const api = { capabilities: MOBILE_CAPABILITIES }`
    expect(extractObjectPropertyIdentifier(source, 'api', 'capabilities')).toBe(
      'MOBILE_CAPABILITIES'
    )
    const result = validateApiSource(
      `const api = { capabilities: {} }; assertApiContract(api)`,
      MOBILE_CAPABILITIES,
      'mobile',
      'mobile.js',
      'MOBILE_CAPABILITIES'
    )
    expect(result.errors.some((error) => error.includes('MOBILE_CAPABILITIES'))).toBe(true)
  })

  it('derives required methods only from enabled capabilities', () => {
    const required = requiredApiKeys(MOBILE_CAPABILITIES)
    expect(required).toContain('openExternal')
    expect(required).toContain('shareFile')
    expect(required).not.toContain('exportDiagnostics')
  })

  it('reports missing shape and runtime assertion', () => {
    const result = validateApiSource(
      `const api = { platform: 'test', safeMode: false, capabilities: {} }`,
      MOBILE_CAPABILITIES,
      'mobile',
      'mobile.js'
    )
    expect(result.errors.some((error) => error.includes('"openFiles" がありません'))).toBe(true)
    expect(result.errors.some((error) => error.includes('runtime assertion'))).toBe(true)
  })
})
