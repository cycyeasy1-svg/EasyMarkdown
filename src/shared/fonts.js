const DEFAULT_FONT_LATIN_FACES = "'Helvetica Neue', Helvetica, Arial"
const DEFAULT_FONT_ZH_FACES =
  "'PingFang SC', 'Hiragino Sans GB', 'Source Han Sans SC', 'Noto Sans SC', 'Microsoft YaHei'"
const DEFAULT_FONT_JA_FACES =
  "'Noto Sans JP', 'BIZ UDPGothic', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic Medium', 'Yu Gothic', Meiryo"

export const DEFAULT_FONT_WRITE_EN = `${DEFAULT_FONT_LATIN_FACES}, sans-serif`
export const DEFAULT_FONT_WRITE_ZH = `${DEFAULT_FONT_LATIN_FACES}, ${DEFAULT_FONT_ZH_FACES}, sans-serif`
export const DEFAULT_FONT_WRITE_JA =
  `${DEFAULT_FONT_LATIN_FACES}, ${DEFAULT_FONT_JA_FACES}, ${DEFAULT_FONT_ZH_FACES}, sans-serif`
// Compatibility alias for older callers and stored settings. New code should
// choose EN/ZH/JA explicitly.
export const DEFAULT_FONT_WRITE = DEFAULT_FONT_WRITE_ZH
export const DEFAULT_FONT_MONO =
  "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Consolas, 'Noto Sans Mono CJK JP', monospace"

const DEFAULT_EN_CANDIDATES = [
  'Helvetica Neue',
  'Helvetica',
  'Arial'
]

const DEFAULT_ZH_CANDIDATES = [
  'PingFang SC',
  'Hiragino Sans GB',
  'Source Han Sans SC',
  'Noto Sans SC',
  'Microsoft YaHei'
]

const DEFAULT_JA_CANDIDATES = [
  'Noto Sans JP',
  'BIZ UDPGothic',
  'Hiragino Kaku Gothic ProN',
  'Hiragino Sans',
  'Yu Gothic Medium',
  'Yu Gothic',
  'Meiryo'
]

const PLATFORM_MONO_CANDIDATES = {
  darwin: ['JetBrains Mono', 'SF Mono', 'SFMono-Regular', 'Menlo', 'Monaco'],
  win32: ['JetBrains Mono', 'Consolas', 'Cascadia Mono', 'Courier New'],
  linux: ['JetBrains Mono', 'Noto Sans Mono', 'DejaVu Sans Mono', 'Liberation Mono']
}

const PLATFORM_DEFAULT_NAMES = {
  darwin: { en: 'Helvetica Neue', zh: 'PingFang SC', ja: 'Hiragino Sans', mono: 'SF Mono' },
  win32: { en: 'Arial', zh: 'Microsoft YaHei', ja: 'BIZ UDPGothic', mono: 'Consolas' },
  linux: { en: 'Noto Sans', zh: 'Noto Sans SC', ja: 'Noto Sans JP', mono: 'Noto Sans Mono' }
}

export function resolveDefaultFontName(kind, platform, available = []) {
  const platformKey = platform === 'darwin' || platform === 'win32' ? platform : 'linux'
  const installed = new Map(
    available
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .map((name) => [name.toLocaleLowerCase(), name])
  )
  const languageKind = kind === 'zh' || kind === 'ja' || kind === 'mono' ? kind : 'en'
  const candidates = languageKind === 'mono'
    ? PLATFORM_MONO_CANDIDATES[platformKey]
    : languageKind === 'zh'
      ? DEFAULT_ZH_CANDIDATES
      : languageKind === 'ja'
        ? DEFAULT_JA_CANDIDATES
        : DEFAULT_EN_CANDIDATES
  for (const candidate of candidates) {
    const actual = installed.get(candidate.toLocaleLowerCase())
    if (actual) return actual
  }
  return PLATFORM_DEFAULT_NAMES[platformKey][languageKind]
}

export function normalizeFontName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f'"\\;{}<>]/g, '')
    .trim()
    .slice(0, 160)
}

export function fontStack(name, fallback) {
  const safe = normalizeFontName(name)
  return safe ? `'${safe}', ${fallback}` : fallback
}

const quotedFont = (name) => {
  const safe = normalizeFontName(name)
  return safe ? `'${safe}'` : ''
}

export function writingFontStacks(fonts = {}) {
  const legacy = normalizeFontName(fonts.fontWrite)
  const en = quotedFont(fonts.fontWriteEn || legacy)
  const zh = quotedFont(fonts.fontWriteZh || legacy)
  const ja = quotedFont(fonts.fontWriteJa || legacy)
  const latin = en ? `${en}, ${DEFAULT_FONT_LATIN_FACES}` : DEFAULT_FONT_LATIN_FACES
  const chinese = zh ? `${zh}, ${DEFAULT_FONT_ZH_FACES}` : DEFAULT_FONT_ZH_FACES
  const japanese = ja ? `${ja}, ${DEFAULT_FONT_JA_FACES}` : DEFAULT_FONT_JA_FACES
  return {
    en: `${latin}, sans-serif`,
    zh: `${latin}, ${chinese}, sans-serif`,
    ja: `${latin}, ${japanese}, ${chinese}, sans-serif`
  }
}

export function exportTypographyCss(typography = {}) {
  const legacy = normalizeFontName(typography.fontWrite)
  const writeEn = normalizeFontName(typography.fontWriteEn || legacy)
  const writeZh = normalizeFontName(typography.fontWriteZh || legacy)
  const writeJa = normalizeFontName(typography.fontWriteJa || legacy)
  const mono = normalizeFontName(typography.fontMono)
  let css = ''
  if (writeEn || writeZh || writeJa) {
    const stacks = writingFontStacks({ fontWriteEn: writeEn, fontWriteZh: writeZh, fontWriteJa: writeJa })
    css += `.doc{font-family:${stacks.en}!important;}`
    css += `.doc:lang(zh){font-family:${stacks.zh}!important;}`
    css += `.doc:lang(ja){font-family:${stacks.ja}!important;}`
  }
  if (mono) {
    css += `.doc code,.doc pre,.doc pre code{font-family:${fontStack(mono, DEFAULT_FONT_MONO)}!important;}`
  }
  return css
}
