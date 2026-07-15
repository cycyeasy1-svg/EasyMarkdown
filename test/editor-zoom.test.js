// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { ensureEmbedZoomButtons, zoomItemFromButton } from '../src/renderer/src/components/editor-zoom.js'

const t = (key) => key

describe('embed zoom affordances', () => {
  it('adds one zoom button to rendered Mermaid and KaTeX blocks', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="km-mermaid"><svg viewBox="0 0 10 10"></svg></div><div class="km-math"><span class="katex-display">x</span></div>'
    ensureEmbedZoomButtons(root, t)
    ensureEmbedZoomButtons(root, t)

    expect(root.querySelectorAll('.hm-embed-zoom')).toHaveLength(2)
    expect(root.querySelector('.km-mermaid .hm-embed-zoom').dataset.zoomKind).toBe('mermaid')
    expect(root.querySelector('.km-math .hm-embed-zoom').dataset.zoomKind).toBe('math')
  })

  it('clones only display content for the lightbox', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="km-mermaid"><svg width="320" height="200"><path d="M0 0"/></svg></div>'
    ensureEmbedZoomButtons(root, t)
    const item = zoomItemFromButton(root.querySelector('.hm-embed-zoom'))

    expect(item.kind).toBe('mermaid')
    expect(item.content.tagName).toBe('svg')
    expect(item.content.hasAttribute('width')).toBe(false)
    expect(item.content.querySelector('button')).toBeNull()
  })
})
