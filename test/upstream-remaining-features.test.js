import { describe, expect, it } from 'vitest'
import { canGrantLocalFonts, createLocalFontGrant, LOCAL_FONT_GRANT_TTL_MS } from '../src/main/security.js'
import {
  exportTypographyCss,
  fontStack,
  normalizeFontName,
  resolveDefaultFontName,
  writingFontStacks,
  DEFAULT_FONT_MONO
} from '../src/shared/fonts.js'
import { unclosedMathContent } from '../src/renderer/src/components/editor-math-preview.js'

describe('scoped local-font permission', () => {
  const base = {
    permission: 'local-fonts',
    webContentsId: 7,
    trustedWebContentsId: 7,
    requestingUrl: 'file:///app/index.html',
    currentUrl: 'file:///app/index.html',
    devRendererUrl: '',
    isMainFrame: true,
    grant: createLocalFontGrant(7, 100),
    now: 100
  }

  it('allows only the trusted main frame during the short grant', () => {
    expect(canGrantLocalFonts(base)).toBe(true)
    expect(canGrantLocalFonts({ ...base, permission: 'camera' })).toBe(false)
    expect(canGrantLocalFonts({ ...base, webContentsId: 8 })).toBe(false)
    expect(canGrantLocalFonts({ ...base, isMainFrame: false })).toBe(false)
    expect(canGrantLocalFonts({ ...base, now: 100 + LOCAL_FONT_GRANT_TTL_MS + 1 })).toBe(false)
  })
})

describe('font overrides', () => {
  it('sanitizes CSS-breaking input and prepends a valid family', () => {
    expect(normalizeFontName("Fira';} body{color:red")).toBe('Fira bodycolor:red')
    expect(fontStack('Fira Code', DEFAULT_FONT_MONO)).toContain("'Fira Code',")
  })
  it('scopes document and code fonts into exported output', () => {
    const css = exportTypographyCss({
      fontWriteEn: 'Inter',
      fontWriteZh: 'Noto Sans SC',
      fontWriteJa: 'Noto Sans JP',
      fontMono: 'JetBrains Mono'
    })
    expect(css).toContain('.doc{font-family:')
    expect(css).toContain('.doc:lang(zh){font-family:')
    expect(css).toContain('.doc:lang(ja){font-family:')
    expect(css).toContain("'Inter'")
    expect(css).toContain("'Noto Sans SC'")
    expect(css).toContain("'Noto Sans JP'")
    expect(css).toContain('.doc code,.doc pre,.doc pre code')
    expect(css).toContain("'JetBrains Mono'")
  })
  it('keeps the English face first while routing CJK fallbacks by document language', () => {
    const stacks = writingFontStacks({
      fontWriteEn: 'English Custom',
      fontWriteZh: 'Chinese Custom',
      fontWriteJa: 'Japanese Custom'
    })
    expect(stacks.en).toContain("'English Custom'")
    expect(stacks.en).not.toContain("'Chinese Custom'")
    expect(stacks.zh.indexOf("'English Custom'")).toBeLessThan(stacks.zh.indexOf("'Chinese Custom'"))
    expect(stacks.ja.indexOf("'English Custom'")).toBeLessThan(stacks.ja.indexOf("'Japanese Custom'"))
    expect(stacks.ja.indexOf("'Japanese Custom'")).toBeLessThan(stacks.ja.indexOf("'Chinese Custom'"))
  })
  it('shows the installed family that actually leads each platform default stack', () => {
    const installed = ['Arial', 'Microsoft YaHei', 'BIZ UDPGothic', 'JetBrains Mono', 'Consolas']
    expect(resolveDefaultFontName('en', 'win32', installed)).toBe('Arial')
    expect(resolveDefaultFontName('zh', 'win32', installed)).toBe('Microsoft YaHei')
    expect(resolveDefaultFontName('ja', 'win32', installed)).toBe('BIZ UDPGothic')
    expect(resolveDefaultFontName('mono', 'win32', installed)).toBe('JetBrains Mono')
    expect(resolveDefaultFontName('mono', 'win32', ['Consolas'])).toBe('Consolas')
    expect(resolveDefaultFontName('en', 'darwin', [])).toBe('Helvetica Neue')
    expect(resolveDefaultFontName('zh', 'darwin', [])).toBe('PingFang SC')
    expect(resolveDefaultFontName('ja', 'darwin', [])).toBe('Hiragino Sans')
  })
})

describe('unclosed inline-math preview detection', () => {
  it('detects mathy unfinished spans without treating currency or shell variables as math', () => {
    expect(unclosedMathContent('value $x^2')).toBe('x^2')
    expect(unclosedMathContent('value $\\frac{a}{b}')).toBe('\\frac{a}{b}')
    expect(unclosedMathContent('cost $5')).toBe(null)
    expect(unclosedMathContent('use $HOME')).toBe(null)
  })
  it('ignores closed, escaped, display, and multiline delimiters', () => {
    expect(unclosedMathContent('$x^2$')).toBe(null)
    expect(unclosedMathContent('\\$x^2')).toBe(null)
    expect(unclosedMathContent('$$x^2')).toBe(null)
    expect(unclosedMathContent('$x^2\nnext')).toBe(null)
  })
})
