import { describe, expect, it } from 'vitest'
import {
  imageBlockAttrsFromMarkdown,
  imageBlockAttrsToMarkdown,
  parseLegacyImageRatio
} from '../src/renderer/src/components/editor-image-markdown.js'

describe('image block Markdown metadata', () => {
  it('keeps standard Markdown alt text at the default size', () => {
    const attrs = imageBlockAttrsFromMarkdown({
      url: 'assets/test.png',
      alt: 'architecture diagram'
    })
    expect(attrs).toEqual({
      src: 'assets/test.png',
      alt: 'architecture diagram',
      caption: 'architecture diagram',
      ratio: 1
    })
    expect(imageBlockAttrsToMarkdown(attrs)).toEqual({
      url: 'assets/test.png',
      alt: 'architecture diagram',
      title: undefined
    })
  })

  it('keeps distinct alt and title values', () => {
    const attrs = imageBlockAttrsFromMarkdown({
      url: 'image.png',
      alt: 'alternative text',
      title: 'visible caption'
    })
    expect(attrs.alt).toBe('alternative text')
    expect(attrs.caption).toBe('visible caption')
    expect(imageBlockAttrsToMarkdown(attrs)).toEqual({
      url: 'image.png',
      alt: 'alternative text',
      title: 'visible caption'
    })
  })

  it('reads and writes the legacy resized-image syntax', () => {
    expect(parseLegacyImageRatio('0.50')).toBe(0.5)
    const attrs = imageBlockAttrsFromMarkdown({
      url: 'image.png',
      alt: '0.50',
      title: 'caption'
    })
    expect(attrs).toEqual({ src: 'image.png', alt: '', caption: 'caption', ratio: 0.5 })
    expect(imageBlockAttrsToMarkdown(attrs)).toEqual({
      url: 'image.png',
      alt: '0.50',
      title: 'caption'
    })
  })
})
