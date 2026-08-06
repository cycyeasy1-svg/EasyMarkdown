// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import {
  mergeInlineHtmlRemarkPlugin,
  renderHtmlNodeView
} from '../src/renderer/src/components/editor-html.js'

const point = (offset) => ({ line: 1, column: offset + 1, offset })
const position = (start, end) => ({ start: point(start), end: point(end) })

describe('rich-editor raw HTML rendering', () => {
  it('merges a complex inline wrapper from the exact source and renders its Markdown body', () => {
    const source = '<font color="red">~~gone~~</font>'
    const openEnd = source.indexOf('>') + 1
    const closeStart = source.indexOf('</font>')
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'html', value: source.slice(0, openEnd), position: position(0, openEnd) },
            {
              type: 'delete',
              children: [{ type: 'text', value: 'gone' }],
              position: position(openEnd, closeStart)
            },
            {
              type: 'html',
              value: source.slice(closeStart),
              position: position(closeStart, source.length)
            }
          ]
        }
      ]
    }

    mergeInlineHtmlRemarkPlugin()(tree, { value: source })
    expect(tree.children[0].children).toEqual([
      expect.objectContaining({ type: 'html', value: source })
    ])

    const view = renderHtmlNodeView({ attrs: { value: source } })
    expect(view.dom.querySelector('font')?.getAttribute('color')).toBe('red')
    expect(view.dom.querySelector('s')?.textContent).toBe('gone')
  })

  it('renders a Markdown table nested in a sanitized div block', () => {
    const source = [
      '<div class="report" onclick="alert(1)">',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | **two** |',
      '',
      '</div>'
    ].join('\n')

    const openEnd = source.indexOf('>') + 1
    const closeStart = source.lastIndexOf('</div>')
    const tree = {
      type: 'root',
      children: [
        { type: 'html', value: source.slice(0, openEnd), position: position(0, openEnd) },
        { type: 'table', children: [], position: position(openEnd, closeStart) },
        {
          type: 'html',
          value: source.slice(closeStart),
          position: position(closeStart, source.length)
        }
      ]
    }

    mergeInlineHtmlRemarkPlugin()(tree, { value: source })
    expect(tree.children).toEqual([expect.objectContaining({ type: 'html', value: source })])

    const view = renderHtmlNodeView({ attrs: { value: tree.children[0].value } })
    const wrapper = view.dom.querySelector('div.report')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.hasAttribute('onclick')).toBe(false)
    expect(wrapper?.querySelector('.km-table')).not.toBeNull()
    expect(wrapper?.querySelector('strong')?.textContent).toBe('two')
    expect(wrapper?.textContent).not.toContain('|---|---|')
  })
})
