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
      spellcheck: true,
      autosave: true,
      defaultEditorMode: 'rich',
      blankLineSpacing: true,
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
      spellcheck: false,
      autosave: false,
      defaultEditorMode: 'keep',
      blankLineSpacing: false,
      localHistory: false,
      showHiddenFiles: false
    })
  })
  it('coerces the boolean flags strictly', () => {
    saveSettings({ spellcheck: 'yes', autosave: 1, blankLineSpacing: 'on', localHistory: 1 })
    expect(loadSettings().spellcheck).toBe(false)
    expect(loadSettings().autosave).toBe(false)
    expect(loadSettings().blankLineSpacing).toBe(false)
    expect(loadSettings().localHistory).toBe(false)
    saveSettings({ spellcheck: true, autosave: true, blankLineSpacing: true, localHistory: true })
    expect(loadSettings().spellcheck).toBe(true)
    expect(loadSettings().autosave).toBe(true)
    expect(loadSettings().blankLineSpacing).toBe(true)
    expect(loadSettings().localHistory).toBe(true)
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
