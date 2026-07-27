// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { applyUserCss } from '../src/renderer/src/customThemes.js'

beforeEach(() => {
  applyUserCss([])
})

describe('applyUserCss', () => {
  it('combines enabled snippets in their stored order', () => {
    applyUserCss([
      { id: 'a', enabled: true, css: '.a { color: red; }' },
      { id: 'b', enabled: false, css: '.b { color: blue; }' },
      { id: 'c', enabled: true, css: '.c { color: green; }' }
    ])
    expect(document.querySelector('#hm-user-css')?.textContent)
      .toBe('.a { color: red; }\n\n.c { color: green; }')
  })
})
