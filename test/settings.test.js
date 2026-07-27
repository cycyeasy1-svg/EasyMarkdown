// @vitest-environment happy-dom
// Settings normalization + localStorage persistence. happy-dom gives us a real
// `localStorage`/`document`. normalizeWidth/normalizeFontSize are module-private,
// so they're characterized through loadSettings (which clamps the raw values).
import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeZoom,
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  ZOOM_MIN,
  ZOOM_MAX
} from '../src/renderer/src/settings.js'

beforeEach(() => localStorage.clear())

describe('normalizeZoom', () => {
  it('snaps to a 0.05 grid', () => {
    expect(normalizeZoom(0.77)).toBeCloseTo(0.75, 5)
    expect(normalizeZoom(1.23)).toBeCloseTo(1.25, 5)
  })
  it('clamps to [ZOOM_MIN, ZOOM_MAX]', () => {
    expect(normalizeZoom(9)).toBe(ZOOM_MAX)
    expect(normalizeZoom(0.1)).toBe(ZOOM_MIN)
  })
  it('falls back to the default for non-numbers', () => {
    expect(normalizeZoom('nope')).toBe(DEFAULT_SETTINGS.zoom)
  })
})

describe('loadSettings / saveSettings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
  it('round-trips saved values', () => {
    const saved = {
      pageWidth: 900,
      fontSize: 18,
      zoom: 1.25,
      lineHeight: 2.0,
      paragraphSpacing: 1.2,
      fontWriteEn: 'Inter',
      fontWriteZh: 'Noto Sans SC',
      fontWriteJa: 'Noto Sans JP',
      fontMono: 'Fira Code',
      sourceFontOffset: 2,
      userCssSnippets: [
        { id: 'notes', name: 'Notes', enabled: true, css: '.km-doc { color: red; }' }
      ],
      spellcheck: true,
      autosave: true,
      defaultEditorMode: 'rich',
      blankLineSpacing: true,
      tableAutoWrap: true,
      selectionToolbar: false,
      inlineMathDeleteMode: 'fast',
      mobileReadOnly: true,
      localHistory: true,
      showHiddenFiles: true
    }
    saveSettings(saved)
    expect(loadSettings()).toEqual(saved)
  })
  it('fills line-height / paragraph-spacing defaults when absent', () => {
    saveSettings({ pageWidth: 900, fontSize: 18, zoom: 1.25 })
    const s = loadSettings()
    expect(s.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight)
    expect(s.paragraphSpacing).toBe(DEFAULT_SETTINGS.paragraphSpacing)
  })
  it('migrates the former single document font into all three language slots', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontWrite: 'Noto Sans CJK' }))
    expect(loadSettings()).toMatchObject({
      fontWriteEn: 'Noto Sans CJK',
      fontWriteZh: 'Noto Sans CJK',
      fontWriteJa: 'Noto Sans CJK'
    })
  })
  it('clamps out-of-range stored values on load', () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ pageWidth: 5000, fontSize: 99, zoom: 9, lineHeight: 9, paragraphSpacing: 9 })
    )
    expect(loadSettings()).toEqual({
      pageWidth: 1400,
      fontSize: 24,
      zoom: 2,
      lineHeight: 2.4,
      paragraphSpacing: 2,
      fontWriteEn: '',
      fontWriteZh: '',
      fontWriteJa: '',
      fontMono: '',
      sourceFontOffset: 0,
      userCssSnippets: [{ id: 'default', name: '', enabled: true, css: '' }],
      spellcheck: false,
      autosave: false,
      defaultEditorMode: 'keep',
      blankLineSpacing: false,
      tableAutoWrap: false,
      selectionToolbar: true,
      inlineMathDeleteMode: 'protect',
      mobileReadOnly: false,
      localHistory: false,
      showHiddenFiles: false
    })
  })
  it('coerces the boolean flags strictly', () => {
    saveSettings({
      spellcheck: 'yes',
      autosave: 1,
      blankLineSpacing: 'on',
      tableAutoWrap: 'on',
      selectionToolbar: 0,
      inlineMathDeleteMode: 'other',
      localHistory: 1
    })
    expect(loadSettings().spellcheck).toBe(false)
    expect(loadSettings().autosave).toBe(false)
    expect(loadSettings().blankLineSpacing).toBe(false)
    expect(loadSettings().tableAutoWrap).toBe(false)
    expect(loadSettings().selectionToolbar).toBe(true)
    expect(loadSettings().inlineMathDeleteMode).toBe('protect')
    expect(loadSettings().localHistory).toBe(false)
    saveSettings({
      spellcheck: true,
      autosave: true,
      blankLineSpacing: true,
      tableAutoWrap: true,
      selectionToolbar: false,
      inlineMathDeleteMode: 'fast',
      localHistory: true
    })
    expect(loadSettings().spellcheck).toBe(true)
    expect(loadSettings().autosave).toBe(true)
    expect(loadSettings().blankLineSpacing).toBe(true)
    expect(loadSettings().tableAutoWrap).toBe(true)
    expect(loadSettings().selectionToolbar).toBe(false)
    expect(loadSettings().inlineMathDeleteMode).toBe('fast')
    expect(loadSettings().localHistory).toBe(true)
  })
  it('clamps source font offset and migrates legacy custom CSS', () => {
    saveSettings({ sourceFontOffset: 99, userCss: '.km-doc { color: red; }' })
    expect(loadSettings()).toMatchObject({
      sourceFontOffset: 8,
      userCssSnippets: [
        { id: 'legacy', name: '', enabled: true, css: '.km-doc { color: red; }' }
      ]
    })
  })
  it('normalizes duplicate CSS snippet ids and enable flags', () => {
    saveSettings({
      userCssSnippets: [
        { id: 'same', name: 'A', css: 'a{}' },
        { id: 'same', name: 'B', enabled: false, css: 'b{}' }
      ]
    })
    const snippets = loadSettings().userCssSnippets
    expect(snippets).toHaveLength(2)
    expect(new Set(snippets.map((item) => item.id)).size).toBe(2)
    expect(snippets[0].enabled).toBe(true)
    expect(snippets[1].enabled).toBe(false)
  })
  it('normalizes defaultEditorMode to keep|rich', () => {
    saveSettings({ defaultEditorMode: 'weird' })
    expect(loadSettings().defaultEditorMode).toBe('keep')
    saveSettings({ defaultEditorMode: 'rich' })
    expect(loadSettings().defaultEditorMode).toBe('rich')
  })
  it('keeps the "full" page-width preset as-is', () => {
    saveSettings({ pageWidth: 'full', fontSize: 16, zoom: 1 })
    expect(loadSettings().pageWidth).toBe('full')
  })
  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(SETTINGS_KEY, '{not json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})
