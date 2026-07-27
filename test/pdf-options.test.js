import { describe, expect, it } from 'vitest'
import {
  createPdfOptions,
  normalizePageRanges,
  normalizePdfOptions
} from '../src/shared/pdf-options.js'

describe('PDF options', () => {
  it('creates a stable A4 default without sharing nested margin state', () => {
    const first = createPdfOptions('Guide', 'Contents')
    const second = createPdfOptions()
    expect(first).toMatchObject({
      pageSize: 'A4',
      orientation: 'portrait',
      documentTitle: 'Guide',
      tocTitle: 'Contents',
      footerEnabled: true,
      includePageNumbers: true
    })
    first.margins.top = 99
    expect(second.margins.top).toBe(20)
  })

  it('normalizes valid ranges and rejects invalid or reversed ranges', () => {
    expect(normalizePageRanges(' 1 - 3, 6, 8-10 ')).toBe('1-3, 6, 8-10')
    expect(normalizePageRanges('')).toBe('')
    expect(() => normalizePageRanges('3-1')).toThrow('invalid-page-range')
    expect(() => normalizePageRanges('1, all')).toThrow('invalid-page-range')
  })

  it('clamps custom dimensions, margins and scale', () => {
    expect(normalizePdfOptions({
      pageSize: 'Custom',
      marginPreset: 'custom',
      margins: { top: -1, right: 120, bottom: 'nope', left: 12 },
      customWidth: 20,
      customHeight: 1400,
      scale: 240,
      tocDepth: 9
    })).toMatchObject({
      customWidth: 50,
      customHeight: 1000,
      scale: 200,
      tocDepth: 6,
      margins: { top: 0, right: 100, bottom: 20, left: 12 }
    })
  })
})
