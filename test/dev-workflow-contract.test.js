import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8')

describe('contributor workflow contract', () => {
  it('pins formatter and cross-platform editor/EOL policy', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.devDependencies.prettier).toMatch(/^\d+\.\d+\.\d+$/)
    expect(pkg.devDependencies['eslint-config-prettier']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(read('.editorconfig')).toContain('end_of_line = lf')
    expect(read('.gitattributes')).toContain('*.js text eol=lf')
    expect(read('.prettierignore')).toContain('test/e2e/fixtures/**')
    expect(read('.prettierignore')).toContain('**/package-lock.json')
  })

  it('keeps format check in the shared fast gate', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.format).toContain('format-changed.mjs --write')
    expect(pkg.scripts['format:check']).toContain('format-changed.mjs --check')
    expect(pkg.scripts['quality:fast']).toContain('npm run format:check')
    expect(read('.github/workflows/ci.yml')).toContain('FORMAT_BASE_SHA')
    expect(read('.github/workflows/ci.yml')).toContain('fetch-depth: 0')
  })

  it('requires review inputs in the pull request template', () => {
    const template = read('.github/pull_request_template.md')
    for (const expected of [
      'Risk と設計資料',
      '対象 product／platform',
      '検証 evidence',
      '影響確認',
      'Rollback と残存 risk',
      'Definition of Done'
    ]) {
      expect(template).toContain(expected)
    }
  })

  it('links contributors and agents to the risk-based DoD', () => {
    const dod = read('docs/definition-of-done.md')
    expect(dod).toContain('Risk 別追加条件')
    expect(dod).toContain('Ready for review と Merge')
    expect(read('CONTRIBUTING.md')).toContain('docs/definition-of-done.md')
    expect(read('AGENTS.md')).toContain('docs/definition-of-done.md')
  })
})
