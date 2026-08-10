import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkArchitectureRepository,
  classifyArchitecturePath,
  extractImportSpecifiers,
  validateArchitectureImport
} from '../scripts/check-architecture-boundaries.mjs'

const errorsFor = (importerPath, specifier) =>
  validateArchitectureImport({ importerPath, specifier })

describe('architecture import boundaries', () => {
  it('classifies platform before its renderer parent layer', () => {
    expect(classifyArchitecturePath('src/main/index.js')).toBe('main')
    expect(classifyArchitecturePath('src/preload/index.js')).toBe('preload')
    expect(classifyArchitecturePath('src/renderer/src/App.jsx')).toBe('renderer')
    expect(classifyArchitecturePath('src/renderer/src/platform/index.js')).toBe('platform')
    expect(classifyArchitecturePath('src/shared/api-contract.js')).toBe('shared')
    expect(classifyArchitecturePath('scripts/check.mjs')).toBeNull()
  })

  it('extracts static, re-export, dynamic and CommonJS edges from JSX', () => {
    const result = extractImportSpecifiers(
      `
        import value from './value.js'
        export { shared } from '../../shared/value.js'
        const lazy = import('mermaid')
        const legacy = require('./legacy.cjs')
        export default <div>{value}</div>
      `,
      'example.jsx'
    )
    expect(result.errors).toEqual([])
    expect(result.imports.map(({ kind, specifier }) => [kind, specifier])).toEqual([
      ['import', './value.js'],
      ['export', '../../shared/value.js'],
      ['import()', 'mermaid'],
      ['require()', './legacy.cjs']
    ])
  })

  it('fails closed for non-literal dynamic dependency edges', () => {
    const result = extractImportSpecifiers(
      'const a = import(target); const b = require(moduleName)',
      'dynamic.js'
    )
    expect(result.errors).toHaveLength(2)
    expect(result.errors.every((error) => error.includes('string literal'))).toBe(true)
  })

  it('fails closed when an unparsed TypeScript source enters a managed layer', () => {
    const root = mkdtempSync(join(tmpdir(), 'easymarkdown-architecture-'))
    try {
      const shared = join(root, 'src', 'shared')
      mkdirSync(shared, { recursive: true })
      writeFileSync(join(shared, 'future.ts'), 'export const value: string = "future"\n', 'utf8')
      expect(checkArchitectureRepository(root).errors).toEqual([
        'src/shared/future.ts: TypeScript source parser の追加が必要です'
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('allows only the declared internal layer directions', () => {
    expect(errorsFor('src/main/service.js', '../shared/value.js')).toEqual([])
    expect(errorsFor('src/preload/index.js', '../shared/api-contract.js')).toEqual([])
    expect(errorsFor('src/renderer/src/App.jsx', '../../shared/value.js')).toEqual([])
    expect(errorsFor('src/shared/value.js', './other.js')).toEqual([])

    expect(errorsFor('src/renderer/src/App.jsx', '../../main/helpers.js')[0]).toContain(
      'renderer から main'
    )
    expect(errorsFor('src/preload/index.js', '../main/helpers.js')[0]).toContain(
      'preload から main'
    )
    expect(errorsFor('src/main/index.js', '../renderer/src/App.jsx')[0]).toContain(
      'main から renderer'
    )
  })

  it('keeps Electron, Node.js and Capacitor dependencies in their runtime owners', () => {
    expect(errorsFor('src/main/index.js', 'electron')).toEqual([])
    expect(errorsFor('src/main/index.js', 'node:fs')).toEqual([])
    expect(errorsFor('src/preload/index.js', 'electron')).toEqual([])
    expect(errorsFor('src/renderer/src/platform/capacitor-api.js', '@capacitor/core')).toEqual([])

    expect(errorsFor('src/renderer/src/App.jsx', 'electron')[0]).toContain('main／preload')
    expect(errorsFor('src/renderer/src/App.jsx', 'node:fs')[0]).toContain('main layer')
    expect(errorsFor('src/renderer/src/App.jsx', '@capacitor/core')[0]).toContain(
      'platform adapter'
    )
    expect(errorsFor('src/preload/index.js', 'react')[0]).toContain('electron だけ')
    expect(errorsFor('src/shared/value.js', 'react')[0]).toContain('外部 package')
    expect(errorsFor('src/renderer/src/platform/index.js', 'react')[0]).toContain(
      'Capacitor package だけ'
    )
  })

  it('exposes a single platform public entry to the renderer', () => {
    expect(errorsFor('src/renderer/src/main.jsx', './platform/index.js')).toEqual([])
    expect(errorsFor('src/renderer/src/main.jsx', './platform/capacitor-api.js')[0]).toContain(
      'platform public entry'
    )
    expect(errorsFor('src/renderer/src/platform/index.js', '../App.jsx')[0]).toContain(
      'platform から renderer'
    )
  })

  it('rejects local paths outside managed architecture roots', () => {
    expect(errorsFor('src/main/index.js', '../../scripts/tool.mjs')[0]).toContain(
      '管理対象 layer 外'
    )
  })

  it('keeps the current repository and fast gate compliant', () => {
    const result = checkArchitectureRepository()
    expect(result.errors).toEqual([])
    expect(result.fileCount).toBe(Object.values(result.layerCounts).reduce((a, b) => a + b, 0))
    expect(result.importCount).toBeGreaterThan(0)

    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.scripts['architecture:check']).toBe(
      'node scripts/check-architecture-boundaries.mjs'
    )
    expect(manifest.scripts['quality:fast']).toContain('npm run architecture:check')
  })
})
