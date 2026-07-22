// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { findRangesInEl } from '../src/renderer/src/find.js'

describe('findRangesInEl', () => {
  it('excludes rows hidden by a keep-mode table filter', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <p>target outside</p>
      <table class="km-table">
        <tbody>
          <tr><td>target visible</td></tr>
          <tr class="km-filtered"><td><span>target filtered</span></td></tr>
        </tbody>
      </table>
    `

    const { ranges, error } = findRangesInEl(root, 'target')

    expect(error).toBe('')
    expect(ranges).toHaveLength(2)
    expect(ranges.map((range) => range.toString())).toEqual(['target', 'target'])
    expect(ranges.every((range) => !range.startContainer.parentElement.closest('.km-filtered'))).toBe(true)
  })
})
