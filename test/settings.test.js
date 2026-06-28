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
    saveSettings({ pageWidth: 900, fontSize: 18, zoom: 1.25 })
    expect(loadSettings()).toEqual({ pageWidth: 900, fontSize: 18, zoom: 1.25 })
  })
  it('clamps out-of-range stored values on load', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ pageWidth: 5000, fontSize: 99, zoom: 9 }))
    expect(loadSettings()).toEqual({ pageWidth: 1400, fontSize: 24, zoom: 2 })
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
