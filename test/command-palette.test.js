import { describe, expect, it } from 'vitest'
import { paletteQueryMode } from '../src/renderer/src/components/CommandPalette.jsx'

describe('paletteQueryMode', () => {
  it('uses file mode without a prefix and trims the search term', () => {
    expect(paletteQueryMode('  guide  ')).toEqual({
      prefix: '',
      mode: 'files',
      term: 'guide'
    })
  })

  it.each([
    ['> save', '>', 'commands', 'save'],
    ['@ Heading', '@', 'headings', 'Heading'],
    ['# API', '#', 'workspaceHeadings', 'API'],
    [': 42', ':', 'line', '42'],
    ['?', '?', 'help', '']
  ])('routes %s to its dedicated mode', (query, prefix, mode, term) => {
    expect(paletteQueryMode(query)).toEqual({ prefix, mode, term })
  })
})
