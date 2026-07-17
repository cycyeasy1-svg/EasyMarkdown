import { describe, expect, it } from 'vitest'

import { internalLinkTarget, parseInternalDocLink } from '../src/renderer/src/link-navigation.js'

describe('internal link navigation', () => {
  it('parses relative document links and decoded anchors', () => {
    expect(parseInternalDocLink('../guide.md#Quick%20Start')).toEqual({
      path: '../guide.md',
      anchor: 'Quick Start'
    })
  })

  it('uses the current document name for pure anchors', () => {
    expect(internalLinkTarget('#details', 'C:\\notes\\README.md')).toMatchObject({
      path: '',
      anchor: 'details',
      fileName: 'README.md',
      label: 'README.md › #details'
    })
  })

  it('rejects external and executable schemes', () => {
    expect(parseInternalDocLink('https://example.com/a.md')).toBeNull()
    expect(parseInternalDocLink('javascript:alert(1)')).toBeNull()
  })
})
