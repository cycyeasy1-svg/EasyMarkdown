// Webview i18n: shared keys resolve through the app's string table
// (src/renderer/src/i18n-strings.js — bundled directly, so it can never drift),
// with a small overlay for extension-only wording that has no app counterpart
// (VSCode-specific labels + the mermaid zoom lightbox chrome).
import { translate } from '../../../src/renderer/src/i18n-strings.js'

const EXTRA = {
  en: {
    'draft.externalConflict': 'The document changed while this Keep edit was unfinished.',
    'draft.externalConflictDetail':
      'The original source position can no longer be identified safely. Copy the draft before continuing, or discard it.',
    'draft.recoveryText': 'Uncommitted Keep draft',
    'draft.copy': 'Copy draft',
    'draft.discard': 'Discard draft',
    'draft.copied': 'Draft copied. The externally updated document is now shown.',
    'draft.copyFailed': 'Could not access the clipboard. Select and copy the draft manually.',
    'edit.applyFailed': 'The Keep edit could not be applied. Your draft has been restored.',
    'problems.open': 'Open VS Code Problems',
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
    'draft.externalConflict': '文档在 Keep 编辑尚未确认时发生了变化。',
    'draft.externalConflictDetail':
      '已无法安全识别原来的源码位置。请先复制草稿再继续，或者舍弃草稿。',
    'draft.recoveryText': '尚未确认的 Keep 草稿',
    'draft.copy': '复制草稿',
    'draft.discard': '舍弃草稿',
    'draft.copied': '草稿已复制，当前显示外部更新后的文档。',
    'draft.copyFailed': '无法访问剪贴板，请手动选择并复制草稿。',
    'edit.applyFailed': 'Keep 修改未能应用，编辑草稿已恢复。',
    'problems.open': '打开 VS Code 问题面板',
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
    'draft.externalConflict': 'Keep の編集を確定する前に文書が変更されました。',
    'draft.externalConflictDetail':
      '元のソース位置を安全に特定できません。続行する前に下書きをコピーするか、破棄してください。',
    'draft.recoveryText': '未確定の Keep 下書き',
    'draft.copy': '下書きをコピー',
    'draft.discard': '下書きを破棄',
    'draft.copied': '下書きをコピーしました。外部更新後の文書を表示しています。',
    'draft.copyFailed': 'クリップボードにアクセスできません。下書きを選択して手動でコピーしてください。',
    'edit.applyFailed': 'Keep の変更を適用できませんでした。編集下書きを復元しました。',
    'problems.open': 'VS Code の問題パネルを開く',
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
