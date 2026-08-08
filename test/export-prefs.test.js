import { describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { MAX_SAVE_DIR_ENTRIES, resolveSaveDir, withRecordedSaveDir } from '../src/main/export-prefs-logic.js'

describe('export save-directory preferences', () => {
  it('defaults saved documents to their own directory', () => {
    const sourcePath = join('workspace', 'docs', 'guide.md')
    expect(resolveSaveDir({ saveDirs: {}, lastSaveDir: join('global', 'exports') }, sourcePath))
      .toBe(dirname(sourcePath))
  })

  it('remembers directories independently per source document', () => {
    let state = { saveDirs: {}, lastSaveDir: '' }
    state = withRecordedSaveDir(state, join('workspace', 'a.md'), join('exports', 'a'))
    state = withRecordedSaveDir(state, join('workspace', 'b.md'), join('exports', 'b'))
    expect(resolveSaveDir(state, join('workspace', 'a.md'))).toBe(join('exports', 'a'))
    expect(resolveSaveDir(state, join('workspace', 'b.md'))).toBe(join('exports', 'b'))
    expect(resolveSaveDir(state, null)).toBe(join('exports', 'b'))
  })

  it('bounds the per-file map', () => {
    let state = { saveDirs: {}, lastSaveDir: '' }
    for (let index = 0; index <= MAX_SAVE_DIR_ENTRIES; index += 1) {
      state = withRecordedSaveDir(state, join('workspace', `${index}.md`), join('exports', 'all'))
    }
    expect(Object.keys(state.saveDirs)).toHaveLength(MAX_SAVE_DIR_ENTRIES)
    expect(state.saveDirs[join('workspace', '0.md')]).toBeUndefined()
  })
})
