import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_POSITIONS_KEY,
  documentContentFingerprint,
  parseDocumentPositionStore,
  readDocumentPosition,
  writeDocumentPosition
} from '../src/renderer/src/document-positions.js'

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    value: (key) => values.get(key)
  }
}

describe('document position store', () => {
  it('round-trips caret and viewport only for matching content', () => {
    const storage = memoryStorage()
    expect(
      writeDocumentPosition(storage, {
        path: 'C:\\Docs\\Note.md',
        content: '# Note\nbody',
        caret: 8,
        viewport: 2,
        updatedAt: 20
      })
    ).toBe(true)
    expect(readDocumentPosition(storage, 'c:/docs/note.md', '# Note\nbody')).toEqual({
      caret: 8,
      viewport: 2,
      updatedAt: 20
    })
    expect(readDocumentPosition(storage, 'c:/docs/note.md', '# Changed')).toBeNull()
  })

  it('rejects corrupt stores and invalid entries without throwing', () => {
    expect(parseDocumentPositionStore('{bad json')).toEqual([])
    expect(parseDocumentPositionStore({ version: 9, entries: [] })).toEqual([])
    expect(
      parseDocumentPositionStore({
        version: 1,
        entries: [{ path: '', fingerprint: 'x', caret: -1, viewport: null }]
      })
    ).toEqual([])
    expect(documentContentFingerprint('abc')).not.toBe(documentContentFingerprint('abd'))
  })

  it('keeps a bounded most-recent-first LRU', () => {
    const storage = memoryStorage()
    for (let index = 0; index < 4; index += 1) {
      writeDocumentPosition(
        storage,
        {
          path: `/tmp/${index}.md`,
          content: String(index),
          viewport: index,
          updatedAt: index + 1
        },
        3
      )
    }
    const stored = JSON.parse(storage.value(DOCUMENT_POSITIONS_KEY))
    expect(stored.entries.map((entry) => entry.path)).toEqual([
      '/tmp/3.md',
      '/tmp/2.md',
      '/tmp/1.md'
    ])
  })
})
