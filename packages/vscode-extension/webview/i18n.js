// Webview i18n: shared keys resolve through the app's string table
// (src/renderer/src/i18n-strings.js — bundled directly, so it can never drift),
// with a small overlay for extension-only wording that has no app counterpart
// (VSCode-specific labels + the mermaid zoom lightbox chrome).
import { translate } from '../../../src/renderer/src/i18n-strings.js'

const EXTRA = {
  en: {
    'mermaid.zoom': 'Zoom diagram',
    'math.zoom': 'Zoom formula',
    'mermaid.zoomIn': 'Zoom in',
    'mermaid.zoomOut': 'Zoom out',
    'mermaid.zoomReset': 'Reset (fit)',
    'mermaid.zoomClose': 'Close (Esc)',
    'settings.themeLabel': 'Theme',
    'settings.theme.auto': 'Follow VSCode',
    'settings.theme.warmLight': 'Warm Light',
    'settings.theme.warmDark': 'Warm Dark',
    'settings.langLabel': 'Language',
    'settings.lang.auto': 'Follow system',
    'settings.lang.zh': '中文',
    'settings.lang.ja': '日本語',
    'settings.lang.en': 'English',
    'find.noResults': 'No results',
    'mode.source': 'Source',
    'img.untitled': 'Save the document first to paste images.',
    'img.tooLarge': 'Image is too large (max 20 MB).',
    'img.saveFailed': 'Failed to save image:'
  },
  zh: {
    'mermaid.zoom': '放大查看',
    'math.zoom': '放大查看公式',
    'mermaid.zoomIn': '放大',
    'mermaid.zoomOut': '缩小',
    'mermaid.zoomReset': '复位（适应）',
    'mermaid.zoomClose': '关闭（Esc）',
    'settings.themeLabel': '主题配色',
    'settings.theme.auto': '跟随 VSCode',
    'settings.theme.warmLight': '暖光',
    'settings.theme.warmDark': '暖夜',
    'settings.langLabel': '语言',
    'settings.lang.auto': '跟随系统',
    'settings.lang.zh': '中文',
    'settings.lang.ja': '日本語',
    'settings.lang.en': 'English',
    'find.noResults': '无结果',
    'mode.source': '源码',
    'img.untitled': '请先保存文档,再粘贴图片。',
    'img.tooLarge': '图片过大(上限 20 MB)。',
    'img.saveFailed': '图片保存失败:'
  },
  ja: {
    'mermaid.zoom': '図を拡大',
    'math.zoom': '数式を拡大',
    'mermaid.zoomIn': '拡大',
    'mermaid.zoomOut': '縮小',
    'mermaid.zoomReset': 'リセット（フィット）',
    'mermaid.zoomClose': '閉じる（Esc）',
    'settings.themeLabel': 'テーマ',
    'settings.theme.auto': 'VSCodeに従う',
    'settings.theme.warmLight': '暖光',
    'settings.theme.warmDark': '暖夜',
    'settings.langLabel': '言語',
    'settings.lang.auto': 'システムに従う',
    'settings.lang.zh': '中文',
    'settings.lang.ja': '日本語',
    'settings.lang.en': 'English',
    'find.noResults': '該当なし',
    'mode.source': 'ソース',
    'img.untitled': '画像を貼り付けるには、先にドキュメントを保存してください。',
    'img.tooLarge': '画像が大きすぎます（上限 20 MB）。',
    'img.saveFailed': '画像の保存に失敗しました：'
  }
}

export function makeT(lang) {
  const extra = EXTRA[lang] || EXTRA.en
  return (key, vars) => extra[key] ?? EXTRA.en[key] ?? translate(lang, key, vars)
}
