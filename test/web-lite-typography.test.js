// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LITE_TYPOGRAPHY,
  LITE_TYPOGRAPHY_KEY,
  applyLiteTypography,
  loadLiteTypography,
  normalizeLiteTypography,
  saveLiteTypography
} from '../packages/web-lite/src/typography.js'

describe('web-lite typography preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.className = ''
    document.documentElement.removeAttribute('style')
  })

  it('normalizes persisted values into the shared typography bounds', () => {
    expect(
      normalizeLiteTypography({
        pageWidth: 9999,
        fontSize: 2,
        zoom: 1.23,
        lineHeight: 9,
        paragraphSpacing: -1,
        headingSpacing: 0,
        fontWriteZh: '"Bad";{} Microsoft YaHei'
      })
    ).toMatchObject({
      pageWidth: 1400,
      fontSize: 12,
      zoom: 1.25,
      lineHeight: 2.4,
      paragraphSpacing: 0,
      headingSpacing: 0.6,
      fontWriteZh: 'Bad Microsoft YaHei'
    })
  })

  it('saves and reloads an independent Web Lite preference record', () => {
    saveLiteTypography({ ...DEFAULT_LITE_TYPOGRAPHY, fontSize: 19, pageWidth: 920 })
    expect(JSON.parse(localStorage.getItem(LITE_TYPOGRAPHY_KEY))).toMatchObject({
      fontSize: 19,
      pageWidth: 920
    })
    expect(loadLiteTypography()).toMatchObject({ fontSize: 19, pageWidth: 920 })
  })

  it('falls back safely when stored JSON is invalid', () => {
    localStorage.setItem(LITE_TYPOGRAPHY_KEY, '{broken')
    expect(loadLiteTypography()).toEqual(DEFAULT_LITE_TYPOGRAPHY)
  })

  it('applies shared CSS variables without changing the application chrome', () => {
    applyLiteTypography({
      ...DEFAULT_LITE_TYPOGRAPHY,
      pageWidth: 900,
      fontSize: 18,
      zoom: 1.25,
      lineHeight: 2,
      paragraphSpacing: 1.2,
      headingSpacing: 2.2,
      fontWriteZh: 'Microsoft YaHei',
      fontMono: 'Consolas'
    })
    const root = document.documentElement.style
    expect(root.getPropertyValue('--editor-max-width')).toBe('900px')
    expect(root.getPropertyValue('--editor-font-size')).toBe('18px')
    expect(root.getPropertyValue('--editor-zoom')).toBe('1.25')
    expect(root.getPropertyValue('--editor-line-height')).toBe('2')
    expect(root.getPropertyValue('--editor-para-spacing')).toBe('1.2em')
    expect(root.getPropertyValue('--editor-heading-spacing')).toBe('2.2em')
    expect(root.getPropertyValue('--font-write-zh')).toContain("'Microsoft YaHei'")
    expect(root.getPropertyValue('--font-mono')).toContain("'Consolas'")
    expect(document.body.classList.contains('hm-user-write-font')).toBe(true)
  })

  it('uses the full-width class for the shared full preset', () => {
    applyLiteTypography({ ...DEFAULT_LITE_TYPOGRAPHY, pageWidth: 'full' })
    expect(document.body.classList.contains('hm-full-width')).toBe(true)
    applyLiteTypography({ ...DEFAULT_LITE_TYPOGRAPHY, pageWidth: 800 })
    expect(document.body.classList.contains('hm-full-width')).toBe(false)
  })
})
