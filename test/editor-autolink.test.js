import { describe, expect, it } from 'vitest'
import { repairNonAsciiAutolinks } from '../src/renderer/src/components/editor-autolink.js'

const text = (value) => ({ type: 'text', value })
const link = (url, value = url) => ({ type: 'link', url, children: [text(value)] })

describe('repairNonAsciiAutolinks', () => {
  it('keeps the ASCII domain clickable and restores trailing CJK prose to text', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [link('www.caixuetang.cn，查看课程1')]
        }
      ]
    }

    repairNonAsciiAutolinks(tree)

    expect(tree.children[0].children).toEqual([
      link('www.caixuetang.cn'),
      text('，查看课程1')
    ])
  })

  it('leaves valid ASCII autolinks unchanged', () => {
    const good = link('https://example.com/docs?q=1')
    const tree = { type: 'root', children: [{ type: 'paragraph', children: [good] }] }
    repairNonAsciiAutolinks(tree)
    expect(tree.children[0].children).toEqual([good])
  })

  it('unwraps a non-ASCII domain instead of manufacturing a broken URL', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'paragraph', children: [link('http://例え.jp', 'http://例え.jp')] }]
    }
    repairNonAsciiAutolinks(tree)
    expect(tree.children[0].children).toEqual([text('http://例え.jp')])
  })

  it('unwraps complex link children without losing their formatting nodes', () => {
    const emphasis = { type: 'emphasis', children: [text('说明')] }
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'link', url: 'https://example.com/说明', children: [emphasis] }]
        }
      ]
    }
    repairNonAsciiAutolinks(tree)
    expect(tree.children[0].children).toEqual([emphasis])
  })
})
