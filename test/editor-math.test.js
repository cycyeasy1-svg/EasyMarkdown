// Display-math normalization fed to the rich editor: single-line `$$x^2$$`
// expands to the three-line block form Milkdown's LaTeX feature recognizes,
// while fenced code blocks and YAML front matter are left untouched.
import { describe, it, expect } from 'vitest'
import { normalizeDisplayMath } from '../src/renderer/src/components/editor-math.js'

describe('normalizeDisplayMath', () => {
  it('expands a single-line display formula to block form', () => {
    expect(normalizeDisplayMath('$$x^2$$')).toBe('$$\nx^2\n$$')
    expect(normalizeDisplayMath('before\n$$E = mc^2$$\nafter')).toBe(
      'before\n$$\nE = mc^2\n$$\nafter'
    )
  })

  it('trims inner padding and keeps up to 3 spaces of indentation', () => {
    expect(normalizeDisplayMath('$$ x + y $$')).toBe('$$\nx + y\n$$')
    expect(normalizeDisplayMath('  $$a$$')).toBe('  $$\n  a\n  $$')
  })

  it('leaves already-fenced block math untouched', () => {
    const md = '$$\nx^2\n$$'
    expect(normalizeDisplayMath(md)).toBe(md)
  })

  it('allows single $ inside the formula', () => {
    expect(normalizeDisplayMath('$$a $ b$$')).toBe('$$\na $ b\n$$')
  })

  it('ignores lines that are not exactly one formula', () => {
    for (const md of [
      '$$x$$ trailing text',
      '$$a$$ and $$b$$', // ambiguous — two formulas on one line
      '$$$$', // empty content
      '$$   $$', // whitespace-only content
      'text $$x$$', // leading text
      '    $$x$$' // 4-space indent = indented code block
    ]) {
      expect(normalizeDisplayMath(md)).toBe(md)
    }
  })

  it('does not touch $$ inside fenced code blocks', () => {
    const md = '```\n$$x^2$$\n```'
    expect(normalizeDisplayMath(md)).toBe(md)
    const tilde = '~~~tex\n$$x^2$$\n~~~'
    expect(normalizeDisplayMath(tilde)).toBe(tilde)
  })

  it('resumes normalizing after a code block closes', () => {
    expect(normalizeDisplayMath('```\n$$a$$\n```\n$$b$$')).toBe('```\n$$a$$\n```\n$$\nb\n$$')
  })

  it('does not close a ``` fence with a shorter marker', () => {
    const md = '````\n```\n$$x$$\n````\n'
    expect(normalizeDisplayMath(md)).toBe(md)
  })

  it('skips YAML front matter at the top', () => {
    const md = '---\ntitle: $$x$$\n---\n$$y$$'
    expect(normalizeDisplayMath(md)).toBe('---\ntitle: $$x$$\n---\n$$\ny\n$$')
  })

  it('returns the input unchanged (same reference) when nothing matches', () => {
    const md = 'plain text\nno math here'
    expect(normalizeDisplayMath(md)).toBe(md)
    expect(normalizeDisplayMath('')).toBe('')
    expect(normalizeDisplayMath(null)).toBe(null)
  })
})
