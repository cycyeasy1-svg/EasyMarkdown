import { normalizeFontName } from '../../../src/shared/fonts.js'
import {
  DEFAULT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  HEADING_SPACING_MAX,
  HEADING_SPACING_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  PAGE_WIDTH_MAX,
  PAGE_WIDTH_MIN,
  PARA_SPACING_MAX,
  PARA_SPACING_MIN,
  applyEditorFonts,
  applyFontSize,
  applyHeadingSpacing,
  applyLineHeight,
  applyPageWidth,
  applyParagraphSpacing,
  applyZoom,
  normalizeZoom
} from '../../../src/renderer/src/settings.js'

export const LITE_TYPOGRAPHY_KEY = 'easymarkdown.web-lite.typography.v1'

export const DEFAULT_LITE_TYPOGRAPHY = Object.freeze({
  pageWidth: DEFAULT_SETTINGS.pageWidth,
  fontSize: DEFAULT_SETTINGS.fontSize,
  zoom: DEFAULT_SETTINGS.zoom,
  lineHeight: DEFAULT_SETTINGS.lineHeight,
  paragraphSpacing: DEFAULT_SETTINGS.paragraphSpacing,
  headingSpacing: DEFAULT_SETTINGS.headingSpacing,
  fontWriteEn: '',
  fontWriteZh: '',
  fontWriteJa: '',
  fontMono: ''
})

const round1 = (value) => Math.round(value * 10) / 10

function numberInRange(value, min, max, fallback, round = round1) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, round(numeric)))
}

export function normalizeLiteTypography(value = {}) {
  const pageWidth =
    value.pageWidth === 'full'
      ? 'full'
      : numberInRange(
          value.pageWidth,
          PAGE_WIDTH_MIN,
          PAGE_WIDTH_MAX,
          DEFAULT_LITE_TYPOGRAPHY.pageWidth,
          Math.round
        )
  return {
    pageWidth,
    fontSize: numberInRange(
      value.fontSize,
      FONT_SIZE_MIN,
      FONT_SIZE_MAX,
      DEFAULT_LITE_TYPOGRAPHY.fontSize,
      Math.round
    ),
    zoom: normalizeZoom(value.zoom),
    lineHeight: numberInRange(
      value.lineHeight,
      LINE_HEIGHT_MIN,
      LINE_HEIGHT_MAX,
      DEFAULT_LITE_TYPOGRAPHY.lineHeight
    ),
    paragraphSpacing: numberInRange(
      value.paragraphSpacing,
      PARA_SPACING_MIN,
      PARA_SPACING_MAX,
      DEFAULT_LITE_TYPOGRAPHY.paragraphSpacing
    ),
    headingSpacing: numberInRange(
      value.headingSpacing,
      HEADING_SPACING_MIN,
      HEADING_SPACING_MAX,
      DEFAULT_LITE_TYPOGRAPHY.headingSpacing
    ),
    fontWriteEn: normalizeFontName(value.fontWriteEn),
    fontWriteZh: normalizeFontName(value.fontWriteZh),
    fontWriteJa: normalizeFontName(value.fontWriteJa),
    fontMono: normalizeFontName(value.fontMono)
  }
}

export function loadLiteTypography() {
  try {
    return normalizeLiteTypography(JSON.parse(localStorage.getItem(LITE_TYPOGRAPHY_KEY) || '{}'))
  } catch {
    return { ...DEFAULT_LITE_TYPOGRAPHY }
  }
}

export function saveLiteTypography(value) {
  const normalized = normalizeLiteTypography(value)
  try {
    localStorage.setItem(LITE_TYPOGRAPHY_KEY, JSON.stringify(normalized))
  } catch {
    // A storage quota or blocked localStorage must not stop the editor.
  }
  return normalized
}

export function applyLiteTypography(value) {
  const normalized = normalizeLiteTypography(value)
  applyPageWidth(normalized.pageWidth)
  applyFontSize(normalized.fontSize)
  applyZoom(normalized.zoom)
  applyLineHeight(normalized.lineHeight)
  applyParagraphSpacing(normalized.paragraphSpacing)
  applyHeadingSpacing(normalized.headingSpacing)
  applyEditorFonts(
    normalized.fontWriteEn,
    normalized.fontWriteZh,
    normalized.fontWriteJa,
    normalized.fontMono
  )
  return normalized
}
