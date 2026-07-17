import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
// The Milkdown/Crepe rich editor pulls in the whole ProseMirror + KaTeX stack
// (~3.6 MB). It's only used when a tab opts into WYSIWYG (`milkdownForced`); the
// `.md` default is the lightweight source-backed KeepEditor. Loading it lazily
// keeps that heavy code (and its memory) out of startup for the common case.
const Editor = lazy(() => import('./components/Editor.jsx'))
import KeepEditor from './components/KeepEditor.jsx'
import Sidebar from './components/Sidebar.jsx'
import Tabs from './components/Tabs.jsx'
import Outline, { parseHeadingDetails } from './components/Outline.jsx'
import StatusBar from './components/StatusBar.jsx'
import SaveFab from './components/SaveFab.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import TabSwitcher from './components/TabSwitcher.jsx'
import { Icon } from './components/icons.jsx'
import { THEMES, DEFAULT_THEME, applyTheme } from './themes.js'
import { I18nProvider, translate, DEFAULT_LANG } from './i18n.jsx'
import { welcomeDoc } from './onboarding.js'
import Welcome from './components/Welcome.jsx'
import WindowControls from './components/WindowControls.jsx'
import UpdateToast from './components/UpdateToast.jsx'
import RenameModal from './components/RenameModal.jsx'
import ModeSwitchDialog from './components/ModeSwitchDialog.jsx'
import KeepChangeReview from './components/KeepChangeReview.jsx'
import LocalHistoryDialog from './components/LocalHistoryDialog.jsx'
import Settings from './components/Settings.jsx'
import SearchPanel from './components/SearchPanel.jsx'
import LinkIntelligencePanel from './components/LinkIntelligencePanel.jsx'
import LinkUpdateDialog from './components/LinkUpdateDialog.jsx'
import {
  loadSettings,
  saveSettings,
  applyPageWidth,
  applyFontSize,
  applyEditorFonts,
  applyZoom,
  applyLineHeight,
  applyParagraphSpacing,
  normalizeZoom,
  ZOOM_STEP,
  DEFAULT_ZOOM
} from './settings.js'
import {
  attachmentLinkMarkdown,
  extractMarkdownLinks,
  slugifyMarkdownAnchor
} from '../../main/helpers.js'
import { applyCustomTheme } from './customThemes.js'
import { fireToast, HM_TOAST_EVENT } from './ui.js'
import logoUrl from './assets/logo.png'
import {
  clearFindHighlights,
  clearSourceFindHighlight,
  findRangesInEl,
  findRangeIndexFromStart,
  paintFindHighlights,
  paintSourceFindHighlight,
  scrollRangeIntoView,
  findMatchesInText,
  replaceMatchesInText,
  blockIndexForLine,
  revealSourceFindMatch
} from './find.js'
import {
  isNewerVersion, isAbsolutePath, sanitizeWorkspaces, baseName, dirName, joinPath,
  isPlainTextDoc, isHeavyDoc, genId, LS, loadSession, buildSessionTabs,
  sessionSnapshotEqual, MD_DOC_RE,
  rememberRecent, removeRecentPath, clearUnpinnedRecents, toggleRecentPinned,
  reorderTabsList, openPreviewTabInList, promotePreviewTabInList,
  toggleTabPinnedInList, pathInWorkspace
} from './paths.js'
import {
  countSourceLines,
  buildLineNumberText,
  buildSourceView,
  computeFoldRows,
  patchFoldedSourceLines
} from './sourceFold.js'
import {
  lineColumnAtOffset,
  lineStartOffset,
  offsetForLineColumn,
  sourceOffsetToDisplayOffset,
  displayOffsetToSourceOffset
} from './source-position.js'
import {
  pruneNavigationHistory,
  recordNavigationLocation,
  stepNavigationHistory
} from './navigation-history.js'
import {
  buildMruTabOrder,
  createClosedTabEntry,
  insertRestoredTab,
  pushClosedTabEntries,
  removeClosedTabEntry,
  sanitizeClosedTabs,
  stepWrappedIndex,
  touchTabMru
} from './tab-history.js'

const ONBOARDED_KEY = 'easymarkdown.onboarded.v1'
// One-time coach-mark explaining Keep vs Milkdown, shown on first run only.
const MODEHINT_KEY = 'easymarkdown.modehint.v1'
const UPDATE_DISMISS_KEY = 'easymarkdown.update.dismissed'
const EMPTY_PALETTE_HEADINGS = []

// Resolve a relative link path against a base directory (handles ./ and ../).
function resolveRelPath(dir, rel) {
  const base = (dir || '').replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = base ? base.split('/') : []
  rel.replace(/\\/g, '/').split('/').forEach((seg) => {
    if (seg === '' || seg === '.') return
    if (seg === '..') parts.pop()
    else parts.push(seg)
  })
  return parts.join('/')
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Heading-anchor slug, Typora/GitHub-ish: trim, spaces→'-', drop punctuation.
const slugifyAnchor = (s) =>
  s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '')

// Find the 1-based source line an in-doc anchor points at. Tries, in order:
// a heading whose slug matches, an explicit id/name/{#id} anchor, then the first
// line that literally contains the anchor. Returns 0 when nothing matches.
function findAnchorLine(content, anchor) {
  if (!content || !anchor) return 0
  const lines = content.split('\n')
  const want = anchor.toLowerCase()
  const wantSlug = slugifyAnchor(anchor)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/)
    if (m && (slugifyAnchor(m[1]) === wantSlug || m[1].trim().toLowerCase() === want)) return i + 1
  }
  const re = new RegExp(`(?:id|name)\\s*=\\s*["']?${escapeRegExp(anchor)}["']?`, 'i')
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i]) || lines[i].includes(`{#${anchor}}`)) return i + 1
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(anchor)) return i + 1
  }
  return 0
}

const safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function markdownContextAtOffset(content, rawOffset) {
  const source = String(content ?? '')
  const offset = Math.max(0, Math.min(Number(rawOffset) || 0, source.length))
  const { line } = lineColumnAtOffset(source, offset)
  const links = extractMarkdownLinks(source)
  const exactLink = links.find((link) => offset >= link.start && offset <= link.end)
  const lineLinks = links.filter((link) => link.line === line + 1)
  const link = exactLink || (lineLinks.length === 1 ? lineLinks[0] : null)
  if (link) return { type: 'link', href: link.target, line: link.line }
  const rawLine = source.split('\n')[line]?.replace(/\r$/, '') || ''
  const heading = rawLine.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
  if (!heading) return null
  return {
    type: 'heading',
    line: line + 1,
    text: heading[1].replace(/\s*\{#[^}]+\}\s*$/, '').trim()
  }
}

function resolveReferenceTarget(tab, context) {
  if (!tab?.path || !context) return null
  if (context.type === 'heading') {
    const explicit = String(context.text || '').match(/\s*\{#([^}\s]+)\}\s*$/)?.[1]
    const text = String(context.text || '').replace(/\s*\{#[^}]+\}\s*$/, '').trim()
    return {
      targetPath: tab.path,
      anchor: explicit || slugifyMarkdownAnchor(text),
      label: text || baseName(tab.path)
    }
  }
  const href = String(context.href || '').trim()
  if (!href || (!/^[a-zA-Z]:[\\/]/.test(href) && /^[a-z][a-z\d+.-]*:/i.test(href))) {
    return null
  }
  const hashAt = href.indexOf('#')
  const beforeHash = hashAt >= 0 ? href.slice(0, hashAt) : href
  const queryAt = beforeHash.indexOf('?')
  const rawPath = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash
  const anchor = hashAt >= 0 ? safeDecodeURIComponent(href.slice(hashAt + 1)) : ''
  let targetPath = tab.path
  if (rawPath) {
    const decoded = safeDecodeURIComponent(rawPath)
    targetPath = isAbsolutePath(decoded)
      ? decoded
      : resolveRelPath(dirName(tab.path), decoded)
    if (!/\.[a-z0-9]+$/i.test(targetPath)) targetPath += '.md'
  }
  return {
    targetPath,
    anchor,
    label: anchor ? `${baseName(targetPath)}#${anchor}` : baseName(targetPath)
  }
}

// Pure line/fold helpers live in sourceFold.js (unit-tested in
// test/source-fold.test.js). Memoized: App passes stable per-tab handlers and
// style objects, so a pane only re-renders when its own value/layout changes.
const SourceEditorPane = memo(function SourceEditorPane({
  value,
  textareaRef,
  paneClass,
  style,
  onPaneFocus,
  onPaneMouseDown,
  onChange,
  onViewportChange,
  onSelectionChange,
}) {
  const localTextareaRef = useRef(null)
  const lineNumbersRef = useRef(null)
  const foldGutterRef = useRef(null)
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set())
  const [sourceMetrics, setSourceMetrics] = useState({ lineHeight: 24, padTop: 40 })
  const interactionRef = useRef({ revision: 0, kind: 'none' })
  const programmaticUntilRef = useRef(0)
  const pendingCaretRef = useRef(null)
  const hasFolds = collapsedKeys.size > 0

  // Two regimes, split on purpose:
  //  - Folds active (rare): keep a fully SYNCHRONOUS view — the textarea shows a
  //    derived value, and handleChange patches edits back through visibleMap, so
  //    the view must never lag the keystroke (a stale patch base corrupts text).
  //  - No folds (the normal path — where the biggest .txt/heavy docs live):
  //    the textarea shows `value` directly and nothing needs the full view, so
  //    the per-keystroke work drops to one zero-allocation line count; the fold
  //    gutter is fed from a deferred scan (a beat late is fine for buttons).
  const foldLines = useMemo(() => (hasFolds ? String(value ?? '').split('\n') : null), [hasFolds, value])
  const foldView = useMemo(
    () => (hasFolds ? buildSourceView(foldLines, collapsedKeys) : null),
    [hasFolds, foldLines, collapsedKeys]
  )
  const deferredValue = useDeferredValue(value)
  const prevFoldRowsRef = useRef([])
  const idleFoldRows = useMemo(() => {
    if (hasFolds) return null
    const next = computeFoldRows(String(deferredValue ?? '').split('\n'))
    // Keep the previous identity when nothing changed, so the gutter render and
    // the measuring layout effect below skip on plain typing.
    const prev = prevFoldRowsRef.current
    if (prev.length === next.length && prev.every((r, i) => r.row === next[i].row && r.key === next[i].key)) {
      return prev
    }
    prevFoldRowsRef.current = next
    return next
  }, [hasFolds, deferredValue])
  const foldRows = hasFolds ? foldView.foldRows : idleFoldRows
  const lineCount = useMemo(
    () => (hasFolds ? null : countSourceLines(String(value ?? ''))),
    [hasFolds, value]
  )
  const noFoldLineNumbers = useMemo(
    () => (hasFolds ? null : buildLineNumberText(lineCount)),
    [hasFolds, lineCount]
  )
  const displayedValue = hasFolds ? foldView.displayLines.join('\n') : value
  const lineNumbers = hasFolds ? foldView.lineNumbers : noFoldLineNumbers

  const valueRef = useRef(value)
  const hasFoldsRef = useRef(hasFolds)
  const foldLinesRef = useRef(foldLines)
  const foldViewRef = useRef(foldView)
  const lineCountRef = useRef(lineCount)
  const collapsedKeysRef = useRef(collapsedKeys)
  valueRef.current = value
  hasFoldsRef.current = hasFolds
  foldLinesRef.current = foldLines
  foldViewRef.current = foldView
  lineCountRef.current = lineCount
  collapsedKeysRef.current = collapsedKeys
  // Total line count regardless of regime (fold state derives it from the view).
  const totalLines = useCallback(
    () =>
      hasFoldsRef.current && foldLinesRef.current
        ? foldLinesRef.current.length
        : lineCountRef.current || 1,
    []
  )

  const markInteraction = useCallback((kind) => {
    interactionRef.current = {
      revision: interactionRef.current.revision + 1,
      kind
    }
  }, [])

  const setTextareaRef = useCallback((node) => {
    localTextareaRef.current = node
    if (textareaRef) textareaRef.current = node
  }, [textareaRef])

  const syncSourceGutters = useCallback(() => {
    const el = localTextareaRef.current
    const nums = lineNumbersRef.current
    const folds = foldGutterRef.current
    if (!el) return
    const transform = `translateY(${-el.scrollTop}px)`
    if (nums) nums.style.transform = transform
    if (folds) folds.style.transform = transform
  }, [])

  const fullLinesNow = useCallback(
    () => hasFoldsRef.current && foldLinesRef.current
      ? foldLinesRef.current
      : String(valueRef.current ?? '').split('\n'),
    []
  )

  const fullOffsetFromDisplay = useCallback((displayOffset) => {
    if (!hasFoldsRef.current || !foldViewRef.current) return displayOffset
    return displayOffsetToSourceOffset(
      fullLinesNow(),
      foldViewRef.current.displayLines,
      foldViewRef.current.visibleMap,
      displayOffset
    )
  }, [fullLinesNow])

  const displayOffsetFromFull = useCallback((rawOffset, expand = false) => {
    const lines = fullLinesNow()
    const full = lines.join('\n')
    const { line } = lineColumnAtOffset(full, rawOffset)
    if (!hasFoldsRef.current || !foldViewRef.current) return rawOffset
    const hiddenBy = foldViewRef.current.hiddenByLine.get(line)
    if (hiddenBy?.length) {
      if (expand) {
        setCollapsedKeys((prev) => {
          const next = new Set(prev)
          hiddenBy.forEach((key) => next.delete(key))
          return next
        })
      }
      return null
    }
    return sourceOffsetToDisplayOffset(
      lines,
      foldViewRef.current.displayLines,
      foldViewRef.current.visibleMap,
      rawOffset
    )
  }, [fullLinesNow])

  const measureSourceMetrics = useCallback(() => {
    const el = localTextareaRef.current
    if (!el) return
    const cs = getComputedStyle(el)
    const padTop = parseFloat(cs.paddingTop) || 40
    const padBottom = parseFloat(cs.paddingBottom) || 0
    const fontSize = parseFloat(cs.fontSize) || 14
    const fallbackLineHeight = parseFloat(cs.lineHeight) || fontSize * 1.75
    const rowCount = Math.max(
      1,
      hasFoldsRef.current && foldViewRef.current
        ? foldViewRef.current.displayLines.length
        : lineCountRef.current || 1
    )
    const measuredContentHeight = el.scrollHeight - padTop - padBottom
    let lineHeight = measuredContentHeight > 0 ? measuredContentHeight / rowCount : fallbackLineHeight
    if (!Number.isFinite(lineHeight) || lineHeight < fallbackLineHeight * 0.5 || lineHeight > fallbackLineHeight * 1.5) {
      lineHeight = fallbackLineHeight
    }
    setSourceMetrics((prev) =>
      Math.abs(prev.lineHeight - lineHeight) < 0.1 && Math.abs(prev.padTop - padTop) < 0.1
        ? prev
        : { lineHeight, padTop }
    )
  }, [])

  const scrollToSourceLine = useCallback((lineNumber, commit = false) => {
    const total = totalLines()
    const ln = Math.min(Math.max(1, lineNumber), total)
    const targetIdx = ln - 1
    const hiddenBy = hasFoldsRef.current
      ? foldViewRef.current?.hiddenByLine.get(targetIdx)
      : null
    if (hiddenBy?.length) {
      setCollapsedKeys((prev) => {
        const next = new Set(prev)
        hiddenBy.forEach((key) => next.delete(key))
        return next
      })
    }

    const apply = () => {
      const el = localTextareaRef.current
      if (!el) return
      let row, off, lineText
      if (hasFoldsRef.current && foldViewRef.current) {
        const map = foldViewRef.current.visibleMap
        const displayLines = foldViewRef.current.displayLines
        row = Math.max(0, map.indexOf(targetIdx))
        off = 0
        for (let k = 0; k < row; k++) off += (displayLines[k] || '').length + 1
        lineText = displayLines[row] || ''
      } else {
        // No folds: row === line index. The full view isn't materialized on this
        // path, so split once here — a user-level jump, not a keystroke cost.
        const all = String(valueRef.current ?? '').split('\n')
        row = Math.min(targetIdx, all.length - 1)
        off = 0
        for (let k = 0; k < row; k++) off += (all[k] || '').length + 1
        lineText = all[row] || ''
      }
      if (commit) {
        el.focus()
        el.setSelectionRange(off, off + lineText.length)
      }
      const cs = getComputedStyle(el)
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20
      el.scrollTop = Math.max(0, row * lh - el.clientHeight / 2)
      syncSourceGutters()
    }

    requestAnimationFrame(apply)
    setTimeout(apply, hiddenBy?.length ? 90 : 0)
  }, [syncSourceGutters, totalLines])

  const scrollToSourceOffset = useCallback((rawOffset, options = {}) => {
    const lines = fullLinesNow()
    const full = lines.join('\n')
    const safeOffset = Math.max(0, Math.min(Number(rawOffset) || 0, full.length))
    displayOffsetFromFull(safeOffset, true)
    let applied = false

    const apply = () => {
      if (applied) return true
      const el = localTextareaRef.current
      if (!el) return false
      const displayOffset = displayOffsetFromFull(safeOffset, false)
      if (!Number.isFinite(displayOffset)) return false
      const displayed = el.value || ''
      const displayPos = lineColumnAtOffset(displayed, displayOffset)
      const cs = getComputedStyle(el)
      const padTop = parseFloat(cs.paddingTop) || sourceMetrics.padTop || 40
      const lineHeight = parseFloat(cs.lineHeight) || sourceMetrics.lineHeight || 24
      programmaticUntilRef.current = performance.now() + 180
      if (options.selectLine) {
        const start = displayOffset - displayPos.column
        const end = start + String(displayed.split('\n')[displayPos.line] || '').length
        el.setSelectionRange(start, end)
      } else if (options.placeCaret) {
        el.setSelectionRange(displayOffset, displayOffset)
      }
      if (options.focus) el.focus({ preventScroll: true })
      const y = padTop + displayPos.line * lineHeight
      el.scrollTop = Math.max(
        0,
        options.align === 'top' ? y - padTop : y - (el.clientHeight - lineHeight) / 2
      )
      syncSourceGutters()
      el.dispatchEvent(new CustomEvent('hm:source-layout'))
      if (options.userNavigation) markInteraction('selection')
      applied = true
      return true
    }

    const raf = requestAnimationFrame(apply)
    const timer = setTimeout(apply, 90)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [
    displayOffsetFromFull,
    fullLinesNow,
    markInteraction,
    sourceMetrics.lineHeight,
    sourceMetrics.padTop,
    syncSourceGutters
  ])

  const insertMarkdown = useCallback((markdown) => {
    const el = localTextareaRef.current
    if (!el) return false
    const full = String(valueRef.current ?? '')
    const start = fullOffsetFromDisplay(el.selectionStart)
    const end = fullOffsetFromDisplay(el.selectionEnd)
    const insert = String(markdown ?? '').replace(/\r?\n/g, full.includes('\r\n') ? '\r\n' : '\n')
    const next = full.slice(0, start) + insert + full.slice(end)
    pendingCaretRef.current = start + insert.length
    if (hasFoldsRef.current) setCollapsedKeys(new Set())
    markInteraction('edit')
    onChange({ target: { value: next } })
    return true
  }, [fullOffsetFromDisplay, markInteraction, onChange])

  const getViewportOffset = useCallback(() => {
    const el = localTextareaRef.current
    if (!el) return 0
    const lines = fullLinesNow()
    const row = Math.max(
      0,
      Math.floor((el.scrollTop + sourceMetrics.lineHeight * 0.5) / sourceMetrics.lineHeight)
    )
    const sourceLine = hasFoldsRef.current && foldViewRef.current
      ? foldViewRef.current.visibleMap[Math.min(row, foldViewRef.current.visibleMap.length - 1)]
      : Math.min(row, lines.length - 1)
    return offsetForLineColumn(lines, sourceLine, 0)
  }, [fullLinesNow, sourceMetrics.lineHeight])

  useLayoutEffect(() => {
    if (!Number.isFinite(pendingCaretRef.current)) return
    const el = localTextareaRef.current
    if (!el) return
    const caret = pendingCaretRef.current
    const displayCaret = displayOffsetFromFull(caret, false)
    if (!Number.isFinite(displayCaret)) return
    pendingCaretRef.current = null
    programmaticUntilRef.current = performance.now() + 180
    el.focus({ preventScroll: true })
    el.setSelectionRange(displayCaret, displayCaret)
  }, [displayedValue, displayOffsetFromFull])

  useLayoutEffect(() => {
    const el = localTextareaRef.current
    if (!el) return
    el.__hmSourceApi = {
      getFullValue: () => valueRef.current,
      getLineCount: totalLines,
      scrollToLine: scrollToSourceLine,
      scrollToOffset: scrollToSourceOffset,
      insertMarkdown,
      getFullSelection: () => ({
        start: fullOffsetFromDisplay(el.selectionStart),
        end: fullOffsetFromDisplay(el.selectionEnd)
      }),
      restoreFullSelection: (selection, options = {}) => {
        const full = String(valueRef.current ?? '')
        const start = Math.max(0, Math.min(Number(selection?.start) || 0, full.length))
        const end = Math.max(start, Math.min(Number(selection?.end) || start, full.length))
        displayOffsetFromFull(start, true)
        displayOffsetFromFull(end, true)
        let applied = false
        const apply = () => {
          if (applied) return
          const displayStart = displayOffsetFromFull(start, false)
          const displayEnd = displayOffsetFromFull(end, false)
          if (!Number.isFinite(displayStart) || !Number.isFinite(displayEnd)) return
          programmaticUntilRef.current = performance.now() + 180
          el.setSelectionRange(displayStart, displayEnd)
          if (options.focus) el.focus({ preventScroll: true })
          if (options.notify) onSelectionChange?.(end)
          applied = true
        }
        requestAnimationFrame(apply)
        setTimeout(apply, 90)
      },
      getViewportOffset,
      fullRangeToDisplayRange: (start, end, expand = false) => {
        const displayStart = displayOffsetFromFull(start, expand)
        const displayEnd = displayOffsetFromFull(end, expand)
        return Number.isFinite(displayStart) && Number.isFinite(displayEnd)
          ? { start: displayStart, end: displayEnd }
          : null
      },
      isSelectionVisible: () => {
        const { line } = lineColumnAtOffset(el.value || '', el.selectionEnd)
        const top = sourceMetrics.padTop + line * sourceMetrics.lineHeight
        return top >= el.scrollTop && top <= el.scrollTop + el.clientHeight - sourceMetrics.lineHeight
      },
      getInteractionState: () => ({ ...interactionRef.current })
    }
    return () => {
      if (el.__hmSourceApi?.scrollToLine === scrollToSourceLine) delete el.__hmSourceApi
    }
  }, [
    displayOffsetFromFull,
    fullLinesNow,
    fullOffsetFromDisplay,
    getViewportOffset,
    insertMarkdown,
    onSelectionChange,
    scrollToSourceLine,
    scrollToSourceOffset,
    sourceMetrics.lineHeight,
    sourceMetrics.padTop,
    totalLines
  ])

  useLayoutEffect(() => {
    measureSourceMetrics()
    syncSourceGutters()
    localTextareaRef.current?.dispatchEvent(new CustomEvent('hm:source-layout'))
  }, [lineNumbers, foldRows, measureSourceMetrics, syncSourceGutters])

  const handleChange = useCallback((e) => {
    markInteraction('edit')
    if (!collapsedKeysRef.current.size) {
      onChange(e)
      return
    }
    // Folds active: the textarea edits the derived view; patch it back into the
    // full text. foldLines/foldView are computed synchronously in this regime,
    // so the patch base can never be stale.
    const fv = foldViewRef.current
    const nextContent = patchFoldedSourceLines(
      foldLinesRef.current,
      fv.displayLines,
      e.target.value.split('\n'),
      fv.visibleMap
    )
    onChange({ target: { value: nextContent } })
  }, [markInteraction, onChange])

  const handleScroll = useCallback(() => {
    syncSourceGutters()
    if (performance.now() > programmaticUntilRef.current) {
      markInteraction('scroll')
      onViewportChange?.(getViewportOffset())
    }
  }, [getViewportOffset, markInteraction, onViewportChange, syncSourceGutters])

  const handleSelect = useCallback((e) => {
    if (document.activeElement === e.currentTarget && performance.now() > programmaticUntilRef.current) {
      markInteraction('selection')
      onSelectionChange?.(fullOffsetFromDisplay(e.currentTarget.selectionEnd))
    }
  }, [fullOffsetFromDisplay, markInteraction, onSelectionChange])

  const toggleFold = useCallback((key) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <div
      className={`source-editor-wrap${paneClass || ''}`}
      style={style}
      onFocusCapture={onPaneFocus}
      onMouseDownCapture={(e) => {
        markInteraction('selection')
        onPaneMouseDown?.(e)
      }}
    >
      <textarea
        ref={setTextareaRef}
        className="source-editor"
        value={displayedValue}
        spellCheck={false}
        wrap="off"
        onScroll={handleScroll}
        onKeyDown={(e) => {
          if (/^(Arrow|Home|End|Page)/.test(e.key)) markInteraction('selection')
        }}
        onSelect={handleSelect}
        onChange={handleChange}
      />
      <div className="source-gutter-mask" aria-hidden="true" />
      <pre ref={lineNumbersRef} className="source-line-numbers" aria-hidden="true">
        {lineNumbers}
      </pre>
      <div ref={foldGutterRef} className="source-fold-gutter">
        {foldRows.map((fold) => (
          <button
            key={`${fold.line}:${fold.key}`}
            type="button"
            tabIndex={-1}
            className={`source-fold-toggle${fold.collapsed ? ' is-collapsed' : ''}`}
            style={{
              top: `${sourceMetrics.padTop + fold.row * sourceMetrics.lineHeight + Math.max(0, (sourceMetrics.lineHeight - 24) / 2)}px`
            }}
            title="折叠/展开此节"
            aria-label="折叠/展开此节"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleFold(fold.key)}
          >
            <Icon name="chevron-down" size={15} strokeWidth={2.2} />
          </button>
        ))}
      </div>
    </div>
  )
})

export default function App() {
  const session = useRef(loadSession()).current
  // Mobile (Capacitor) builds run the same renderer; a few affordances differ
  // (drawer sidebar, no split button). Desktop is unaffected.
  const isMobile = window.api.platform === 'ios' || window.api.platform === 'android'
  const [tabs, setTabs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [closedTabs, setClosedTabs] = useState(() => sanitizeClosedTabs(session.closedTabs))
  const closedTabsRef = useRef(closedTabs)
  closedTabsRef.current = closedTabs
  const replaceClosedTabs = useCallback((nextOrUpdater) => {
    const next =
      typeof nextOrUpdater === 'function'
        ? nextOrUpdater(closedTabsRef.current)
        : nextOrUpdater
    closedTabsRef.current = next
    setClosedTabs(next)
  }, [])
  // Multi-root workspace: an array of { rootPath, rootName }, each rendered as its
  // own collapsible tree in the sidebar. Upgrading users with the old single
  // `session.workspace` get it migrated to the first root.
  const [workspaces, setWorkspaces] = useState(() =>
    sanitizeWorkspaces(session.workspaces, session.workspace)
  )
  // On phones the sidebar overlays the editor, so it starts closed to keep the
  // writing surface front-and-center (desktop keeps its previous default).
  const [sidebarOpen, setSidebarOpen] = useState(session.sidebarOpen ?? !isMobile)
  const [sidebarMode, setSidebarMode] = useState(session.sidebarMode || 'files') // 'files' or 'outline'
  // Desktop sidebar width (px), dragged via the divider on its right edge and
  // persisted across sessions. Ignored on mobile (the sidebar overlays).
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.min(560, Math.max(180, Number(session.sidebarWidth) || 260))
  )
  const [theme, setTheme] = useState(session.theme || DEFAULT_THEME)
  // Active custom CSS theme (filename in userData/themes), or null. Overlays the
  // built-in base theme. `customThemes` is the list scanned from that folder.
  const [customTheme, setCustomTheme] = useState(session.customTheme || null)
  const [customThemes, setCustomThemes] = useState([])
  const [lang, setLang] = useState(session.lang || DEFAULT_LANG)
  const [recents, setRecents] = useState(session.recents || [])
  // Source mode is remembered per tab for the lifetime of the workspace. A tab
  // that was left in source returns there when re-activated; other tabs keep
  // their own Keep/Milkdown view.
  const [sourceModeIds, setSourceModeIds] = useState(() => new Set())
  const sourceModeIdsRef = useRef(sourceModeIds)
  sourceModeIdsRef.current = sourceModeIds
  const [sourceMountedIds, setSourceMountedIds] = useState(() => new Set())
  const sourceMode = activeId != null && sourceModeIds.has(activeId)
  const sourceModeRef = useRef(sourceMode)
  sourceModeRef.current = sourceMode
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const [zenReveal, setZenReveal] = useState(false)
  const zenHideTimerRef = useRef(0)
  const [tabSwitcher, setTabSwitcher] = useState(null)
  const tabSwitcherRef = useRef(tabSwitcher)
  tabSwitcherRef.current = tabSwitcher
  const mruTabIdsRef = useRef([])
  const navigationHistoryRef = useRef({ back: [], forward: [] })
  const [, setNavigationVersion] = useState(0)
  const rememberNavigationRef = useRef(() => {})
  const cancelNavigationEffectsRef = useRef(() => {})
  // Unified settings modal (status-bar gear / command palette / File menu).
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Bumped each time workspace search is invoked so an already-open panel
  // re-focuses its input (Ctrl+Shift+F while the panel is showing).
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)
  const [linkPanel, setLinkPanel] = useState({
    enabled: false,
    view: 'problems',
    problemTabId: null,
    docPath: '',
    problems: [],
    diagnosing: false,
    referenceGroups: [],
    referencesRunning: false,
    referenceLabel: '',
    filesScanned: 0,
    truncated: false
  })
  const linkPanelRef = useRef(linkPanel)
  linkPanelRef.current = linkPanel
  const linkDiagnosisGenerationRef = useRef(0)
  const linkReferenceGenerationRef = useRef(0)
  const linkDiagnosisTimerRef = useRef(0)
  const problemCursorRef = useRef(new Map())
  const [headingRenameState, setHeadingRenameState] = useState(null)
  const [linkUpdateState, setLinkUpdateState] = useState(null)
  const findCurrentReferencesRef = useRef(() => {})
  const beginHeadingRenameRef = useRef(() => {})
  const stepProblemRef = useRef(() => {})
  // "Home" shows the welcome/landing page while keeping open tabs mounted (so
  // returning to a document doesn't re-create its editor). Cleared whenever a
  // tab is activated or a file is opened.
  const [home, setHome] = useState(false)
  // Split view: id of the tab shown in the right pane (null = no split). The left
  // pane always shows the active tab; the right pane shows this one. A second,
  // independent editor — both panes are fully editable. Driven by the tab
  // right-click menu ("Open in Split") and the top-bar toggle.
  const [splitId, setSplitId] = useState(null)
  // Same-document Source + Keep split. This is independent from the existing
  // two-tab split: the source side follows the active tab, while the Keep side
  // can either follow it or stay pinned to one document.
  const [sourceSplitEnabled, setSourceSplitEnabled] = useState(false)
  const [sourcePreviewId, setSourcePreviewId] = useState(null)
  const [sourcePreviewPinned, setSourcePreviewPinned] = useState(false)
  const [sourceOnLeft, setSourceOnLeft] = useState(true)
  const [sourceScrollSync, setSourceScrollSync] = useState(true)
  // Fraction of the editor area given to the left pane (0..1), dragged via the
  // divider between the two panes.
  const [splitRatio, setSplitRatio] = useState(0.5)
  // Which split pane is focused ('left' = active tab, 'right' = split tab). A tab
  // click loads into the focused pane, so both panes are switchable from the one
  // tab strip. Always 'left' when not split.
  const [focusedPane, setFocusedPane] = useState('left')
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [files, setFiles] = useState([])
  // `mode` is 'text' (content search) or 'line' (jump to a markdown source line).
  const [find, setFind] = useState({
    open: false,
    query: '',
    matches: 0,
    active: 0,
    mode: 'text',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    inSelection: false,
    selectionAvailable: false,
    error: '',
    // Replace row (Ctrl+H / ⌥⌘F): shown state + the replacement text.
    showReplace: false,
    replace: ''
  })
  // Current match set: Range objects (rich editor) or character offsets (source
  // textarea). Held in a ref so next/prev don't trigger re-renders.
  const findRangesRef = useRef([])
  const sourceFindTextareaRef = useRef(null)
  // Editor change handlers are cached before the find callbacks below are
  // declared. Route committed/live content edits through a ref so those stable
  // handlers can request a fresh find pass without being recreated per keypress.
  const refreshFindAfterEditRef = useRef(() => {})
  const findEditDebounceRef = useRef(0)
  const findOpenRef = useRef(find.open)
  findOpenRef.current = find.open
  // "New version available" toast — populated by the startup update check below.
  const [update, setUpdate] = useState(null)
  // Transient bottom-center toast (e.g. "Copied"), fired via a `hm:toast` event.
  const [toast, setToast] = useState(null)
  // Rename-from-tab-menu modal: { id, value } or null. (Electron has no
  // window.prompt, so renaming a tab's file uses this small inline dialog.)
  const [renameState, setRenameState] = useState(null)
  const [startupRestored, setStartupRestored] = useState(false)
  // Mobile "save as": prompt for a filename before writing an untitled doc into
  // the local library (desktop uses the native save dialog instead).
  const [saveNameState, setSaveNameState] = useState(null)
  // Project-styled Keep ⇄ Milkdown warning. `direction` is `toMilkdown` or
  // `toKeep`; the former offers save / continue / cancel, the latter continue /
  // cancel. Native window.confirm cannot express or localize that action set.
  const [modeSwitchState, setModeSwitchState] = useState(null)
  const [modeSwitchSaving, setModeSwitchSaving] = useState(false)
  // Shared line-level review surface for current Keep edits, external-file
  // conflicts, and Keep ⇄ Milkdown warnings.
  const [changeReview, setChangeReview] = useState(null)
  const [localHistoryState, setLocalHistoryState] = useState(null)
  // User preferences (page width, font size, zoom). Persisted separately from
  // the session; see settings.js.
  const [settings, setSettings] = useState(loadSettings)
  // Keep-mode table-filter results per tab id ({ shown, total } or null) — drives
  // the status-bar "filtered N/M" badge for the active tab.
  const [keepFilters, setKeepFilters] = useState({})
  // Keep undo/redo availability per mounted tab. The editor owns the actual
  // patch stacks; App only mirrors the two booleans needed by visible controls.
  const [keepHistoryState, setKeepHistoryState] = useState({})
  // Keep's cell/block editors hold an uncommitted textarea draft outside
  // `tab.content`. Track those tabs separately so tab switches preserve the
  // draft and close/save/mode-switch flows cannot silently drop it.
  const [keepDraftIds, setKeepDraftIds] = useState(() => new Set())
  const keepDraftIdsRef = useRef(keepDraftIds)
  keepDraftIdsRef.current = keepDraftIds
  const keepCommitRef = useRef(() => {})
  const jumpToTabLineRef = useRef(() => {})

  const editorHostRef = useRef(null) // active rich editor's scroll container
  const editorAreaRef = useRef(null) // flex row holding the editor panes (for split-drag math)
  const paneLeftRef = useRef(null) // sidebar <aside> (for resize-drag math)
  const sourceRef = useRef(null) // active source-mode <textarea>
  const sourceBaselinesRef = useRef({}) // tab id -> source value + interaction revision at entry
  const pendingSourceRestoreRef = useRef(null)
  const pendingPreviewRestoreRef = useRef(null)
  const sourceSplitContentTimerRef = useRef(0)
  const sourceSplitScrollLockRef = useRef({ side: null, until: 0 })
  const sourceSplitPreviewRafRef = useRef(0)
  const findInputRef = useRef(null)
  const openFindRef = useRef(null)
  const findStartRef = useRef(null)
  const findOptionsRef = useRef({ caseSensitive: false, wholeWord: false, regex: false, inSelection: false })
  const findSessionsRef = useRef({})
  const findScopesRef = useRef({})
  const findHistoryRef = useRef([])
  const findHistoryCursorRef = useRef(-1)
  const findHistoryDraftRef = useRef('')
  // Registry of each tab's editor API (by tab id). Several markdown editors can
  // be mounted at once (a tab stays mounted after its first activation), so a
  // single ref would get stuck on whichever editor mounted last; keying by tab
  // id lets commands act on the *currently active* document.
  const editorApis = useRef({})
  // The tab id of whichever editor pane last had focus — so Save / Export target
  // the pane you're actually editing in split view, not always the left one.
  const focusedTabRef = useRef(null)
  // Latest session snapshot, kept in a ref so the close/flush path can persist it
  // synchronously without waiting on the debounced write.
  const sessionRef = useRef(null)
  // The snapshot most recently WRITTEN to localStorage — the persistence effect
  // compares against this (not the previous effect run) to skip no-op writes,
  // so a pending real change can never be cancelled by a later equal snapshot.
  const lastWrittenSessionRef = useRef(null)
  // Write the latest snapshot now (close / pagehide / debounce all funnel here,
  // so the persisted shape lives in exactly one place).
  const flushSession = useCallback(() => {
    if (!sessionRef.current) return
    try {
      localStorage.setItem(LS, JSON.stringify(sessionRef.current))
      lastWrittenSessionRef.current = sessionRef.current
    } catch {
      /* quota / serialization failure — skip this snapshot */
    }
  }, [])
  // Lazy mounting: a rich (Crepe) editor is only created once its tab has been
  // activated, then kept mounted so later tab switches stay instant. This keeps
  // startup/session-restore fast — only the active tab spins up an editor
  // instead of every restored tab parsing its whole document at once.
  const [mountedIds, setMountedIds] = useState(() => new Set())
  // Tab ids the user explicitly chose to render richly despite being "heavy"
  // (would otherwise open in the fast plain-text editor to avoid a long freeze).
  const [richForced, setRichForced] = useState(() => new Set())
  const richForcedRef = useRef(richForced)
  richForcedRef.current = richForced
  // Tab ids the user explicitly switched to the Milkdown (Crepe) editor. `.md`
  // docs default to the source-backed "keep" editor (zero-diff saves); this Set
  // opts a tab into full WYSIWYG instead. Mirrors `richForced` (heavy-doc opt-in).
  const [milkdownForced, setMilkdownForced] = useState(() => new Set())
  const milkdownForcedRef = useRef(milkdownForced)
  milkdownForcedRef.current = milkdownForced
  // A tab entering Milkdown from Keep must retain the on-disk savedContent
  // baseline. Otherwise Crepe's initial serialization is incorrectly rebaselined
  // as "saved", hiding exactly the unexpected diff the mode warning is about.
  const keepToMilkdownInitRef = useRef(new Set())
  // Mobile Save As is a two-step flow; remember the requested mode switch until
  // the filename modal finishes writing successfully.
  const pendingModeAfterSaveRef = useRef(null)
  // First-run only: a one-time bubble over the status-bar mode button explaining
  // Keep vs Milkdown. Set when the welcome doc opens; dismissed (and remembered)
  // on "Got it" or the first mode switch. Existing users never trigger it.
  const [showModeHint, setShowModeHint] = useState(false)
  const dismissModeHint = useCallback(() => {
    setShowModeHint(false)
    try {
      localStorage.setItem(MODEHINT_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) || null, [tabs, activeId])
  const paletteHeadings = useMemo(
    () => paletteOpen && activeTab ? parseHeadingDetails(activeTab.content) : EMPTY_PALETTE_HEADINGS,
    [paletteOpen, activeTab]
  )
  const paletteLineCount = useMemo(
    () => paletteOpen && activeTab ? activeTab.content.split('\n').length : 1,
    [paletteOpen, activeTab]
  )
  const activePath = activeTab?.path || null
  // Native (OS-separator) paths of every open tab — used by the sidebar to expand
  // the tree to each open file (must match the tree's `node.path` format).
  // Keyed on the joined path list (not `tabs`) so the array identity stays stable
  // while typing — a content edit doesn't change any path, so the memoized Sidebar
  // skips re-rendering. Only opening/closing/renaming a tab moves this.
  const openPathsKey = tabs.map((t) => t.path || '').join('\n')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openTabPathsRaw = useMemo(() => tabs.map((t) => t.path).filter(Boolean), [openPathsKey])
  // Same paths normalized to forward slashes — the sidebar marks these rows with a
  // dot. Normalized so Windows backslashes don't break the comparison.
  const openTabPaths = useMemo(
    () => new Set(openTabPathsRaw.map((p) => p.replace(/\\/g, '/'))),
    [openTabPathsRaw]
  )
  // Stable projection for the memoized tab strip: `tabs` gets a fresh identity
  // on every keystroke (content edits map a new array), so the strip is keyed on
  // exactly what it renders — id/title/path/dirty — and only re-renders when one
  // of those actually changes (same trick as openPathsKey above).
  const tabsStripKey = tabs
    .map(
      (x) => JSON.stringify([
        x.id,
        x.title,
        x.path || '',
        x.content !== x.savedContent || keepDraftIds.has(x.id),
        !!x.pinned,
        !!x.preview
      ])
    )
    .join('\n')
  const tabsMeta = useMemo(
    () =>
      tabs.map((x) => ({
        id: x.id,
        title: x.title,
        path: x.path,
        dirty: x.content !== x.savedContent || keepDraftIds.has(x.id),
        pinned: !!x.pinned,
        preview: !!x.preview
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabsStripKey]
  )
  // Split is "live" only when the right-pane tab exists and differs from the
  // active (left) one. Hidden on the welcome/home screen.
  const splitTab = useMemo(
    () => (splitId != null ? tabs.find((t) => t.id === splitId) || null : null),
    [tabs, splitId]
  )
  const split = !home && !!splitTab && splitId !== activeId
  const sourcePreviewTab = useMemo(
    () => (sourcePreviewId != null ? tabs.find((t) => t.id === sourcePreviewId) || null : null),
    [tabs, sourcePreviewId]
  )
  const sourceSplit =
    sourceSplitEnabled &&
    !home &&
    !!activeTab &&
    !isPlainTextDoc(activeTab) &&
    !!sourcePreviewTab &&
    !isPlainTextDoc(sourcePreviewTab) &&
    !milkdownForced.has(sourcePreviewTab.id)
  const layoutSplit = split || sourceSplit
  // Always-current activeId for callbacks that fire after a tab switch.
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  // Mirrors for stable event callbacks (tab strip, per-tab pane handlers): they
  // decide split/pane routing at event time without re-creating per render.
  const splitRef = useRef(split)
  splitRef.current = split
  const splitIdRef = useRef(splitId)
  splitIdRef.current = splitId
  const sourceSplitRef = useRef(sourceSplit)
  sourceSplitRef.current = sourceSplit
  const sourcePreviewIdRef = useRef(sourcePreviewId)
  sourcePreviewIdRef.current = sourcePreviewId
  const sourcePreviewPinnedRef = useRef(sourcePreviewPinned)
  sourcePreviewPinnedRef.current = sourcePreviewPinned
  const sourceOnLeftRef = useRef(sourceOnLeft)
  sourceOnLeftRef.current = sourceOnLeft
  const sourceScrollSyncRef = useRef(sourceScrollSync)
  sourceScrollSyncRef.current = sourceScrollSync
  const focusedPaneRef = useRef(focusedPane)
  focusedPaneRef.current = focusedPane

  // Always-current snapshot of tabs for use inside async callbacks / event
  // handlers that must not capture a stale `tabs` closure.
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const workspacesRef = useRef(workspaces)
  workspacesRef.current = workspaces

  // Set as soon as the user explicitly opens a file (a non-silent openPaths —
  // e.g. a double-clicked file at launch arriving via `open-paths`). Session
  // restore reads this to avoid clobbering that just-opened tab by forcing the
  // *previous* session's active tab back to the front. See the restore effect.
  const explicitOpenRef = useRef(false)

  // Drop editor APIs for tabs that have closed.
  useEffect(() => {
    const live = new Set(tabs.map((t) => t.id))
    for (const id of Object.keys(editorApis.current)) {
      if (!live.has(id)) delete editorApis.current[id]
    }
    // Forget mount records for closed tabs (so the Set doesn't grow unbounded).
    setMountedIds((prev) => {
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (live.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
    setRichForced((prev) => {
      if (!prev.size) return prev
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (live.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
    setMilkdownForced((prev) => {
      if (!prev.size) return prev
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (live.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
    const retainLiveIds = (prev) => {
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (live.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    }
    setSourceModeIds(retainLiveIds)
    setSourceMountedIds(retainLiveIds)
    setKeepDraftIds(retainLiveIds)
    setKeepHistoryState((prev) => {
      let changed = false
      const next = {}
      for (const [id, state] of Object.entries(prev)) {
        if (live.has(id)) next[id] = state
        else changed = true
      }
      return changed ? next : prev
    })
    const prunedHistory = pruneNavigationHistory(navigationHistoryRef.current, live)
    if (
      prunedHistory.back.length !== navigationHistoryRef.current.back.length ||
      prunedHistory.forward.length !== navigationHistoryRef.current.forward.length
    ) {
      navigationHistoryRef.current = prunedHistory
      setNavigationVersion((version) => version + 1)
    }
    for (const id of Object.keys(sourceBaselinesRef.current)) {
      if (!live.has(id)) delete sourceBaselinesRef.current[id]
    }
  }, [tabs])

  // Mark the active tab as mounted (and keep it mounted thereafter).
  useEffect(() => {
    if (activeId == null) return
    setMountedIds((prev) => (prev.has(activeId) ? prev : new Set(prev).add(activeId)))
  }, [activeId])

  useEffect(() => {
    if (!sourceSplitEnabled) return
    if (sourcePreviewPinned) {
      if (!sourcePreviewTab || isPlainTextDoc(sourcePreviewTab) || milkdownForced.has(sourcePreviewTab.id)) {
        setSourceSplitEnabled(false)
        setSourcePreviewPinned(false)
      }
      return
    }
    if (!activeTab || isPlainTextDoc(activeTab) || milkdownForced.has(activeTab.id)) {
      setSourceSplitEnabled(false)
      setSourcePreviewId(null)
      return
    }
    if (sourcePreviewId !== activeTab.id) setSourcePreviewId(activeTab.id)
  }, [
    activeTab,
    milkdownForced,
    sourcePreviewId,
    sourcePreviewPinned,
    sourcePreviewTab,
    sourceSplitEnabled
  ])

  useEffect(() => () => {
    clearTimeout(sourceSplitContentTimerRef.current)
    if (sourceSplitPreviewRafRef.current) cancelAnimationFrame(sourceSplitPreviewRafRef.current)
  }, [])

  useEffect(() => {
    if (!startupRestored) return
    if (activeTab?.loading) return
    const splash = document.getElementById('hm-boot-splash')
    if (!splash) return

    const holdMs =
      import.meta.env.DEV ? Math.max(0, Number(import.meta.env.VITE_BOOT_SPLASH_HOLD_MS) || 0) : 0
    let removeTimer = null
    const hideTimer = setTimeout(() => {
      splash.classList.add('is-hiding')
      removeTimer = setTimeout(() => splash.remove(), 240)
    }, holdMs)

    return () => {
      clearTimeout(hideTimer)
      clearTimeout(removeTimer)
    }
  }, [startupRestored, activeTab])

  // The right-pane tab must be mounted too (it's a second visible editor).
  useEffect(() => {
    if (splitId == null) return
    setMountedIds((prev) => (prev.has(splitId) ? prev : new Set(prev).add(splitId)))
  }, [splitId])

  // Drop the split when its tab is gone, or it collapsed onto the active tab
  // (e.g. the user clicked the right-pane's tab in the strip).
  useEffect(() => {
    if (splitId != null && (splitId === activeId || !tabs.some((t) => t.id === splitId))) {
      setSplitId(null)
    }
  }, [tabs, splitId, activeId])

  // Once there's no right pane, tab clicks must target the left pane again.
  useEffect(() => {
    if (splitId == null && focusedPane !== 'left') setFocusedPane('left')
  }, [splitId, focusedPane])

  // ----------------------------- theme / i18n -----------------------------
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Keep the native application menu in the UI language (desktop only; the
  // mobile shim has no native menus, hence the optional call).
  useEffect(() => {
    window.api.setAppLang?.(lang)
  }, [lang])

  // Push the spellcheck preference to the main process (Chromium spellchecker
  // lives in the session, not the DOM). Runs on mount too, since main starts
  // with it disabled.
  useEffect(() => {
    window.api.setSpellcheck?.(settings.spellcheck)
  }, [settings.spellcheck])

  // ----------------------------- settings ---------------------------------
  // Apply the editor page width live, and persist any settings change.
  useEffect(() => {
    applyPageWidth(settings.pageWidth)
  }, [settings.pageWidth])
  useEffect(() => {
    applyFontSize(settings.fontSize)
  }, [settings.fontSize])
  useEffect(() => {
    applyEditorFonts(
      settings.fontWriteEn,
      settings.fontWriteZh,
      settings.fontWriteJa,
      settings.fontMono
    )
  }, [settings.fontWriteEn, settings.fontWriteZh, settings.fontWriteJa, settings.fontMono])
  useEffect(() => {
    applyZoom(settings.zoom)
  }, [settings.zoom])
  useEffect(() => {
    applyLineHeight(settings.lineHeight)
  }, [settings.lineHeight])
  useEffect(() => {
    applyParagraphSpacing(settings.paragraphSpacing)
  }, [settings.paragraphSpacing])
  useEffect(() => {
    saveSettings(settings)
  }, [settings])
  // Merge a partial settings change (from the Settings modal).
  const updateSettings = useCallback((partial) => {
    setSettings((prev) => ({ ...prev, ...partial }))
  }, [])
  // Step the overall zoom by a delta, clamped/snapped. Functional update so the
  // keyboard/wheel handlers (mounted once) always read the latest zoom.
  const bumpZoom = useCallback((delta) => {
    setSettings((prev) => ({ ...prev, zoom: normalizeZoom((prev.zoom ?? DEFAULT_ZOOM) + delta) }))
  }, [])

  // Ctrl/Cmd + mouse wheel over the editor → zoom (Excel/browser convention).
  // The +/-/0 keys are the View-menu accelerators (handled via onMenu), so only
  // the wheel needs wiring here. Non-passive so we can cancel the native scroll.
  useEffect(() => {
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (!e.target.closest?.('.editor-area')) return
      e.preventDefault()
      bumpZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel, { passive: false })
  }, [bumpZoom])

  // ----------------------------- custom themes ----------------------------
  const refreshThemes = useCallback(() => {
    window.api.themesList?.().then(setCustomThemes).catch(() => {})
  }, [])
  useEffect(() => {
    refreshThemes()
  }, [refreshThemes])
  // Inject the selected custom theme's CSS (or clear it). If its file vanished,
  // fall back to no custom theme.
  useEffect(() => {
    if (!customTheme) {
      applyCustomTheme(null)
      return
    }
    let alive = true
    window.api
      .themeRead(customTheme)
      .then((css) => alive && applyCustomTheme(css))
      .catch(() => {
        if (!alive) return
        applyCustomTheme(null)
        setCustomTheme(null)
      })
    return () => {
      alive = false
    }
  }, [customTheme])
  // Picking a built-in theme clears any custom overlay; picking a custom one
  // keeps the built-in as the base (chrome + light/dark).
  const pickBuiltinTheme = useCallback((id) => {
    setTheme(id)
    setCustomTheme(null)
  }, [])

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang])
  // Always-current translator for stable callbacks (e.g. openPaths) that must
  // not be recreated on every language change.
  const tRef = useRef(t)
  tRef.current = t
  const hasUnsavedTab = useCallback(
    (tab) => !!tab && (tab.content !== tab.savedContent || keepDraftIdsRef.current.has(tab.id)),
    []
  )
  const promotePreviewTab = useCallback((id) => {
    const next = promotePreviewTabInList(tabsRef.current, id)
    if (next === tabsRef.current) return false
    tabsRef.current = next
    setTabs(next)
    return true
  }, [])
  const guardKeepDraft = useCallback((id) => {
    if (!id || !keepDraftIdsRef.current.has(id)) return true
    editorApis.current[id]?.focusDraft?.()
    fireToast(tRef.current('keep.finishDraft'), { sticky: true })
    return false
  }, [])
  const openMarkdownOverrides = useCallback(() =>
    tabsRef.current
      .filter((tab) => tab.path && MD_DOC_RE.test(tab.path) && !tab.loading)
      .map((tab) => ({ path: tab.path, content: tab.content })), [])

  const diagnoseLinksForTab = useCallback(async (tab) => {
    const generation = ++linkDiagnosisGenerationRef.current
    if (!tab?.path || !MD_DOC_RE.test(tab.path)) {
      setLinkPanel((prev) => ({
        ...prev,
        enabled: true,
        problemTabId: tab?.id || null,
        docPath: '',
        problems: [],
        diagnosing: false
      }))
      return []
    }
    setLinkPanel((prev) => ({
      ...prev,
      enabled: true,
      problemTabId: tab.id,
      docPath: tab.path,
      diagnosing: true
    }))
    try {
      const result = await window.api.diagnoseMarkdownLinks?.({
        docPath: tab.path,
        content: tab.content
      })
      if (generation !== linkDiagnosisGenerationRef.current) return []
      const problems = result?.problems || []
      setLinkPanel((prev) => ({
        ...prev,
        problemTabId: tab.id,
        docPath: tab.path,
        problems,
        diagnosing: false
      }))
      return problems
    } catch (error) {
      if (generation !== linkDiagnosisGenerationRef.current) return []
      setLinkPanel((prev) => ({ ...prev, diagnosing: false, problems: [] }))
      fireToast(tRef.current('links.checkFailed', { msg: error?.message || error }), {
        kind: 'error',
        sticky: true
      })
      return []
    }
  }, [])

  const openProblemsPanel = useCallback(() => {
    const tab = tabsRef.current.find((item) => item.id === activeIdRef.current)
    setSidebarMode('links')
    setSidebarOpen(true)
    setLinkPanel((prev) => ({ ...prev, enabled: true, view: 'problems' }))
    diagnoseLinksForTab(tab)
  }, [diagnoseLinksForTab])

  useEffect(() => {
    if (!linkPanel.enabled) return
    clearTimeout(linkDiagnosisTimerRef.current)
    const tab = tabsRef.current.find((item) => item.id === activeId)
    linkDiagnosisTimerRef.current = setTimeout(() => diagnoseLinksForTab(tab), 650)
    return () => clearTimeout(linkDiagnosisTimerRef.current)
  }, [activeId, activeTab?.path, activeTab?.content, linkPanel.enabled, diagnoseLinksForTab])

  const currentReferenceContext = useCallback(() => {
    const id = activeIdRef.current
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!tab) return null
    const sourceApi = sourceRef.current?.__hmSourceApi
    if (sourceApi && (sourceModeRef.current || sourceSplitRef.current)) {
      const selection = sourceApi.getFullSelection?.()
      return markdownContextAtOffset(tab.content, selection?.end ?? sourceApi.getViewportOffset?.())
    }
    const api = editorApis.current[id]
    const keepContext = api?.getReferenceContext?.()
    if (keepContext) return keepContext
    const offset =
      api?.markdownOffsetFromSelection?.() ??
      api?.navigationOffsetFromViewportTop?.() ??
      api?.markdownOffsetFromViewportTop?.()
    return markdownContextAtOffset(tab.content, offset)
  }, [])

  const findMarkdownReferencesForContext = useCallback(async (context = null) => {
    const tab = tabsRef.current.find((item) => item.id === activeIdRef.current)
    const actualContext = context || currentReferenceContext()
    const target = resolveReferenceTarget(tab, actualContext)
    if (!target?.targetPath) {
      fireToast(tRef.current('links.noReferenceTarget'), { sticky: true })
      return
    }
    const generation = ++linkReferenceGenerationRef.current
    setSidebarMode('links')
    setSidebarOpen(true)
    setLinkPanel((prev) => ({
      ...prev,
      enabled: true,
      view: 'references',
      referencesRunning: true,
      referenceGroups: [],
      referenceLabel: target.label,
      filesScanned: 0,
      truncated: false
    }))
    try {
      const result = await window.api.findMarkdownReferences?.({
        roots: workspacesRef.current.map((workspace) => workspace.rootPath),
        targetPath: target.targetPath,
        anchor: target.anchor,
        overrides: openMarkdownOverrides(),
        showHidden: settings.showHiddenFiles
      })
      if (generation !== linkReferenceGenerationRef.current) return
      setLinkPanel((prev) => ({
        ...prev,
        referencesRunning: false,
        referenceGroups: result?.groups || [],
        referenceLabel: target.label,
        filesScanned: result?.filesScanned || 0,
        truncated: !!result?.truncated
      }))
    } catch (error) {
      if (generation !== linkReferenceGenerationRef.current) return
      setLinkPanel((prev) => ({ ...prev, referencesRunning: false, referenceGroups: [] }))
      fireToast(tRef.current('links.searchFailed', { msg: error?.message || error }), {
        kind: 'error',
        sticky: true
      })
    }
  }, [currentReferenceContext, openMarkdownOverrides, settings.showHiddenFiles])
  findCurrentReferencesRef.current = findMarkdownReferencesForContext

  const beginHeadingRename = useCallback((context = null) => {
    const tab = tabsRef.current.find((item) => item.id === activeIdRef.current)
    const actual = context || currentReferenceContext()
    if (!tab?.path || !actual || (actual.type && actual.type !== 'heading')) {
      fireToast(tRef.current('links.noHeading'), { sticky: true })
      return
    }
    if (hasUnsavedTab(tab)) {
      fireToast(tRef.current('links.saveBeforeRename'), { sticky: true })
      return
    }
    setHeadingRenameState({
      tabId: tab.id,
      path: tab.path,
      line: actual.line,
      value: String(actual.text || '').replace(/\s*\{#[^}]+\}\s*$/, '').trim()
    })
  }, [currentReferenceContext, hasUnsavedTab])
  beginHeadingRenameRef.current = beginHeadingRename

  const syncAppliedMarkdownFiles = useCallback((files, aliases = []) => {
    const normalized = new Map(
      (files || []).map((file) => [String(file.path || '').replace(/\\/g, '/').toLowerCase(), file])
    )
    for (const alias of aliases) {
      const file = normalized.get(String(alias.to || '').replace(/\\/g, '/').toLowerCase())
      if (file) normalized.set(String(alias.from || '').replace(/\\/g, '/').toLowerCase(), file)
    }
    if (!normalized.size) return
    const reloadIds = new Set()
    for (const tab of tabsRef.current) {
      const file = normalized.get(String(tab.path || '').replace(/\\/g, '/').toLowerCase())
      if (!file) continue
      const synced = editorApis.current[tab.id]?.syncMarkdown?.(file.content)
      if (!synced && milkdownForcedRef.current.has(tab.id)) reloadIds.add(tab.id)
    }
    setTabs((prev) => prev.map((tab) => {
      const file = normalized.get(String(tab.path || '').replace(/\\/g, '/').toLowerCase())
      if (!file) return tab
      return {
        ...tab,
        content: file.content,
        savedContent: file.content,
        mtimeMs: file.mtimeMs,
        reloadNonce: reloadIds.has(tab.id) ? tab.reloadNonce + 1 : tab.reloadNonce,
        heavy: isHeavyDoc(file.content)
      }
    }))
  }, [])

  const dirtyPlanPaths = useCallback((plan) => {
    const changed = new Set(
      (plan?.files || []).map((file) => String(file.path || '').replace(/\\/g, '/').toLowerCase())
    )
    return tabsRef.current
      .filter((tab) =>
        changed.has(String(tab.path || '').replace(/\\/g, '/').toLowerCase()) &&
        hasUnsavedTab(tab)
      )
      .map((tab) => tab.path)
  }, [hasUnsavedTab])

  const commitHeadingRename = useCallback(async (rawName) => {
    const state = headingRenameState
    setHeadingRenameState(null)
    const newHeading = String(rawName || '').trim()
    if (!state || !newHeading || newHeading === state.value) return
    try {
      const plan = await window.api.planHeadingRename?.({
        roots: workspacesRef.current.map((workspace) => workspace.rootPath),
        targetPath: state.path,
        line: state.line,
        newHeading,
        showHidden: settings.showHiddenFiles
      })
      if (plan?.error) throw new Error(tRef.current('links.invalidHeading'))
      setLinkUpdateState({
        kind: 'heading',
        plan,
        busy: false,
        dirtyPaths: dirtyPlanPaths(plan)
      })
    } catch (error) {
      fireToast(tRef.current('links.planFailed', { msg: error?.message || error }), {
        kind: 'error',
        sticky: true
      })
    }
  }, [dirtyPlanPaths, headingRenameState, settings.showHiddenFiles])

  const stepMarkdownProblem = useCallback(async (previous = false) => {
    const tab = tabsRef.current.find((item) => item.id === activeIdRef.current)
    if (!tab) return
    let problems =
      linkPanelRef.current.problemTabId === tab.id
        ? linkPanelRef.current.problems
        : []
    if (!problems.length) problems = await diagnoseLinksForTab(tab)
    if (!problems.length) {
      fireToast(tRef.current('links.noProblems'))
      return
    }
    const current = problemCursorRef.current.get(tab.id) ?? (previous ? 0 : -1)
    const next = (current + (previous ? -1 : 1) + problems.length) % problems.length
    problemCursorRef.current.set(tab.id, next)
    jumpToTabLineRef.current(tab.id, problems[next].line)
    fireToast(tRef.current('links.problemPosition', { n: next + 1, m: problems.length }))
  }, [diagnoseLinksForTab])
  stepProblemRef.current = stepMarkdownProblem

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'F8') {
        event.preventDefault()
        event.stopPropagation()
        stepProblemRef.current(!!event.shiftKey)
        return
      }
      if (event.key !== 'F2' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.target?.closest?.('table.km-table, .tree, .hm-rename-modal, .hm-review')) return
      event.preventDefault()
      event.stopPropagation()
      beginHeadingRenameRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
  const captureNavigationLocation = useCallback(() => {
    const pane = layoutSplit ? focusedPaneRef.current : 'left'
    const dualSourceSide = sourceOnLeftRef.current ? 'left' : 'right'
    const inDualSource = sourceSplitRef.current && pane === dualSourceSide
    const tabId = sourceSplitRef.current
      ? inDualSource ? activeIdRef.current : sourcePreviewIdRef.current
      : pane === 'right' ? splitIdRef.current : activeIdRef.current
    if (!tabId || !tabsRef.current.some((tab) => tab.id === tabId)) return null
    const inSource = inDualSource || (pane === 'left' && sourceModeIdsRef.current.has(tabId))
    const sourceApi = inSource ? sourceRef.current?.__hmSourceApi : null
    const previewApi = !inSource ? editorApis.current[tabId] : null
    const rawOffset = inSource
      ? sourceApi?.getViewportOffset?.()
      : previewApi?.navigationOffsetFromViewportTop?.() ??
        previewApi?.markdownOffsetFromViewportTop?.()
    const context = inSource
      ? { sourceSelection: sourceApi?.getFullSelection?.() }
      : previewApi?.captureNavigationContext?.()
    return {
      tabId,
      rawOffset: Number.isFinite(rawOffset) ? rawOffset : 0,
      sourceMode: inSource,
      pane,
      context
    }
  }, [layoutSplit])
  const rememberNavigation = useCallback(() => {
    const location = captureNavigationLocation()
    if (!location) return false
    navigationHistoryRef.current = recordNavigationLocation(
      navigationHistoryRef.current,
      location
    )
    setNavigationVersion((version) => version + 1)
    return true
  }, [captureNavigationLocation])
  rememberNavigationRef.current = rememberNavigation

  const restoreNavigationLocation = useCallback((location) => {
    if (!location?.tabId || !tabsRef.current.some((tab) => tab.id === location.tabId)) return false
    setHome(false)
    const restoreRight =
      location.pane === 'right' &&
      !location.sourceMode &&
      !!activeIdRef.current &&
      activeIdRef.current !== location.tabId
    setFocusedPane(restoreRight ? 'right' : 'left')
    focusedTabRef.current = location.tabId
    if (location.sourceMode) {
      pendingSourceRestoreRef.current = {
        id: location.tabId,
        rawOffset: location.rawOffset,
        follow: false,
        selectLine: false,
        context: location.context
      }
      setSourceMountedIds((prev) => prev.has(location.tabId) ? prev : new Set(prev).add(location.tabId))
      setSourceModeIds((prev) => new Set(prev).add(location.tabId))
    } else {
      pendingPreviewRestoreRef.current = {
        id: location.tabId,
        rawOffset: location.rawOffset,
        follow: false,
        context: location.context
      }
      setSourceModeIds((prev) => {
        if (!prev.has(location.tabId)) return prev
        const next = new Set(prev)
        next.delete(location.tabId)
        return next
      })
    }
    if (restoreRight) setSplitId(location.tabId)
    else setActiveId(location.tabId)
    // A same-tab jump does not change the activeId/sourceMode effect dependencies,
    // so also apply directly. Retries cover a different tab/view mounting.
    const apply = () => {
      const visible =
        activeIdRef.current === location.tabId ||
        (splitIdRef.current === location.tabId && !location.sourceMode)
      if (!visible) return
      if (location.sourceMode) {
        const api = sourceRef.current?.__hmSourceApi
        api?.scrollToOffset?.(location.rawOffset, {
          align: 'top',
          placeCaret: false,
          focus: false
        })
        if (location.context?.sourceSelection) {
          api?.restoreFullSelection?.(location.context.sourceSelection, { focus: false })
        }
      } else {
        const api = editorApis.current[location.tabId]
        api?.restoreNavigationContext?.(location.context)
        api?.restoreMarkdownOffset?.(location.rawOffset, false)
        api?.restoreNavigationContext?.(location.context)
      }
    }
    requestAnimationFrame(apply)
    setTimeout(apply, 90)
    setTimeout(apply, 220)
    setTimeout(apply, 500)
    return true
  }, [])

  const navigateHistory = useCallback((direction) => {
    const valid = new Set(tabsRef.current.map((tab) => tab.id))
    const pruned = pruneNavigationHistory(navigationHistoryRef.current, valid)
    const result = stepNavigationHistory(pruned, captureNavigationLocation(), direction)
    navigationHistoryRef.current = result.state
    setNavigationVersion((version) => version + 1)
    if (!result.target) return false
    cancelNavigationEffectsRef.current()
    return restoreNavigationLocation(result.target)
  }, [captureNavigationLocation, restoreNavigationLocation])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (navigateHistory(e.key === 'ArrowLeft' ? 'back' : 'forward')) e.preventDefault()
    }
    const onMouseUp = (e) => {
      if (e.button !== 3 && e.button !== 4) return
      if (navigateHistory(e.button === 3 ? 'back' : 'forward')) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mouseup', onMouseUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mouseup', onMouseUp, true)
    }
  }, [navigateHistory])
  const cycleTheme = useCallback(() => {
    setTheme((cur) => {
      const i = THEMES.findIndex((x) => x.id === cur)
      return THEMES[(i + 1) % THEMES.length].id
    })
    setCustomTheme(null)
  }, [])

  // Toggle source/preview mode without unmounting either editor. Transfer a
  // Markdown offset (caret when visible, otherwise the top visible block) so the
  // two differently-shaped DOM trees still land on the same source structure.
  const toggleSource = useCallback(() => {
    const id = activeIdRef.current
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!id || !tab || isPlainTextDoc(tab)) return
    if (!guardKeepDraft(id)) return

    if (sourceModeRef.current) {
      const source = sourceRef.current
      const sourceApi = source?.__hmSourceApi
      const markdown = sourceApi?.getFullValue?.() ?? source?.value ?? tab.content
      const baseline = sourceBaselinesRef.current[id]
      const interaction = sourceApi?.getInteractionState?.() || { revision: 0, kind: 'none' }
      const contentChanged = !baseline || markdown !== baseline.value
      const positionChanged = !baseline || interaction.revision !== baseline.revision
      const selection = sourceApi?.getFullSelection?.()
      const followCaret =
        positionChanged &&
        (interaction.kind === 'edit' || interaction.kind === 'selection') &&
        sourceApi?.isSelectionVisible?.()
      const rawOffset = followCaret ? selection?.end : sourceApi?.getViewportOffset?.()

      if (contentChanged) {
        const api = editorApis.current[id]
        if (!api?.replaceMarkdown?.(markdown)) {
          setTabs((prev) => prev.map((item) =>
            item.id === id
              ? { ...item, reloadNonce: item.reloadNonce + 1, heavy: isHeavyDoc(markdown) }
              : item
          ))
        }
      }
      pendingPreviewRestoreRef.current =
        (contentChanged || positionChanged) && Number.isFinite(rawOffset)
          ? { id, rawOffset, follow: !!followCaret }
          : null
      setSourceModeIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } else {
      const api = editorApis.current[id]
      const followCaret = !!api?.isSelectionVisible?.()
      const caretOffset = followCaret ? api?.markdownOffsetFromSelection?.() : null
      const viewportOffset = api?.markdownOffsetFromViewportTop?.()
      pendingSourceRestoreRef.current = {
        id,
        rawOffset: Number.isFinite(caretOffset) ? caretOffset : (Number.isFinite(viewportOffset) ? viewportOffset : 0),
        follow: Number.isFinite(caretOffset) && followCaret,
        selectLine: false
      }
      setSourceMountedIds((prev) => prev.has(id) ? prev : new Set(prev).add(id))
      setSourceModeIds((prev) => new Set(prev).add(id))
    }
  }, [guardKeepDraft])

  const closeSourceSplit = useCallback(() => {
    const id = activeIdRef.current
    const previewId = sourcePreviewIdRef.current
    if (id && previewId === id) {
      const tab = tabsRef.current.find((item) => item.id === id)
      const sourceApi = sourceRef.current?.__hmSourceApi
      const rawOffset = sourceApi?.getViewportOffset?.()
      editorApis.current[id]?.syncMarkdown?.(tab?.content ?? sourceApi?.getFullValue?.() ?? '')
      if (Number.isFinite(rawOffset)) {
        pendingPreviewRestoreRef.current = { id, rawOffset, follow: false }
      }
    }
    if (previewId) editorApis.current[previewId]?.highlightMarkdownOffset?.(null)
    setSourceSplitEnabled(false)
    setSourcePreviewPinned(false)
    setSourcePreviewId(null)
    setFocusedPane('left')
  }, [])

  const toggleSourceSplit = useCallback(() => {
    if (sourceSplitRef.current) {
      closeSourceSplit()
      return
    }
    const id = activeIdRef.current
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!id || !tab || isPlainTextDoc(tab)) return
    if (!guardKeepDraft(id)) return
    if (milkdownForcedRef.current.has(id)) {
      fireToast(tRef.current('sourceSplit.keepRequired'))
      return
    }
    const api = editorApis.current[id]
    const caretOffset = api?.markdownOffsetFromSelection?.()
    const viewportOffset = api?.markdownOffsetFromViewportTop?.()
    pendingSourceRestoreRef.current = {
      id,
      rawOffset: Number.isFinite(caretOffset)
        ? caretOffset
        : Number.isFinite(viewportOffset)
          ? viewportOffset
          : 0,
      follow: Number.isFinite(caretOffset),
      selectLine: false
    }
    setSplitId(null)
    setSourceMountedIds((prev) => prev.has(id) ? prev : new Set(prev).add(id))
    setSourceModeIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setSourcePreviewId(id)
    setSourcePreviewPinned(false)
    setSourceSplitEnabled(true)
    setFocusedPane(sourceOnLeftRef.current ? 'left' : 'right')
  }, [closeSourceSplit, guardKeepDraft])

  const syncSourceSplitViewport = useCallback((side, id, rawOffset) => {
    if (
      !sourceSplitRef.current ||
      !sourceScrollSyncRef.current ||
      sourcePreviewIdRef.current !== activeIdRef.current ||
      id !== activeIdRef.current ||
      !Number.isFinite(rawOffset)
    ) return
    const now = performance.now()
    const lock = sourceSplitScrollLockRef.current
    if (lock.side === side && now < lock.until) return
    if (side === 'source') {
      sourceSplitScrollLockRef.current = { side: 'preview', until: now + 220 }
      editorApis.current[id]?.restoreMarkdownOffset?.(rawOffset, false)
    } else {
      sourceSplitScrollLockRef.current = { side: 'source', until: now + 220 }
      sourceRef.current?.__hmSourceApi?.scrollToOffset?.(rawOffset, { align: 'top' })
    }
  }, [])

  const locateSourceFromPreview = useCallback((id, lineIdx) => {
    if (!sourceSplitRef.current || !Number.isFinite(lineIdx)) return
    const activate = id !== activeIdRef.current
    if (activate) {
      setActiveId(id)
      setSourcePreviewId(id)
    }
    const apply = () => {
      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab) return
      sourceRef.current?.__hmSourceApi?.scrollToOffset?.(
        lineStartOffset(tab.content, Math.max(0, lineIdx)),
        { align: 'center', selectLine: true, focus: true, userNavigation: true }
      )
    }
    requestAnimationFrame(apply)
    setTimeout(apply, activate ? 120 : 0)
  }, [])

  // From keep mode's "open source here": enable source mode for this tab and
  // remember the 0-based source line to select once the textarea is visible.
  const openSourceAtLine = useCallback((lineIdx) => {
    const id = activeIdRef.current
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!id || !tab) return
    if (!guardKeepDraft(id)) return
    const line = Number.isFinite(lineIdx) ? Math.max(0, lineIdx) : 0
    pendingSourceRestoreRef.current = {
      id,
      rawOffset: lineStartOffset(tab.content, line),
      follow: true,
      selectLine: true
    }
    setSourceMountedIds((prev) => prev.has(id) ? prev : new Set(prev).add(id))
    setSourceModeIds((prev) => new Set(prev).add(id))
  }, [guardKeepDraft])

  const applyEditorMode = useCallback((id, toMilkdown) => {
    promotePreviewTab(id)
    if (toMilkdown) keepToMilkdownInitRef.current.add(id)
    else keepToMilkdownInitRef.current.delete(id)
    setMilkdownForced((prev) => {
      const next = new Set(prev)
      if (toMilkdown) next.add(id)
      else next.delete(id)
      return next
    })
  }, [promotePreviewTab])

  const requestEditorMode = useCallback((toMilkdown) => {
    const id = activeIdRef.current
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab || isPlainTextDoc(tab)) return false
    if (!guardKeepDraft(id)) return false
    if (milkdownForcedRef.current.has(id) === toMilkdown) return true
    if (tab.content !== tab.savedContent) {
      setModeSwitchSaving(false)
      setModeSwitchState({ id, direction: toMilkdown ? 'toMilkdown' : 'toKeep' })
      return true
    }
    applyEditorMode(id, toMilkdown)
    return true
  }, [applyEditorMode, guardKeepDraft])

  // Switch the active Markdown tab between keep mode (source-backed, default) and
  // the Milkdown WYSIWYG editor. Dirty transitions go through the project-styled
  // warning instead of a native confirm. A heavy doc CAN be toggled — it just
  // lands in the safe plain-source + "load rich" banner path first.
  const toggleEditorMode = useCallback(() => {
    const id = activeIdRef.current
    const toMilkdown = !milkdownForcedRef.current.has(id)
    if (sourceSplitRef.current && toMilkdown) closeSourceSplit()
    requestEditorMode(toMilkdown)
  }, [closeSourceSplit, requestEditorMode])

  const selectViewMode = useCallback((mode) => {
    const id = activeIdRef.current
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!id || !tab || isPlainTextDoc(tab)) return
    if (mode === 'richSource') {
      if (sourceSplitRef.current) return
      if (sourceModeRef.current) toggleSource()
      if (milkdownForcedRef.current.has(id)) {
        fireToast(tRef.current('sourceSplit.keepRequired'))
        return
      }
      setTimeout(() => toggleSourceSplit(), sourceModeRef.current ? 80 : 0)
      return
    }
    if (sourceSplitRef.current) closeSourceSplit()
    if (mode === 'source') {
      if (!sourceModeRef.current) setTimeout(() => toggleSource(), sourceSplitRef.current ? 80 : 0)
      return
    }
    if (sourceModeRef.current) toggleSource()
  }, [closeSourceSplit, toggleSource, toggleSourceSplit])

  useLayoutEffect(() => {
    if (!sourceMode && !sourceSplit) return
    const pending = pendingSourceRestoreRef.current
    if (!pending || pending.id !== activeId) return
    let applied = false
    const apply = () => {
      if (applied) return
      const source = sourceRef.current
      const api = source?.__hmSourceApi
      if (!api) return
      api.scrollToOffset?.(pending.rawOffset, {
        align: pending.follow ? 'center' : 'top',
        placeCaret: pending.follow && !pending.selectLine,
        selectLine: pending.selectLine,
        focus: pending.follow && !findOpenRef.current
      })
      if (pending.context?.sourceSelection) {
        api.restoreFullSelection?.(pending.context.sourceSelection, { focus: false })
      }
      const interaction = api.getInteractionState?.() || { revision: 0 }
      sourceBaselinesRef.current[pending.id] = {
        value: api.getFullValue?.() ?? source.value,
        revision: interaction.revision
      }
      pendingSourceRestoreRef.current = null
      applied = true
    }
    // Apply immediately, then retry while the newly-visible textarea settles.
    const raf = requestAnimationFrame(apply)
    const t1 = setTimeout(apply, 90)
    const t2 = setTimeout(apply, 220)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [activeId, sourceMode, sourceSplit])

  // Restore the preview position after leaving source mode. The preview stays
  // mounted, but a short retry covers layout work after it becomes visible.
  useEffect(() => {
    if (sourceMode || sourceSplit) return
    const pending = pendingPreviewRestoreRef.current
    if (!pending || (pending.id !== activeId && pending.id !== splitId)) return
    const apply = () => {
      const api = editorApis.current[pending.id]
      api?.restoreNavigationContext?.(pending.context)
      if (!api?.restoreMarkdownOffset?.(pending.rawOffset, pending.follow)) return
      api.restoreNavigationContext?.(pending.context)
      pendingPreviewRestoreRef.current = null
    }
    const raf = requestAnimationFrame(apply)
    const t1 = setTimeout(apply, 90)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
    }
  }, [activeId, sourceMode, sourceSplit, splitId])

  // --------------------------- open files --------------------------
  // Read a session-restore PLACEHOLDER tab's file from disk and fill its content
  // (bumping reloadNonce so a placeholder that already mounted empty re-reads it).
  // Restored tabs start as empty `loading` placeholders and are filled lazily —
  // on activation (the effect below) or when openPaths/export touches them — so a
  // restart with many tabs reads only the file(s) you actually look at, never all
  // N up front. A file that went missing since last session is dropped quietly,
  // matching the old restore. No-op if the tab is already loaded or gone.
  const fillTab = useCallback(async (id) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab || !tab.loading) return
    try {
      const { content, mtimeMs } = await window.api.readFile(tab.path)
      const patch = (t) =>
        t.id === id
          ? {
              ...t,
              content,
              savedContent: content,
              mtimeMs,
              heavy: isHeavyDoc(content),
              loading: false,
              reloadNonce: t.reloadNonce + 1
            }
          : t
      tabsRef.current = tabsRef.current.map(patch)
      setTabs((prev) => prev.map(patch))
    } catch {
      const norm = (tab.path || '').replace(/\\/g, '/')
      tabsRef.current = tabsRef.current.filter((t) => t.id !== id)
      setTabs((prev) => prev.filter((t) => t.id !== id))
      setRecents((prev) => removeRecentPath(prev, norm))
    }
  }, [])

  const focusSidebarForOpenedPath = useCallback((path) => {
    if (!path || !MD_DOC_RE.test(path)) return
    setSidebarOpen(true)
    setSidebarMode(pathInWorkspace(path, workspacesRef.current) ? 'files' : 'outline')
  }, [])

  const openPaths = useCallback(async (paths, silent = false, options = {}) => {
    if (!paths || !paths.length) return null
    const wantsPreview = !silent && !!options.preview && paths.length === 1
    // An explicit open (anything but the silent session restore) means the user
    // wants *this* file in front — record it synchronously so the restore effect
    // won't activate the previous session's tab on top of it.
    if (!silent) explicitOpenRef.current = true
    let lastId = null
    let lastPath = null
    const seen = new Set()
    const remember = (fp) => {
      setRecents((prev) =>
        rememberRecent(prev, { path: fp, name: baseName(fp), dir: dirName(fp), openedAt: Date.now() })
      )
    }
    for (const path of paths) {
      const norm = path.replace(/\\/g, '/')
      if (seen.has(norm)) continue // dedupe within this call
      seen.add(norm)
      // Synchronous check against the live tab list (no setState race).
      const existing = tabsRef.current.find((t) => (t.path || '').replace(/\\/g, '/') === norm)
      if (existing) {
        // A lazy restore placeholder counts as "already open" but has no content
        // yet — load it now so callers that read it next (PDF export, the editor)
        // see the real document, not an empty buffer.
        if (existing.loading) await fillTab(existing.id)
        if (!wantsPreview && existing.preview) promotePreviewTab(existing.id)
        lastId = existing.id
        lastPath = path
        remember(path)
        continue
      }
      try {
        const { content, mtimeMs } = await window.api.readFile(path)
        // Re-check after the await in case a concurrent open added this path.
        const concurrent = tabsRef.current.find((t) => (t.path || '').replace(/\\/g, '/') === norm)
        if (concurrent) {
          if (!wantsPreview && concurrent.preview) promotePreviewTab(concurrent.id)
          lastId = concurrent.id
          lastPath = path
          remember(path)
          continue
        }
        const id = genId()
        lastId = id
        const newTab = {
          id,
          path,
          title: baseName(path),
          content,
          savedContent: content,
          mtimeMs,
          reloadNonce: 0,
          heavy: isHeavyDoc(content),
          preview: wantsPreview
        }
        if (wantsPreview) {
          const currentPreview = tabsRef.current.find((tab) => tab.preview)
          const previewProtected =
            currentPreview &&
            (
              hasUnsavedTab(currentPreview) ||
              currentPreview.id === splitIdRef.current ||
              (
                sourcePreviewPinnedRef.current &&
                currentPreview.id === sourcePreviewIdRef.current
              )
            )
          if (previewProtected) promotePreviewTab(currentPreview.id)
          const result = openPreviewTabInList(tabsRef.current, newTab)
          tabsRef.current = result.tabs
          setTabs(result.tabs)
        } else {
          tabsRef.current = [...tabsRef.current, newTab] // keep snapshot current for the next iteration
          setTabs(tabsRef.current)
        }
        lastPath = path
        remember(path)
      } catch (e) {
        // File was moved/deleted (e.g. a stale "recent" entry). Drop it from the
        // recents list so the dead link disappears, and show a friendly message
        // instead of the raw IPC error.
        const missing = e?.message?.includes('ENOENT')
        setRecents((prev) => removeRecentPath(prev, norm))
        // Startup restore skips missing files quietly; an explicit open (clicking
        // a Recent, File > Open) still tells the user what happened.
        if (!silent) {
          window.alert(
            tRef.current(missing ? 'error.fileMissing' : 'error.openFailed', { name: baseName(path) })
          )
        }
      }
    }
    if (lastId) {
      setActiveId(lastId)
      setHome(false)
      if (!silent && options.followSidebar) focusSidebarForOpenedPath(lastPath)
    }
    return lastId
  }, [fillTab, focusSidebarForOpenedPath, hasUnsavedTab, promotePreviewTab])

  const newTab = useCallback(() => {
    const id = genId()
    setTabs((prev) => [
      ...prev,
      { id, path: null, title: t('tab.untitled'), content: '', savedContent: '', mtimeMs: null, reloadNonce: 0 }
    ])
    // New (untitled) markdown opens in Milkdown WYSIWYG; opened files default to
    // the source-backed keep editor. Keyed by tab id so it survives a later save
    // (path change) without flipping the editor mid-edit.
    setMilkdownForced((prev) => new Set(prev).add(id))
    setActiveId(id)
    setHome(false)
  }, [t])

  const updateContent = useCallback((id, md, isInitial) => {
    const preserveSavedBaseline = isInitial && keepToMilkdownInitRef.current.delete(id)
    if (!isInitial) promotePreviewTab(id)
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        if (isInitial) {
          // Keep → Milkdown: keep the actual on-disk baseline so any Crepe
          // normalization becomes an honest dirty diff instead of being silently
          // marked as saved during initialization.
          if (preserveSavedBaseline) return { ...t, content: md }
          // Rebaseline a clean doc against Crepe's normalized output; keep the
          // existing baseline if the doc already had unsaved edits. This path is
          // for tabs born in Milkdown (new scratch / onboarding), not mode switches.
          if (t.content === t.savedContent) return { ...t, content: md, savedContent: md }
          return { ...t, content: md }
        }
        return { ...t, content: md }
      })
    )
    if (!isInitial) refreshFindAfterEditRef.current(id)
  }, [promotePreviewTab])

  // Per-tab stable handlers for the (memoized) editor panes. Inline lambdas in
  // the editor-area map would give every mounted editor fresh props each App
  // render — i.e. on every keystroke — defeating their memo(). Cached by tab id;
  // everything they close over is a ref or a stable setter/callback.
  const tabHandlersRef = useRef(new Map())
  const getTabHandlers = (id) => {
    let h = tabHandlersRef.current.get(id)
    if (!h) {
      const focusPane = (view) => {
        focusedTabRef.current = id
        if (sourceSplitRef.current) {
          const sourceSide = sourceOnLeftRef.current ? 'left' : 'right'
          setFocusedPane(view === 'source' ? sourceSide : sourceSide === 'left' ? 'right' : 'left')
        } else if (splitRef.current) {
          setFocusedPane(id === splitIdRef.current ? 'right' : 'left')
        }
      }
      h = {
        onChange: (md, isInitial) => updateContent(id, md, isInitial),
        onSourceChange: (e) => {
          const markdown = e.target.value
          if (
            sourceSplitRef.current &&
            sourcePreviewIdRef.current === id &&
            keepDraftIdsRef.current.has(id)
          ) {
            fireToast(tRef.current('keep.finishDraft'))
            return
          }
          updateContent(id, markdown, false)
          if (sourceSplitRef.current && sourcePreviewIdRef.current === id) {
            clearTimeout(sourceSplitContentTimerRef.current)
            sourceSplitContentTimerRef.current = setTimeout(() => {
              editorApis.current[id]?.syncMarkdown?.(markdown)
            }, 140)
          }
        },
        onSourceViewportChange: (rawOffset) => syncSourceSplitViewport('source', id, rawOffset),
        onSourceSelectionChange: (rawOffset) => {
          if (sourceSplitRef.current && sourcePreviewIdRef.current === id) {
            editorApis.current[id]?.highlightMarkdownOffset?.(rawOffset)
          }
        },
        onPreviewScroll: (e) => {
          if (
            e.target !== e.currentTarget ||
            !sourceSplitRef.current ||
            sourcePreviewIdRef.current !== id ||
            sourceSplitPreviewRafRef.current
          ) return
          sourceSplitPreviewRafRef.current = requestAnimationFrame(() => {
            sourceSplitPreviewRafRef.current = 0
            const rawOffset = editorApis.current[id]?.navigationOffsetFromViewportTop?.()
            syncSourceSplitViewport('preview', id, rawOffset)
          })
        },
        onReady: (api) => {
          editorApis.current[id] = api
        },
        onFilterChange: (info) =>
          setKeepFilters((m) => {
            if (!info && !(id in m)) return m
            return { ...m, [id]: info }
          }),
        onDraftChange: (active) =>
          setKeepDraftIds((prev) => {
            if (!!active === prev.has(id)) return prev
            const next = new Set(prev)
            if (active) next.add(id)
            else next.delete(id)
            return next
          }),
        onHistoryChange: (state) =>
          setKeepHistoryState((prev) => {
            const nextState = {
              canUndo: !!state?.canUndo,
              canRedo: !!state?.canRedo,
              undoEntry: state?.undoEntry || null,
              redoEntry: state?.redoEntry || null
            }
            const current = prev[id]
            if (
              current?.canUndo === nextState.canUndo &&
              current?.canRedo === nextState.canRedo &&
              current?.undoEntry === nextState.undoEntry &&
              current?.redoEntry === nextState.redoEntry
            ) return prev
            return { ...prev, [id]: nextState }
          }),
        onCommit: (entry) => keepCommitRef.current(id, entry),
        onPaneFocus: () => focusPane('preview'),
        onSourcePaneFocus: () => focusPane('source'),
        onLocateSource: (line) => locateSourceFromPreview(id, line)
      }
      tabHandlersRef.current.set(id, h)
    }
    return h
  }
  // Drop cached handlers when their tab closes (keyed on the id list, so a
  // content edit never touches this).
  const tabIdsKey = tabs.map((x) => x.id).join('\n')
  useEffect(() => {
    const live = new Set(tabIdsKey.split('\n').filter(Boolean))
    mruTabIdsRef.current = touchTabMru(mruTabIdsRef.current, activeId, live)
  }, [activeId, tabIdsKey])
  useEffect(() => {
    const ids = new Set(tabIdsKey.split('\n').filter(Boolean))
    for (const k of [...tabHandlersRef.current.keys()]) {
      if (!ids.has(k)) tabHandlersRef.current.delete(k)
    }
  }, [tabIdsKey])
  // Stable style objects for the memoized SourceEditorPane (left pane holds a
  // fixed fraction while split; right pane fills the rest — see the editor map).
  const leftPaneStyle = useMemo(
    () => ({
      order: 1,
      flex: layoutSplit ? `0 0 calc(${(splitRatio * 100).toFixed(2)}% - 3px)` : undefined
    }),
    [layoutSplit, splitRatio]
  )
  const rightPaneStyle = useMemo(() => ({ order: 3, flex: undefined }), [])

  const rememberClosedTabs = useCallback((closingTabs, allTabs) => {
    const closedAt = Date.now()
    const entries = (closingTabs || [])
      .filter((tab) => !tab.preview)
      .map((tab, closeOffset) => {
        const discardedChanges = hasUnsavedTab(tab)
        const viewMode = sourceModeIdsRef.current.has(tab.id)
          ? 'source'
          : milkdownForcedRef.current.has(tab.id)
            ? 'milkdown'
            : 'keep'
        return createClosedTabEntry(tab, allTabs.findIndex((item) => item.id === tab.id), {
          closedAt: closedAt + closeOffset,
          viewMode,
          richForced: richForcedRef.current.has(tab.id),
          discardedChanges
        })
      })
      .filter(Boolean)
    if (entries.length) {
      replaceClosedTabs((history) => pushClosedTabEntries(history, entries))
    }
    if ((closingTabs || []).some(hasUnsavedTab)) {
      fireToast(tRef.current('tab.closedDirtyPolicy'), { duration: 5000 })
    }
  }, [hasUnsavedTab, replaceClosedTabs])

  const closeTab = useCallback(
    (id) => {
      const prev = tabsRef.current
      const tab = prev.find((item) => item.id === id)
      if (!tab) return
      if (
        hasUnsavedTab(tab) &&
        !window.confirm(tRef.current('confirm.closeUnsaved', { name: tab.title }))
      ) return
      const idx = prev.findIndex((item) => item.id === id)
      const next = prev.filter((item) => item.id !== id)
      rememberClosedTabs([tab], prev)
      tabsRef.current = next
      setTabs(next)
      setActiveId((cur) => {
        if (cur !== id) return cur
        if (next.length === 0) return null
        return next[Math.min(idx, next.length - 1)].id
      })
    },
    [hasUnsavedTab, rememberClosedTabs]
  )

  // Show a tab in the right (split) pane. If it's currently the active tab, move
  // the left pane to a different tab so the two panes differ.
  const openRight = useCallback((id, preferredLeftId = null) => {
    promotePreviewTab(id)
    setHome(false)
    setSourceSplitEnabled(false)
    setSourcePreviewPinned(false)
    setSourcePreviewId(null)
    if (
      preferredLeftId != null &&
      preferredLeftId !== id &&
      tabsRef.current.some((tab) => tab.id === preferredLeftId)
    ) {
      setActiveId(preferredLeftId)
    } else if (id === activeIdRef.current) {
      const others = tabsRef.current.filter((t) => t.id !== id)
      if (!others.length) return // only one tab — nothing to split against
      setActiveId(others[others.length - 1].id)
    }
    setSplitId(id)
  }, [promotePreviewTab])

  // Toggle split: off → on picks the next tab as the right pane; on → off closes it.
  const toggleSplit = useCallback(() => {
    setSourceSplitEnabled(false)
    setSourcePreviewPinned(false)
    setSourcePreviewId(null)
    setSplitId((cur) => {
      if (cur != null) return null
      const list = tabsRef.current
      if (list.length < 2) {
        fireToast(tRef.current('split.needTwo'))
        return null
      }
      const i = list.findIndex((t) => t.id === activeIdRef.current)
      return list[(i + 1) % list.length].id
    })
    setHome(false)
  }, [])

  // Drag the divider on the sidebar's right edge to resize it. Width is measured
  // from the sidebar's own left so the activity bar offset doesn't matter.
  const startSidebarDrag = useCallback((e) => {
    e.preventDefault()
    const left = paneLeftRef.current?.getBoundingClientRect().left ?? 0
    const onMove = (ev) => {
      setSidebarWidth(Math.min(560, Math.max(180, Math.round(ev.clientX - left))))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('hm-col-resizing')
    }
    document.body.classList.add('hm-col-resizing')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Drag the divider between the two split panes to change their ratio.
  const startSplitDrag = useCallback((e) => {
    e.preventDefault()
    const area = editorAreaRef.current
    if (!area) return
    const rect = area.getBoundingClientRect()
    const onMove = (ev) => {
      const r = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.min(0.8, Math.max(0.2, r)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('hm-col-resizing')
    }
    document.body.classList.add('hm-col-resizing')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Open a file (by path) directly into the right split pane — used by the
  // sidebar's "Open in Split" so it works even if the file isn't open yet.
  const openFileRight = useCallback(
    async (path) => {
      await openPaths([path])
      const norm = (path || '').replace(/\\/g, '/')
      const tab = tabsRef.current.find((t) => (t.path || '').replace(/\\/g, '/') === norm)
      if (tab) openRight(tab.id)
    },
    [openPaths, openRight]
  )

  // --- File operations shared by the tab menu and the sidebar menu, so both
  //     right-click menus offer the same actions on a file. ---
  // Open the rename dialog for a tab's file (Electron has no window.prompt).
  const renameTabFile = useCallback((id) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab?.path) return
    promotePreviewTab(id)
    setRenameState({ id, value: baseName(tab.path) })
  }, [promotePreviewTab])

  const finishTabFileRename = useCallback((id, oldPath, newPath, name) => {
    const norm = (value) => String(value || '').replace(/\\/g, '/').toLowerCase()
    setTabs((prev) => prev.map((tab) =>
      (id && tab.id === id) || norm(tab.path) === norm(oldPath)
        ? { ...tab, path: newPath, title: name }
        : tab
    ))
    setRecents((prev) => prev.map((recent) =>
      recent.path === oldPath
        ? { ...recent, path: newPath, name, dir: dirName(newPath) }
        : recent
    ))
    setRefreshNonce((nonce) => nonce + 1)
  }, [])

  const prepareMarkdownFileRename = useCallback(async ({
    id = null,
    oldPath,
    newPath,
    name = baseName(newPath)
  }) => {
    const plan = await window.api.planFileRename?.({
      roots: workspacesRef.current.map((workspace) => workspace.rootPath),
      oldPath,
      newPath,
      showHidden: settings.showHiddenFiles
    })
    if (plan?.error) throw new Error(plan.error)
    if (plan?.totalChanges > 0) {
      setLinkUpdateState({
        kind: 'file',
        plan,
        busy: false,
        dirtyPaths: dirtyPlanPaths(plan),
        rename: { id, oldPath, newPath, name }
      })
      return false
    }
    await window.api.rename(oldPath, newPath)
    finishTabFileRename(id, oldPath, newPath, name)
    return true
  }, [dirtyPlanPaths, finishTabFileRename, settings.showHiddenFiles])

  // Commit a tab-file rename from the dialog.
  const commitTabRename = useCallback(async (id, rawName) => {
    setRenameState(null)
    const tab = tabsRef.current.find((t) => t.id === id)
    const name = (rawName || '').trim()
    if (!tab?.path || !name) return
    if (name === baseName(tab.path)) return
    if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') {
      window.alert(tRef.current('err.invalidName') + name)
      return
    }
    const newPath = joinPath(dirName(tab.path), name)
    try {
      await prepareMarkdownFileRename({ id, oldPath: tab.path, newPath, name })
    } catch (e) {
      window.alert(
        /eexist|already exists/i.test(e.message)
          ? tRef.current('err.nameExists')
          : tRef.current('err.rename') + e.message
      )
    }
  }, [prepareMarkdownFileRename])

  const applyLinkUpdate = useCallback(async (updateLinks = true) => {
    const state = linkUpdateState
    if (!state || state.busy) return
    if (updateLinks && state.dirtyPaths?.length) {
      fireToast(tRef.current('links.saveAffectedFiles'), { sticky: true })
      return
    }
    setLinkUpdateState((prev) => prev ? { ...prev, busy: true } : prev)
    try {
      if (state.kind === 'file') {
        const result = await window.api.renameFileWithLinks?.({
          ...state.rename,
          updateLinks,
          plan: updateLinks ? state.plan : { files: [] }
        })
        syncAppliedMarkdownFiles(result?.files || [], [{
          from: state.rename.oldPath,
          to: state.rename.newPath
        }])
        finishTabFileRename(
          state.rename.id,
          state.rename.oldPath,
          state.rename.newPath,
          state.rename.name
        )
        fireToast(tRef.current(
          updateLinks ? 'links.renameUpdated' : 'links.renameOnlyDone',
          { n: updateLinks ? state.plan.totalChanges : 0 }
        ))
      } else {
        const result = await window.api.applyMarkdownLinkPlan?.(state.plan)
        syncAppliedMarkdownFiles(result?.files || [])
        fireToast(tRef.current('links.headingUpdated', { n: state.plan.totalChanges }))
      }
      setLinkUpdateState(null)
      if (state.kind === 'heading' && linkPanelRef.current.enabled) {
        setTimeout(() => {
          const tab = tabsRef.current.find((item) => item.id === activeIdRef.current)
          diagnoseLinksForTab(tab)
        }, 80)
      }
    } catch (error) {
      setLinkUpdateState((prev) => prev ? { ...prev, busy: false } : prev)
      fireToast(tRef.current('links.applyFailed', { msg: error?.message || error }), {
        kind: 'error',
        sticky: true
      })
    }
  }, [
    diagnoseLinksForTab,
    finishTabFileRename,
    linkUpdateState,
    syncAppliedMarkdownFiles
  ])

  const duplicateTabFile = useCallback(async (id) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab?.path) return
    try {
      await window.api.duplicate(tab.path)
      setRefreshNonce((n) => n + 1)
    } catch (e) {
      window.alert(
        /eexist|already exists/i.test(e.message)
          ? tRef.current('err.nameExists')
          : tRef.current('err.duplicate') + e.message
      )
    }
  }, [])

  const deleteTabFile = useCallback(async (id) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab?.path) return
    if (!window.confirm(tRef.current('confirm.trash', { name: tab.title }))) return
    try {
      await window.api.deleteItem(tab.path)
      // Remove the tab outright (the file is gone; don't re-prompt about unsaved edits).
      setTabs((prev) => {
        const idx = prev.findIndex((x) => x.id === id)
        const next = prev.filter((x) => x.id !== id)
        setActiveId((cur) => (cur !== id ? cur : next.length ? next[Math.min(idx, next.length - 1)].id : null))
        return next
      })
      setRefreshNonce((n) => n + 1)
    } catch (e) {
      window.alert(tRef.current('err.delete') + e.message)
    }
  }, [])

  // Close every tab except `keepId` (from the tab right-click menu). Pinned
  // tabs survive — pinning is exactly the "don't bulk-close this" contract.
  const closeOthers = useCallback((keepId) => {
    const prev = tabsRef.current
    const others = prev.filter((tab) => tab.id !== keepId && !tab.pinned)
    if (!others.length) return
    const firstDirty = others.find(hasUnsavedTab)
    if (
      firstDirty &&
      !window.confirm(tRef.current('confirm.closeUnsaved', { name: firstDirty.title }))
    ) return
    const next = prev.filter((tab) => tab.id === keepId || tab.pinned)
    rememberClosedTabs(others, prev)
    tabsRef.current = next
    setTabs(next)
    setActiveId(keepId)
    setSplitId((cur) => (cur != null && next.some((tab) => tab.id === cur) ? cur : null))
  }, [hasUnsavedTab, rememberClosedTabs])

  // Close every tab on one side of `pivotId` (from the tab right-click menu).
  // `side` is 'left' (lower indexes) or 'right' (higher indexes).
  const closeSide = useCallback((pivotId, side) => {
    const prev = tabsRef.current
    const idx = prev.findIndex((tab) => tab.id === pivotId)
    if (idx === -1) return
    const range = side === 'left' ? prev.slice(0, idx) : prev.slice(idx + 1)
    const toClose = range.filter((tab) => !tab.pinned) // pinned tabs survive bulk closes
    if (!toClose.length) return
    const firstDirty = toClose.find(hasUnsavedTab)
    if (
      firstDirty &&
      !window.confirm(tRef.current('confirm.closeUnsaved', { name: firstDirty.title }))
    ) return
    const closing = new Set(toClose.map((tab) => tab.id))
    const next = prev.filter((tab) => !closing.has(tab.id))
    const survives = (id) => id != null && next.some((tab) => tab.id === id)
    rememberClosedTabs(toClose, prev)
    tabsRef.current = next
    setTabs(next)
    setActiveId((cur) => (survives(cur) ? cur : pivotId))
    setSplitId((cur) => (survives(cur) ? cur : null))
  }, [hasUnsavedTab, rememberClosedTabs])

  // Tab-strip drag & drop reorder + pin toggle. Both keep the pinned group at
  // the front (pure helpers in paths.js); tabsRef is synced by the render pass.
  const reorderTabs = useCallback((fromId, toId) => {
    const promoted = promotePreviewTabInList(tabsRef.current, fromId)
    const next = reorderTabsList(promoted, fromId, toId)
    tabsRef.current = next
    setTabs(next)
  }, [])
  const toggleTabPin = useCallback((id) => {
    const next = toggleTabPinnedInList(tabsRef.current, id)
    tabsRef.current = next
    setTabs(next)
  }, [])

  const activatePrimaryTab = useCallback((id) => {
    if (!tabsRef.current.some((tab) => tab.id === id)) return false
    setHome(false)
    if (id !== activeIdRef.current) rememberNavigationRef.current()
    if (sourceSplitRef.current && !sourcePreviewPinnedRef.current) setSourcePreviewId(id)
    setActiveId(id)
    return true
  }, [])

  // Stable handlers for the memoized tab strip: split/pane routing is decided
  // at click time via refs, so these never change identity.
  const onTabActivate = useCallback((id) => {
    setHome(false)
    // Load into whichever pane is focused, so both panes are switchable.
    if (splitRef.current && focusedPaneRef.current === 'right' && id !== activeIdRef.current) {
      setSplitId(id)
    } else {
      activatePrimaryTab(id)
    }
  }, [activatePrimaryTab])

  const updateTabSwitcher = useCallback((next) => {
    tabSwitcherRef.current = next
    setTabSwitcher(next)
  }, [])

  const selectTabSwitcherId = useCallback((id) => {
    const current = tabSwitcherRef.current
    if (!current) return
    const index = current.ids.indexOf(id)
    if (index < 0 || index === current.index) return
    updateTabSwitcher({ ...current, index })
  }, [updateTabSwitcher])

  const cancelTabSwitcher = useCallback(() => {
    updateTabSwitcher(null)
  }, [updateTabSwitcher])

  const commitTabSwitcher = useCallback((selectedId = null) => {
    const current = tabSwitcherRef.current
    if (!current) return
    const id = selectedId || current.ids[current.index]
    updateTabSwitcher(null)
    if (id) activatePrimaryTab(id)
  }, [activatePrimaryTab, updateTabSwitcher])

  const openOrStepTabSwitcher = useCallback((delta, releaseKey) => {
    const current = tabSwitcherRef.current
    if (current) {
      updateTabSwitcher({
        ...current,
        index: stepWrappedIndex(current.index, delta, current.ids.length)
      })
      return
    }
    const ids = buildMruTabOrder(
      tabsRef.current,
      mruTabIdsRef.current,
      activeIdRef.current
    )
    if (ids.length < 2) return
    updateTabSwitcher({
      ids,
      index: delta > 0 ? 1 : ids.length - 1,
      initialId: activeIdRef.current,
      releaseKey
    })
  }, [updateTabSwitcher])

  const stepSequentialTab = useCallback((delta) => {
    const list = tabsRef.current
    if (list.length < 2) return false
    const currentIndex = list.findIndex((tab) => tab.id === activeIdRef.current)
    const index = stepWrappedIndex(currentIndex < 0 ? 0 : currentIndex, delta, list.length)
    return activatePrimaryTab(list[index].id)
  }, [activatePrimaryTab])

  const restoreClosedTab = useCallback(async () => {
    const entry = closedTabsRef.current.at(-1)
    if (!entry) {
      fireToast(tRef.current('tab.noClosed'))
      return false
    }
    const existing = tabsRef.current.find(
      (tab) => (tab.path || '').replace(/\\/g, '/') === entry.path.replace(/\\/g, '/')
    )
    if (existing) {
      replaceClosedTabs((history) => removeClosedTabEntry(history, entry.closedId))
      activatePrimaryTab(existing.id)
      fireToast(tRef.current('tab.restoreAlreadyOpen', { name: entry.title }))
      return true
    }

    let file
    try {
      file = await window.api.readFile(entry.path)
    } catch (error) {
      const missing = /ENOENT|not found|no such file/i.test(error?.message || '')
      if (missing) {
        replaceClosedTabs((history) => removeClosedTabEntry(history, entry.closedId))
        fireToast(tRef.current('tab.restoreMissing', { name: entry.title }), {
          kind: 'error',
          sticky: true
        })
      } else {
        fireToast(tRef.current('tab.restoreFailed', {
          name: entry.title,
          msg: error?.message || 'Unknown error'
        }), {
          kind: 'error',
          sticky: true
        })
      }
      return false
    }

    const id = genId()
    const restored = {
      id,
      path: entry.path,
      title: baseName(entry.path),
      content: file.content,
      savedContent: file.content,
      mtimeMs: file.mtimeMs,
      reloadNonce: 0,
      heavy: isHeavyDoc(file.content),
      pinned: !!entry.pinned
    }
    const nextTabs = insertRestoredTab(tabsRef.current, restored, entry.index)
    tabsRef.current = nextTabs
    setTabs(nextTabs)
    replaceClosedTabs((history) => removeClosedTabEntry(history, entry.closedId))
    if (entry.viewMode === 'source') {
      setSourceModeIds((prev) => new Set(prev).add(id))
    } else if (entry.viewMode === 'milkdown') {
      setMilkdownForced((prev) => new Set(prev).add(id))
      if (entry.richForced) setRichForced((prev) => new Set(prev).add(id))
    }
    setRecents((prev) =>
      rememberRecent(prev, {
        path: entry.path,
        name: baseName(entry.path),
        dir: dirName(entry.path),
        openedAt: Date.now()
      })
    )
    activatePrimaryTab(id)
    fireToast(tRef.current('tab.restored', { name: entry.title }))
    return true
  }, [activatePrimaryTab, replaceClosedTabs])

  const onCloseLeftTabs = useCallback((id) => closeSide(id, 'left'), [closeSide])
  const onCloseRightTabs = useCallback((id) => closeSide(id, 'right'), [closeSide])

  const writeTab = useCallback(async (tab, targetPath, { notify = true } = {}) => {
    try {
      // Move pasted images (base64 blobs / global paste-folder files) into the
      // doc's ./assets and rewrite links to relative paths, so the saved file is
      // clean and portable (Typora-style). No-op when there are none / on mobile.
      const { content: written, changed } = window.api.inlineForSave
        ? await window.api.inlineForSave(tab.content, targetPath)
        : { content: tab.content, changed: false }
      const { mtimeMs } = await window.api.writeFile(targetPath, written)
      if (
        settings.localHistory &&
        window.api.localHistoryAdd &&
        tab.path &&
        tab.path.replace(/\\/g, '/') === targetPath.replace(/\\/g, '/') &&
        tab.savedContent !== written
      ) {
        try {
          await window.api.localHistoryAdd({
            path: targetPath,
            content: tab.savedContent,
            reason: notify ? 'manual' : 'autosave'
          })
        } catch {
          /* saving succeeded; local history is best-effort and must not fail it */
        }
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tab.id
            ? changed
              ? // Images were moved to assets/: adopt the rewritten content and
                // remount the editor so it shows the relative-path images.
                {
                  ...t,
                  path: targetPath,
                  title: baseName(targetPath),
                  content: written,
                  savedContent: written,
                  mtimeMs,
                  reloadNonce: t.reloadNonce + 1,
                  conflict: null
                }
              : { ...t, path: targetPath, title: baseName(targetPath), savedContent: t.content, mtimeMs, conflict: null }
            : t
        )
      )
      setRefreshNonce((n) => n + 1)
      // On mobile, where files land in a system folder, confirm what + where —
      // sticky so the user can read the location before dismissing it.
      if (isMobile) {
        const loc =
          window.api.platform === 'ios' ? tRef.current('save.locIos') : tRef.current('save.locAndroid')
        fireToast(tRef.current('save.savedTo', { name: baseName(targetPath), loc }), {
          sticky: true,
          duration: 5000,
          kind: 'success'
        })
      } else if (notify) {
        // Manual saves (Ctrl+S / FAB / menu) get a brief confirmation; autosave
        // stays silent so it doesn't toast every couple of seconds while typing.
        fireToast(tRef.current('save.saved'), { kind: 'success' })
      }
      return true
    } catch (e) {
      // Never fail silently — surface the real error so saving is debuggable.
      fireToast(tRef.current('save.failed', { msg: e?.message || String(e) }), { sticky: true, kind: 'error' })
      return false
    }
  }, [isMobile, settings.localHistory])

  const saveTab = useCallback(
    async (id, forceDialog = false, opts) => {
      const tab = tabs.find((t) => t.id === id)
      if (!tab) return false
      let target = tab.path
      if (!target || forceDialog) {
        // Mobile has no native save dialog: ask for a filename, then write into
        // the local library (see commitMobileSave). Desktop keeps the dialog.
        if (isMobile) {
          const base = (tab.title || 'Untitled').replace(/\.(md|markdown|mdx)$/i, '')
          setSaveNameState({ id, value: base + '.md' })
          return 'pending'
        }
        target = await window.api.saveAs(tab.title.endsWith('.md') ? tab.title : tab.title + '.md')
        if (!target) return false
      }
      return writeTab(tab, target, opts)
    },
    [tabs, writeTab, isMobile]
  )

  // ── Autosave (opt-in) ──
  // Debounced write-to-disk while typing, for tabs that already have a path.
  // Untitled drafts are excluded (they'd pop a Save As dialog mid-typing) and
  // so are conflicted tabs (autosave must never clobber an external edit the
  // user hasn't resolved). Watcher echo is already suppressed downstream: the
  // file:changed handler ignores events whose mtime <= the tab's saved mtime.
  const autosaveTimerRef = useRef(0)
  useEffect(() => {
    if (!settings.autosave) return
    const dirty = tabs.filter(
      (t) => t.path && !t.loading && !t.conflict && t.content !== t.savedContent
    )
    if (!dirty.length) return
    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      // Re-check against the live list — the 2s window may have seen a save,
      // an external reload, or a close.
      for (const t of dirty) {
        const live = tabsRef.current.find((x) => x.id === t.id)
        if (live && live.path && !live.conflict && live.content !== live.savedContent) {
          saveTab(live.id, false, { notify: false })
        }
      }
    }, 2000)
    return () => clearTimeout(autosaveTimerRef.current)
  }, [tabs, settings.autosave, saveTab])

  // ── Default editor mode ──
  // When the preference is "rich", opt each NEWLY-opened markdown tab into the
  // Milkdown editor (the same per-tab set the status-bar toggle flips, so the
  // user can still switch any tab back). Tabs opened before the preference
  // changed keep their current engine.
  const seenTabIdsRef = useRef(new Set())
  useEffect(() => {
    const seen = seenTabIdsRef.current
    const fresh = tabs.filter((t) => !seen.has(t.id))
    if (!fresh.length) return
    fresh.forEach((t) => seen.add(t.id))
    if (settings.defaultEditorMode !== 'rich') return
    const mdFresh = fresh.filter((t) => !isPlainTextDoc(t))
    if (!mdFresh.length) return
    setMilkdownForced((prev) => {
      const next = new Set(prev)
      mdFresh.forEach((t) => next.add(t.id))
      return next
    })
  }, [tabs, settings.defaultEditorMode])

  // Commit a mobile "save as": let the platform layer place the named file in
  // the local library (it returns a de-duplicated path), then write it.
  const commitMobileSave = useCallback(
    async (id, rawName) => {
      const pendingMode = pendingModeAfterSaveRef.current?.id === id
        ? pendingModeAfterSaveRef.current
        : null
      if (pendingMode) pendingModeAfterSaveRef.current = null
      setSaveNameState(null)
      const tab = tabsRef.current.find((t) => t.id === id)
      let name = (rawName || '').trim()
      if (!tab || !name) return
      if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') {
        window.alert(tRef.current('err.invalidName') + name)
        return
      }
      if (!/\.(md|markdown|mdx)$/i.test(name)) name += '.md'
      const target = await window.api.saveAs(name)
      if (!target) return
      const saved = await writeTab(tab, target)
      if (saved && pendingMode) applyEditorMode(id, pendingMode.direction === 'toMilkdown')
    },
    [applyEditorMode, writeTab]
  )

  const cancelModeSwitch = useCallback(() => {
    if (modeSwitchSaving) return
    setModeSwitchState(null)
  }, [modeSwitchSaving])

  const continueModeSwitch = useCallback(() => {
    if (!modeSwitchState || modeSwitchSaving) return
    const { id, direction } = modeSwitchState
    setModeSwitchState(null)
    applyEditorMode(id, direction === 'toMilkdown')
  }, [applyEditorMode, modeSwitchSaving, modeSwitchState])

  const saveAndContinueModeSwitch = useCallback(async () => {
    if (!modeSwitchState || modeSwitchState.direction !== 'toMilkdown' || modeSwitchSaving) return
    const pending = modeSwitchState
    setModeSwitchSaving(true)
    const result = await saveTab(pending.id)
    if (result === true) {
      setModeSwitchState(null)
      setModeSwitchSaving(false)
      applyEditorMode(pending.id, true)
      return
    }
    if (result === 'pending') {
      pendingModeAfterSaveRef.current = pending
      setModeSwitchState(null)
    }
    setModeSwitchSaving(false)
  }, [applyEditorMode, modeSwitchSaving, modeSwitchState, saveTab])

  const reviewModeSwitchChanges = useCallback(() => {
    if (!modeSwitchState || modeSwitchSaving) return
    const tab = tabsRef.current.find((item) => item.id === modeSwitchState.id)
    if (!tab) return
    setChangeReview({
      tabId: tab.id,
      baseline: tab.savedContent,
      context: 'modeSwitch',
      allowRestore: modeSwitchState.direction === 'toMilkdown',
      titleKey: 'review.modeTitle',
      descriptionKey: 'review.modeDescription'
    })
  }, [modeSwitchSaving, modeSwitchState])

  // Export a file (by path) to PDF: open/focus it, wait for its editor to mount,
  // then reuse the same HTML→PDF pipeline as the menu command. Driven from the
  // sidebar's right-click menu, where the file may not be open yet.
  const exportPathToPdf = useCallback(
    async (path) => {
      await openPaths([path])
      const norm = (path || '').replace(/\\/g, '/')
      const tab = tabsRef.current.find((t) => (t.path || '').replace(/\\/g, '/') === norm)
      if (!tab) return
      let html = null
      for (let i = 0; i < 40 && !html; i++) {
        html = editorApis.current[tab.id]?.getDocHTML?.()
        if (!html) await new Promise((r) => setTimeout(r, 75))
      }
      if (!html) {
        window.alert(tRef.current('error.exportPdfUnavailable'))
        return
      }
      const base = (tab.title || 'Untitled').replace(/\.(md|markdown|mdx|txt)$/i, '')
      await window.api.exportPDF(html, base + '.pdf', {
        fontWriteEn: settings.fontWriteEn,
        fontWriteZh: settings.fontWriteZh,
        fontWriteJa: settings.fontWriteJa,
        fontMono: settings.fontMono
      })
    },
    [openPaths, settings.fontWriteEn, settings.fontWriteZh, settings.fontWriteJa, settings.fontMono]
  )

  // --------------------------- workspace ---------------------------
  // Add a folder as a new root (deduped by path). Multiple roots coexist in the
  // sidebar, each its own tree — opening another project never closes the others.
  const addWorkspace = useCallback((dir) => {
    if (!dir || !isAbsolutePath(dir)) return
    setWorkspaces((ws) =>
      ws.some((w) => w.rootPath === dir) ? ws : [...ws, { rootPath: dir, rootName: baseName(dir) }]
    )
    setSidebarMode('files')
    setSidebarOpen(true)
  }, [])

  const removeWorkspace = useCallback((rootPath) => {
    setWorkspaces((ws) => ws.filter((w) => w.rootPath !== rootPath))
  }, [])

  // Reorder roots by dragging their headers: move `fromPath` to just before/after
  // `toPath`. Index is recomputed after the removal so the math stays correct.
  const reorderWorkspaces = useCallback((fromPath, toPath, pos) => {
    if (!fromPath || !toPath || fromPath === toPath) return
    setWorkspaces((ws) => {
      const from = ws.findIndex((w) => w.rootPath === fromPath)
      if (from < 0 || !ws.some((w) => w.rootPath === toPath)) return ws
      const next = ws.slice()
      const [moved] = next.splice(from, 1)
      let insert = next.findIndex((w) => w.rootPath === toPath)
      if (pos === 'after') insert += 1
      next.splice(insert, 0, moved)
      return next
    })
  }, [])

  const openFolder = useCallback(async () => {
    const dir = await window.api.openFolder()
    if (!dir) return
    addWorkspace(dir)
  }, [addWorkspace])

  // Stable handler for the memoized Sidebar (an inline arrow would defeat memo).
  const onSidebarOpenFile = useCallback(
    (p, options = {}) => {
      rememberNavigationRef.current()
      openPaths([p], false, options)
      if (isMobile) setSidebarOpen(false)
    },
    [openPaths, isMobile]
  )
  const onSidebarRenamePath = useCallback(async (oldPath, newPath) => {
    try {
      return await prepareMarkdownFileRename({
        oldPath,
        newPath,
        name: baseName(newPath)
      })
    } catch (error) {
      window.alert(
        /eexist|already exists/i.test(error?.message || '')
          ? tRef.current('err.nameExists')
          : tRef.current('err.rename') + (error?.message || error)
      )
      return false
    }
  }, [prepareMarkdownFileRename])

  // A stable key for the set of roots, so the watch/list effects only re-run when
  // the roots actually change (not on every array-identity churn).
  const rootsKey = workspaces.map((w) => w.rootPath).join('\n')

  // The cross-root file index (for the command palette's quick-open) is built
  // LAZILY — recursively scanning whole workspace trees at launch stalls big
  // projects. Rebuild it when the palette opens (so collapsed-folder changes are
  // picked up), and while the palette is open after watched changes.
  const relistTimerRef = useRef(null)
  const relistSeqRef = useRef(0)
  const relistFiles = useCallback(() => {
    const seq = ++relistSeqRef.current
    const roots = workspaces.map((w) => w.rootPath)
    if (!roots.length) {
      setFiles([])
      return
    }
    Promise.all(roots.map((r) => window.api.listFiles(r).catch(() => [])))
      .then((arrs) => {
        if (seq === relistSeqRef.current) setFiles(arrs.flat())
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootsKey])

  const loadPaletteWorkspaceHeadings = useCallback(
    () =>
      window.api.listWorkspaceHeadings?.(
        workspacesRef.current.map((workspace) => workspace.rootPath),
        { showHidden: settings.showHiddenFiles }
      ) || Promise.resolve({ items: [], filesScanned: 0, truncated: false }),
    [settings.showHiddenFiles]
  )

  // Rebuild every time the palette opens. This is the "manual freshness" escape
  // hatch for lazy folder watching: changes under collapsed, never-expanded dirs
  // are not watched, but quick-open sees them on the next palette open.
  useEffect(() => {
    if (paletteOpen) relistFiles()
  }, [paletteOpen, relistFiles])

  // Folder watching is LAZY and lives in the Sidebar: it shallow-watches each
  // directory as it's loaded/expanded (Sidebar.loadDir → watchStart), instead of
  // recursively crawling whole roots here. Recursively watching workspaces with
  // hundreds of nested folders was the startup-jank culprit — the crawl saturated
  // the main process so reading the active doc stalled. We just react to changes:
  useEffect(() => {
    const off = window.api.onWatchChanged(() => {
      setRefreshNonce((n) => n + 1) // cheap: Sidebar only reloads already-open dirs
      // If quick-open is visible, keep its index live. If it's closed, don't scan
      // in the background; the next palette open rebuilds from disk anyway.
      if (paletteOpen) {
        clearTimeout(relistTimerRef.current)
        relistTimerRef.current = setTimeout(relistFiles, 400)
      }
    })
    return () => {
      off()
      clearTimeout(relistTimerRef.current)
    }
  }, [paletteOpen, relistFiles])

  // --------- auto-reload open files edited by external programs ----------
  const watchedRef = useRef(new Set())

  // Keep a per-file watcher in sync with the set of open file paths. Skip sleeping
  // restore placeholders (loading, not yet read) — watching all N up front defeats
  // the lazy restore; each gets its watcher when it's woken and filled.
  useEffect(() => {
    const want = new Set(tabs.filter((t) => !t.loading).map((t) => t.path).filter(Boolean))
    for (const p of want) if (!watchedRef.current.has(p)) window.api.watchFile(p)
    for (const p of watchedRef.current) if (!want.has(p)) window.api.unwatchFile(p)
    watchedRef.current = want
  }, [tabs])

  const reloadTabFromDisk = useCallback(async (id, path, force = false) => {
    try {
      const { content, mtimeMs } = await window.api.readFile(path)
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          // Bail if the user has started editing since the change fired —
          // never clobber unsaved work (unless this is a forced conflict reload,
          // where the user explicitly chose to discard local edits).
          if (!force && t.content !== t.savedContent) return t
          if (t.content === content) return { ...t, mtimeMs, conflict: null }
          return {
            ...t,
            content,
            savedContent: content,
            mtimeMs,
            reloadNonce: t.reloadNonce + 1,
            heavy: isHeavyDoc(content),
            conflict: null
          }
        })
      )
    } catch {
      /* file vanished mid-reload; leave the tab as-is */
    }
  }, [])

  useEffect(() => {
    const off = window.api.onFileChanged(({ path, mtimeMs }) => {
      const norm = (path || '').replace(/\\/g, '/')
      const tab = tabsRef.current.find((t) => (t.path || '').replace(/\\/g, '/') === norm)
      if (!tab) return
      // Ignore the echo from our own save (same or older mtime).
      if (tab.mtimeMs && mtimeMs && mtimeMs <= tab.mtimeMs) return
      // Clean tab → reload silently. Dirty tab → don't clobber unsaved edits;
      // flag a conflict so the user can choose reload-from-disk or keep-local.
      if (tab.content !== tab.savedContent) {
        setTabs((prev) =>
          prev.map((t) => (t.id === tab.id ? { ...t, conflict: { mtimeMs } } : t))
        )
        return
      }
      reloadTabFromDisk(tab.id, tab.path)
    })
    return off
  }, [reloadTabFromDisk])

  // Resolve an external-edit conflict on a dirty tab. 'reload' discards local
  // edits and loads the disk version; 'keep' keeps the local edits (a later save
  // overwrites disk) — we adopt the disk mtime so the same change won't re-fire.
  const resolveConflict = useCallback(
    (id, choice) => {
      const tab = tabsRef.current.find((t) => t.id === id)
      if (!tab) return
      if (choice === 'reload') {
        reloadTabFromDisk(id, tab.path, true)
        return
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, conflict: null, mtimeMs: tab.conflict?.mtimeMs ?? t.mtimeMs } : t
        )
      )
    },
    [reloadTabFromDisk]
  )

  const reviewConflictChanges = useCallback(async (id) => {
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!tab?.path) return
    try {
      const disk = await window.api.readFile(tab.path)
      setChangeReview({
        tabId: id,
        baseline: disk.content,
        context: 'conflict',
        allowRestore: false,
        titleKey: 'review.conflictTitle',
        descriptionKey: 'review.conflictDescription'
      })
    } catch {
      fireToast(tRef.current('review.readFailed'), { kind: 'error' })
    }
  }, [])

  // --------------------------- outline jump ------------------------
  const [activeHeading, setActiveHeading] = useState(-1)
  const forcedActiveHeadingRef = useRef(null)
  const outlineJumpRef = useRef({ token: 0, raf: 0, timer: 0, scroller: null, overflowAnchor: '' })

  const cancelOutlineJump = useCallback(() => {
    const job = outlineJumpRef.current
    job.token += 1
    if (job.raf) cancelAnimationFrame(job.raf)
    if (job.timer) clearTimeout(job.timer)
    if (job.scroller) job.scroller.style.overflowAnchor = job.overflowAnchor
    job.raf = 0
    job.timer = 0
    job.scroller = null
    forcedActiveHeadingRef.current = null
  }, [])
  cancelNavigationEffectsRef.current = cancelOutlineJump

  const jumpToHeading = useCallback((index, heading = null) => {
    rememberNavigationRef.current()
    setHome(false)
    if (isMobile) setSidebarOpen(false)
    cancelOutlineJump()

    if (sourceModeRef.current) {
      const source = sourceRef.current
      const currentDetails = parseHeadingDetails(
        source?.__hmSourceApi?.getFullValue?.() ??
        tabsRef.current.find((tab) => tab.id === activeIdRef.current)?.content ??
        ''
      )
      const details = currentDetails[index] || heading
      if (source && Number.isFinite(details?.charOffset)) {
        source.__hmSourceApi?.scrollToOffset?.(details.charOffset, {
          align: 'top',
          placeCaret: true,
          userNavigation: true
        })
        setActiveHeading(index)
      }
      return
    }

    const job = outlineJumpRef.current
    const token = job.token
    const api = editorApis.current[activeId]
    let attempts = 0

    const finish = () => {
      if (token !== job.token) return
      if (job.scroller) job.scroller.style.overflowAnchor = job.overflowAnchor
      job.raf = 0
      job.timer = 0
      job.scroller = null
      forcedActiveHeadingRef.current = null
    }

    const stabilize = (scroller, el) => {
      let stable = 0
      let checks = 0
      let lastScrollTop = scroller.scrollTop
      const poll = () => {
        if (token !== job.token) return
        if (!el.isConnected) {
          finish()
          return
        }
        const delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        if (Math.abs(delta) > 2) scroller.scrollTop += delta
        const current = scroller.scrollTop
        if (Math.abs(delta) <= 2 && Math.abs(current - lastScrollTop) < 3) stable += 1
        else stable = 0
        lastScrollTop = current
        checks += 1
        if (stable >= 2 || checks >= 18) {
          finish()
          return
        }
        job.timer = setTimeout(poll, 180)
      }
      job.timer = setTimeout(poll, 180)
    }

    const animateTo = (scroller, el) => {
      forcedActiveHeadingRef.current = index
      setActiveHeading(index)
      job.scroller = scroller
      job.overflowAnchor = scroller.style.overflowAnchor
      scroller.style.overflowAnchor = 'none'

      const start = scroller.scrollTop
      const target = start + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      const distance = Math.abs(target - start)
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (reduced || distance < 5) {
        scroller.scrollTop = target
        stabilize(scroller, el)
        return
      }
      const duration = Math.min(500, Math.max(200, distance / 8))
      const startedAt = performance.now()
      const step = (now) => {
        if (token !== job.token) return
        const p = Math.min(1, (now - startedAt) / duration)
        const eased = 1 - Math.pow(1 - p, 3)
        scroller.scrollTop = start + (target - start) * eased
        if (p < 1) job.raf = requestAnimationFrame(step)
        else stabilize(scroller, el)
      }
      job.raf = requestAnimationFrame(step)
    }

    const tryJump = () => {
      if (token !== job.token) return
      // Keep mode progressively paints long documents. Flush only the active
      // editor; touching hidden tabs would make one outline click render them.
      api?.ensureRendered?.()

      let scroller = editorHostRef.current
      let headings = scroller && scroller.offsetParent !== null
        ? scroller.querySelectorAll(
            '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
          )
        : []
      if (!headings.length) {
        const candidates = editorAreaRef.current?.querySelectorAll('.editor-scroll.km-scroll.hm-pane-left') || []
        scroller = [...candidates].find((el) => el.offsetParent !== null) || null
        headings = scroller?.querySelectorAll('.km-doc h1, .km-doc h2, .km-doc h3, .km-doc h4, .km-doc h5, .km-doc h6') || []
      }
      const el = headings[index]
      if (!scroller || !el) {
        if (attempts++ < 75) job.timer = setTimeout(tryJump, 40)
        return
      }
      api?.revealHeading?.(el)
      animateTo(scroller, el)
    }

    tryJump()
  }, [activeId, cancelOutlineJump, isMobile])
  const onPaletteOpenHeading = useCallback(
    (index, heading) => jumpToHeading(index, heading),
    [jumpToHeading]
  )

  useEffect(() => {
    setActiveHeading(-1)
    return cancelOutlineJump
  }, [activeId, cancelOutlineJump])

  useEffect(() => {
    if (home || !sidebarOpen || sidebarMode !== 'outline' || !sourceMode) return
    const source = sourceRef.current
    if (!source) return
    let cachedText = null
    let headings = []
    let raf = 0
    let lastIndex = -1
    const compute = () => {
      raf = 0
      const text = source.__hmSourceApi?.getFullValue?.() ?? source.value
      if (text !== cachedText) {
        cachedText = text
        headings = parseHeadingDetails(text)
      }
      const offset = source.__hmSourceApi?.getViewportOffset?.() ?? 0
      let index = headings.length ? 0 : -1
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].charOffset <= offset + 1) index = i
        else break
      }
      if (index !== lastIndex) {
        lastIndex = index
        setActiveHeading(index)
      }
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute)
    }
    compute()
    source.addEventListener('scroll', schedule, { passive: true })
    source.addEventListener('input', schedule, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      source.removeEventListener('scroll', schedule)
      source.removeEventListener('input', schedule)
    }
  }, [activeId, home, sidebarMode, sidebarOpen, sourceMode])

  // Outline scrollspy: highlight the heading you're currently viewing (the last
  // one scrolled past the top), mirroring how the file tree marks the open file.
  // Preview editor only — source mode has the offset-based scrollspy above.
  // On large docs the per-scroll querySelectorAll + getBoundingClientRect chain
  // is a forced reflow that freezes the main thread → scroll "chase" (#17).
  // Throttle to at most once per 300ms (not per frame) and skip entirely while
  // the user is actively scrolling fast (resume on settle).
  useEffect(() => {
    if (sourceMode) return
    if (home || !sidebarOpen || sidebarMode !== 'outline') {
      setActiveHeading(-1)
      return
    }
    const scroller = editorHostRef.current
    if (!scroller) return

    // Reflow-free scrollspy. The previous version re-queried and called
    // getBoundingClientRect() on EVERY heading on every throttle tick. On a
    // large doc each call forces a full-document layout recalc, which
    // (a) froze the main thread during scroll (#17 "chase" lag) and (b) used a
    // leading-edge-only throttle with no trailing update — so when scrolling
    // stopped the last compute was up to 300ms stale and the outline landed on
    // the WRONG heading. Fix: measure each heading's content-offset ONCE (a
    // single layout pass, rebuilt every 2s / on resize), then compare against
    // the cheap scrollTop on scroll. No layout read per frame, so it can update
    // every frame and always reflects the exact current position.
    let tops = null // heading content-offsets (px from content top); stable across scroll
    let builtAt = 0
    let raf = 0
    let lastIdx = -1
    let tries = 0

    const build = () => {
      const els = scroller.querySelectorAll(
        '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
      )
      if (!els.length) {
        tops = null
        return
      }
      // Read every rect in one synchronous block = ONE reflow, not N. Convert
      // each to a content-offset (Y = rect.top − scroller.top + scrollTop); Y is
      // invariant under scrolling, so the cache stays valid while scrolling.
      const base = scroller.getBoundingClientRect().top
      const top0 = scroller.scrollTop
      tops = new Array(els.length)
      for (let i = 0; i < els.length; i++) tops[i] = els[i].getBoundingClientRect().top - base + top0
      builtAt = Date.now()
    }
    const compute = () => {
      raf = 0
      const now = Date.now()
      if (!tops || now - builtAt > 2000) {
        build()
        if (!tops) {
          // Editor still mounting (no headings yet) — retry briefly.
          if (tries++ < 30) raf = requestAnimationFrame(compute)
          return
        }
        tries = 0
      }
      // scrollTop is a cheap scroll-offset read — no layout, no reflow — so this
      // can run every frame without freezing and lands on the exact heading.
      let idx = forcedActiveHeadingRef.current
      if (idx == null) {
        const limit = scroller.scrollTop + 90
        idx = 0
        for (let i = 0; i < tops.length; i++) {
          if (tops[i] <= limit) idx = i
          else break
        }
      }
      if (idx !== lastIdx) {
        lastIdx = idx
        setActiveHeading(idx) // only re-render the outline when the active row actually changes
      }
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute) // coalesce to ≤ once per frame
    }
    compute()
    scroller.addEventListener('scroll', schedule, { passive: true })
    // Resize (and the layout-settings popover) reflow heading offsets → rebuild.
    const invalidate = () => {
      tops = null
      schedule()
    }
    window.addEventListener('resize', invalidate, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      scroller.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', invalidate)
    }
  }, [home, sidebarOpen, sidebarMode, sourceMode, activeId])

  // ------------------------- menu / shortcuts ----------------------
  // In split view, target the pane you're actually editing (last focused), as
  // long as it's one of the two visible panes; otherwise the active (left) tab.
  const pickEditableId = () => {
    const f = focusedTabRef.current
    if (f && (f === activeId || f === splitId || (sourceSplit && f === sourcePreviewId))) return f
    return activeId
  }

  const runKeepHistory = useCallback((direction, targetId = null) => {
    const focused = focusedTabRef.current
    const id = targetId || (
      focused && (
        focused === activeIdRef.current ||
        (splitRef.current && focused === splitIdRef.current) ||
        (sourceSplitRef.current && focused === sourcePreviewIdRef.current)
      )
        ? focused
        : activeIdRef.current
    )
    const tab = tabsRef.current.find((item) => item.id === id)
    if (
      !tab ||
      isPlainTextDoc(tab) ||
      milkdownForcedRef.current.has(id) ||
      (id === activeIdRef.current && sourceModeRef.current)
    ) return false
    if (!guardKeepDraft(id)) return true
    const changed = editorApis.current[id]?.[direction]?.() === true
    if (changed) fireToast(tRef.current(direction === 'undo' ? 'keep.undoDone' : 'keep.redoDone'))
    return changed
  }, [guardKeepDraft])

  keepCommitRef.current = (id, entry) => {
    const meta = entry?.meta
    fireToast(tRef.current(meta?.summaryKey || 'keep.changeEdit', meta?.summaryVars || undefined), {
      actionLabel: tRef.current('keep.undoAction'),
      onAction: () => runKeepHistory('undo', id),
      duration: 5000
    })
  }

  const openKeepReview = useCallback((targetId = null) => {
    const id = targetId || activeIdRef.current
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!tab || tab.content === tab.savedContent) return
    if (!guardKeepDraft(id)) return
    const isKeepPreview =
      !isPlainTextDoc(tab) &&
      !milkdownForcedRef.current.has(id) &&
      !(id === activeIdRef.current && sourceModeRef.current)
    setChangeReview({
      tabId: id,
      baseline: tab.savedContent,
      context: 'current',
      allowRestore: isKeepPreview,
      titleKey: 'review.title',
      descriptionKey: isKeepPreview ? 'review.description' : 'review.readOnlyDescription'
    })
  }, [guardKeepDraft])

  const canRestoreLocalHistory = useCallback((id) => {
    const tab = tabsRef.current.find((item) => item.id === id)
    return !!(
      tab &&
      !isPlainTextDoc(tab) &&
      !milkdownForcedRef.current.has(id) &&
      !(id === activeIdRef.current && sourceModeRef.current && !sourceSplitRef.current) &&
      editorApis.current[id]?.replaceLineRange
    )
  }, [])

  const openLocalHistory = useCallback(async (targetId = null) => {
    const id = targetId || activeIdRef.current
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!settings.localHistory) {
      fireToast(tRef.current('history.disabled'), { sticky: true })
      return
    }
    if (!tab?.path) {
      fireToast(tRef.current('history.needsSave'), { sticky: true })
      return
    }
    try {
      const entries = await window.api.localHistoryList?.(tab.path)
      setLocalHistoryState({ tabId: id, entries: entries || [] })
    } catch (error) {
      fireToast(tRef.current('history.loadFailed', { msg: error?.message || String(error) }), {
        kind: 'error',
        sticky: true
      })
    }
  }, [settings.localHistory])

  const compareLocalHistory = useCallback(async (entry) => {
    const state = localHistoryState
    const tab = state && tabsRef.current.find((item) => item.id === state.tabId)
    if (!tab?.path) return
    const snapshot = await window.api.localHistoryRead?.(tab.path, entry.id)
    if (!snapshot) return
    setLocalHistoryState(null)
    setChangeReview({
      tabId: tab.id,
      baseline: snapshot.content,
      context: 'history',
      allowRestore: canRestoreLocalHistory(tab.id),
      titleKey: 'history.reviewTitle',
      descriptionKey: 'history.reviewDescription'
    })
  }, [canRestoreLocalHistory, localHistoryState])

  const restoreLocalHistory = useCallback(async (entry) => {
    const state = localHistoryState
    const tab = state && tabsRef.current.find((item) => item.id === state.tabId)
    if (!tab?.path || !guardKeepDraft(tab.id)) return
    const api = editorApis.current[tab.id]
    if (!canRestoreLocalHistory(tab.id) || !api?.replaceLineRange) {
      fireToast(tRef.current('history.restoreKeepOnly'), { sticky: true })
      return
    }
    const snapshot = await window.api.localHistoryRead?.(tab.path, entry.id)
    if (!snapshot) return
    const changed = api.replaceLineRange(
      0,
      tab.content.split('\n').length,
      snapshot.content.split('\n')
    )
    if (changed !== false) {
      setLocalHistoryState(null)
      fireToast(tRef.current('history.restored'), { kind: 'success' })
    }
  }, [canRestoreLocalHistory, guardKeepDraft, localHistoryState])

  const deleteLocalHistoryEntry = useCallback(async (entry) => {
    const state = localHistoryState
    const tab = state && tabsRef.current.find((item) => item.id === state.tabId)
    if (!tab?.path) return
    const result = await window.api.localHistoryDelete?.(tab.path, entry.id)
    if (result?.ok) {
      setLocalHistoryState((current) =>
        current?.tabId === tab.id ? { ...current, entries: result.entries || [] } : current
      )
    }
  }, [localHistoryState])

  const clearDocumentLocalHistory = useCallback(async () => {
    const state = localHistoryState
    const tab = state && tabsRef.current.find((item) => item.id === state.tabId)
    if (!tab?.path) return
    const result = await window.api.localHistoryDelete?.(tab.path)
    if (result?.ok) {
      setLocalHistoryState((current) => current ? { ...current, entries: [] } : current)
    }
  }, [localHistoryState])

  const clearAllLocalHistory = useCallback(async () => {
    const result = await window.api.localHistoryClear?.()
    if (result?.ok) setLocalHistoryState(null)
    return result
  }, [])

  const runKeepTableCommand = (command) => {
    const id = pickEditableId()
    const tab = tabsRef.current.find((item) => item.id === id)
    if (
      !tab ||
      isPlainTextDoc(tab) ||
      milkdownForcedRef.current.has(id) ||
      (id === activeIdRef.current && sourceModeRef.current)
    ) {
      fireToast(tRef.current('keep.selectTableCell'))
      return false
    }
    if (!guardKeepDraft(id)) return false
    const handled = editorApis.current[id]?.tableCommand?.(command) === true
    if (!handled) fireToast(tRef.current('keep.selectTableCell'))
    return handled
  }

  const runKeepBlockCommand = (command) => {
    const id = pickEditableId()
    const tab = tabsRef.current.find((item) => item.id === id)
    if (
      !tab ||
      isPlainTextDoc(tab) ||
      milkdownForcedRef.current.has(id) ||
      (id === activeIdRef.current && sourceModeRef.current)
    ) {
      fireToast(tRef.current('keep.selectBlock'))
      return false
    }
    if (!guardKeepDraft(id)) return false
    const handled = editorApis.current[id]?.blockCommand?.(command) === true
    if (!handled) fireToast(tRef.current('keep.selectBlock'))
    return handled
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey || !(e.ctrlKey || e.metaKey)) return
      if (e.target?.closest?.('input, textarea, [contenteditable="true"], .cm-editor')) return
      const key = e.key.toLowerCase()
      const direction =
        key === 'z' && !e.shiftKey
          ? 'undo'
          : (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)
            ? 'redo'
            : null
      if (direction && runKeepHistory(direction)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [runKeepHistory])

  useEffect(() => {
    let chordUntil = 0
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase()
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && !event.altKey && !event.shiftKey && key === 'k') {
        chordUntil = Date.now() + 1600
        event.preventDefault()
        return
      }
      if (!event.altKey && !event.shiftKey && key === 'z' && Date.now() <= chordUntil) {
        chordUntil = 0
        event.preventDefault()
        event.stopPropagation()
        setZenReveal(false)
        setZenMode((enabled) => !enabled)
        return
      }
      if (!['control', 'meta', 'shift', 'alt'].includes(key)) chordUntil = 0
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useEffect(() => {
    clearTimeout(zenHideTimerRef.current)
    if (!zenMode) return
    const onMouseMove = (event) => {
      const revealedLeft = sidebarOpen ? sidebarWidth + 52 : 52
      const nearChrome =
        event.clientY <= (zenReveal ? 54 : 7) ||
        event.clientX <= (zenReveal ? revealedLeft : 7) ||
        event.clientY >= window.innerHeight - (zenReveal ? 34 : 7)
      if (nearChrome) {
        clearTimeout(zenHideTimerRef.current)
        if (!zenReveal) setZenReveal(true)
      } else if (zenReveal && !zenHideTimerRef.current) {
        zenHideTimerRef.current = setTimeout(() => {
          zenHideTimerRef.current = 0
          setZenReveal(false)
        }, 850)
      }
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      clearTimeout(zenHideTimerRef.current)
      zenHideTimerRef.current = 0
    }
  }, [zenMode, zenReveal, sidebarOpen, sidebarWidth])

  const handlers = useRef({})
  handlers.current = {
    home: () => {
      setHome(true)
      if (isMobile) setSidebarOpen(false) // jump straight to Home, don't leave the drawer over it
    },
    new: newTab,
    open: async () => openPaths(await window.api.openFiles(), false, { followSidebar: true }),
    openFolder,
    save: () => {
      const id = pickEditableId()
      if (id && guardKeepDraft(id)) saveTab(id)
    },
    saveAs: () => {
      const id = pickEditableId()
      if (id && guardKeepDraft(id)) saveTab(id, true)
    },
    attach: async () => {
      const id = pickEditableId()
      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab || !tab.path || !MD_DOC_RE.test(tab.path)) {
        fireToast(tRef.current('attach.needsSave'), { sticky: true })
        return
      }
      if (!window.api.capabilities?.fileAttachments) {
        fireToast(tRef.current('attach.unsupported'), { sticky: true })
        return
      }
      const picked = await window.api.openAttachments?.()
      if (!picked?.length) return
      const links = []
      for (const sourcePath of picked) {
        const res = await window.api.saveAttachment?.(tab.path, sourcePath)
        if (!res?.ok) {
          fireToast(tRef.current('attach.failed', { msg: res?.error || baseName(sourcePath) }), {
            kind: 'error',
            sticky: true
          })
          return
        }
        links.push(attachmentLinkMarkdown(res.name || baseName(sourcePath), res.path))
      }
      const markdown = links.join('\n')
      const sourceApi = id === activeIdRef.current && sourceModeRef.current
        ? sourceRef.current?.__hmSourceApi
        : null
      const inserted = sourceApi?.insertMarkdown?.(markdown) || editorApis.current[id]?.insertMarkdown?.(markdown)
      if (!inserted) {
        fireToast(tRef.current('attach.failed', { msg: 'Editor is still loading.' }), {
          kind: 'error',
          sticky: true
        })
        return
      }
      fireToast(tRef.current('attach.inserted', { n: links.length }))
    },
    exportPdf: async () => {
      const id = pickEditableId()
      const html = editorApis.current[id]?.getDocHTML?.()
      if (!html) {
        window.alert(tRef.current('error.exportPdfUnavailable'))
        return
      }
      const tab = tabs.find((x) => x.id === id)
      const base = (tab?.title || 'Untitled').replace(/\.(md|markdown|mdx|txt)$/i, '')
      await window.api.exportPDF(html, base + '.pdf', {
        fontWriteEn: settings.fontWriteEn,
        fontWriteZh: settings.fontWriteZh,
        fontWriteJa: settings.fontWriteJa,
        fontMono: settings.fontMono
      })
    },
    exportHtml: async () => {
      const id = pickEditableId()
      const html = editorApis.current[id]?.getDocHTML?.()
      if (!html) {
        window.alert(tRef.current('error.exportPdfUnavailable'))
        return
      }
      const tab = tabs.find((x) => x.id === id)
      const base = (tab?.title || 'Untitled').replace(/\.(md|markdown|mdx|txt)$/i, '')
      await window.api.exportHTML?.(html, base + '.html', base, {
        fontWriteEn: settings.fontWriteEn,
        fontWriteZh: settings.fontWriteZh,
        fontWriteJa: settings.fontWriteJa,
        fontMono: settings.fontMono
      })
    },
    print: async () => {
      const id = pickEditableId()
      const html = editorApis.current[id]?.getDocHTML?.()
      if (!html) {
        window.alert(tRef.current('error.printUnavailable'))
        return
      }
      await window.api.printHTML?.(html, {
        fontWriteEn: settings.fontWriteEn,
        fontWriteZh: settings.fontWriteZh,
        fontWriteJa: settings.fontWriteJa,
        fontMono: settings.fontMono
      })
    },
    closeTab: () => activeId && closeTab(activeId),
    reopenClosedTab: restoreClosedTab,
    previousTab: () => stepSequentialTab(-1),
    nextTab: () => stepSequentialTab(1),
    undoKeep: () => runKeepHistory('undo'),
    redoKeep: () => runKeepHistory('redo'),
    reviewKeep: () => openKeepReview(),
    localHistory: () => openLocalHistory(),
    tableCommand: (command) => runKeepTableCommand(command),
    blockCommand: (command) => runKeepBlockCommand(command),
    navigateBack: () => navigateHistory('back'),
    navigateForward: () => navigateHistory('forward'),
    palette: () => setPaletteOpen((v) => !v),
    toggleZen: () => {
      setZenReveal(false)
      setZenMode((enabled) => !enabled)
    },
    toggleSidebar: () => setSidebarOpen((v) => !v),
    toggleOutline: () => {
      setSidebarMode('outline')
      setSidebarOpen(true)
    },
    toggleFiles: () => {
      setSidebarMode('files')
      setSidebarOpen(true)
    },
    searchWorkspace: () => {
      setSidebarMode('search')
      setSidebarOpen(true)
      setSearchFocusNonce((n) => n + 1)
    },
    linkProblems: () => openProblemsPanel(),
    findReferences: () => findCurrentReferencesRef.current(),
    renameHeading: () => beginHeadingRenameRef.current(),
    toggleSource,
    toggleEditorMode,
    toggleTheme: cycleTheme,
    // Overall editor zoom — also the View menu's zoom items (repurposed from
    // Electron's whole-window webFrame zoom to this content-only zoom).
    zoomIn: () => bumpZoom(ZOOM_STEP),
    zoomOut: () => bumpZoom(-ZOOM_STEP),
    zoomReset: () => setSettings((prev) => ({ ...prev, zoom: DEFAULT_ZOOM })),
    find: () => {
      openFindRef.current?.()
    },
    replace: () => {
      openFindRef.current?.(true)
    },
    settings: () => setSettingsOpen(true)
  }

  // Stable callbacks for the memoized status bar / save FAB: they read live
  // state through refs (handlers, tabsRef, activeIdRef) so their identity never
  // changes and typing doesn't force those components to re-render.
  const onStatusSave = useCallback(() => handlers.current.save(), [])
  const onStatusUndoKeep = useCallback(
    () => runKeepHistory('undo', activeIdRef.current),
    [runKeepHistory]
  )
  const onStatusRedoKeep = useCallback(
    () => runKeepHistory('redo', activeIdRef.current),
    [runKeepHistory]
  )
  const onStatusReviewKeep = useCallback(
    () => openKeepReview(activeIdRef.current),
    [openKeepReview]
  )
  const onStatusShare = useCallback(() => {
    const tab = tabsRef.current.find((x) => x.id === activeIdRef.current)
    if (!tab) return
    if (!tab.path) {
      fireToast(tRef.current('save.shareNeedsSave'), { sticky: true })
      return
    }
    window.api.shareFile?.(tab.path)
  }, [])
  const onToggleKeep = useCallback(() => {
    dismissModeHint()
    handlers.current.toggleEditorMode()
  }, [dismissModeHint])
  const onOpenThemesFolder = useCallback(() => window.api.themesReveal?.(), [])
  const onGetMoreThemes = useCallback(() => window.api.openExternal('https://theme.typora.io/'), [])
  const onSetPageWidth = useCallback((w) => updateSettings({ pageWidth: w }), [updateSettings])
  const onSetFontSize = useCallback((s) => updateSettings({ fontSize: s }), [updateSettings])
  const onSetZoom = useCallback((z) => updateSettings({ zoom: normalizeZoom(z) }), [updateSettings])
  const onSetLineHeight = useCallback((v) => updateSettings({ lineHeight: v }), [updateSettings])
  const onSetParagraphSpacing = useCallback(
    (v) => updateSettings({ paragraphSpacing: v }),
    [updateSettings]
  )
  const onPaletteClose = useCallback(() => setPaletteOpen(false), [])
  const onKeepFindReferences = useCallback(
    (context) => findCurrentReferencesRef.current(context),
    []
  )
  const onKeepRenameHeading = useCallback(
    (context) => beginHeadingRenameRef.current(context),
    []
  )
  const onPaletteOpenFile = useCallback(
    (p) => {
      rememberNavigationRef.current()
      openPaths([p])
      if (isMobile) setSidebarOpen(false)
    },
    [openPaths, isMobile]
  )

  useEffect(() => {
    const offMenu = window.api.onMenu((cmd) => handlers.current[cmd]?.())
    const offOpen = window.api.onOpenPaths((paths) => openPaths(paths, false, { followSidebar: true }))
    // A folder path arriving from Explorer's "Open with EasyMarkdown" folder menu.
    const offFolder = window.api.onOpenFolderPath?.((dir) => {
      // never open a relative path as a workspace; add as a new root (kept alongside any existing ones)
      addWorkspace(dir)
    })
    const onOpenFolderEvt = () => openFolder()
    window.addEventListener('mm:openFolder', onOpenFolderEvt)
    // Main asks before the window closes so we can warn about unsaved changes.
    const offClose = window.api.onAppCloseRequest?.(() => {
      // Flush the latest session before we (maybe) quit, so a recent edit that's
      // still inside the debounce window isn't lost.
      flushSession()
      const dirty = tabsRef.current.some(hasUnsavedTab)
      if (!dirty || window.confirm(tRef.current('confirm.quitUnsaved'))) {
        window.api.confirmAppClose()
      } else {
        window.api.cancelAppClose?.()
      }
    })
    // Listeners are registered — let main flush any launch files it queued (on
    // a cold start this point can be reached long after ready-to-show fired).
    window.api.rendererReady?.()
    return () => {
      offMenu()
      offOpen()
      offFolder?.()
      offClose?.()
      window.removeEventListener('mm:openFolder', onOpenFolderEvt)
    }
  }, [openPaths, openFolder, addWorkspace, flushSession, hasUnsavedTab])

  // --- Drop OS files/folders onto the window to open them ---
  // A markdown (or any) file dragged from the Finder/Explorer onto the app
  // opens as a tab; a dropped folder opens as the workspace. Handlers run in
  // the CAPTURE phase so we beat ProseMirror's own drop handling, and we always
  // preventDefault on a file drop — otherwise Electron navigates the window to
  // file://… and the whole app is replaced. Image files dropped into the
  // writing area are left to the editor's own insert handling (Editor.jsx).
  useEffect(() => {
    const isFileDrag = (e) => e.dataTransfer?.types?.includes('Files')
    const onDragOver = (e) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e) => {
      const dt = e.dataTransfer
      if (!isFileDrag(e)) return
      e.preventDefault() // block the navigate-to-file default, always
      const inEditor = e.target.closest?.('.milkdown, .ProseMirror, .cm-editor, textarea')
      // webkitGetAsEntry() must be read synchronously, before any await, while
      // the DataTransfer is still live.
      const items = [...(dt.items || [])]
      const dirs = []
      const files = []
      ;[...(dt.files || [])].forEach((f, i) => {
        if (items[i]?.webkitGetAsEntry?.()?.isDirectory) dirs.push(f)
        else files.push(f)
      })
      // Images dropped onto the writing area belong to the editor — skip them.
      const docFiles = files.filter((f) => !(inEditor && f.type.startsWith('image/')))
      if (!dirs.length && !docFiles.length) return
      e.stopPropagation()
      // Each dropped folder is added as a new root, alongside any already open.
      dirs.forEach((d) => addWorkspace(window.api.pathForFile(d)))
      const paths = docFiles.map((f) => window.api.pathForFile(f)).filter(Boolean)
      if (paths.length) openPaths(paths, false, { followSidebar: true })
    }
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [openPaths, addWorkspace])

  // Ctrl/Cmd+Tab opens an MRU switcher without changing the document under the
  // user's hands until the modifier is released. Enter commits, Esc cancels;
  // Ctrl/Cmd+PageUp/PageDown preserves deterministic strip-order navigation.
  useEffect(() => {
    const onKeyDown = (e) => {
      const modifier = e.ctrlKey || e.metaKey
      if (
        modifier &&
        e.shiftKey &&
        !e.altKey &&
        (e.code === 'KeyT' || e.key.toLowerCase() === 't')
      ) {
        e.preventDefault()
        e.stopPropagation()
        handlers.current.reopenClosedTab()
        return
      }
      if (modifier && !e.altKey && e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        openOrStepTabSwitcher(
          e.shiftKey ? -1 : 1,
          e.metaKey ? 'Meta' : 'Control'
        )
        return
      }
      const current = tabSwitcherRef.current
      if (current) {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          cancelTabSwitcher()
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          commitTabSwitcher()
          return
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          e.stopPropagation()
          updateTabSwitcher({
            ...current,
            index: stepWrappedIndex(
              current.index,
              e.key === 'ArrowDown' ? 1 : -1,
              current.ids.length
            )
          })
          return
        }
      }
      if (
        modifier &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'PageUp' || e.key === 'PageDown')
      ) {
        e.preventDefault()
        e.stopPropagation()
        stepSequentialTab(e.key === 'PageDown' ? 1 : -1)
      }
    }
    const onKeyUp = (e) => {
      const current = tabSwitcherRef.current
      if (current && e.key === current.releaseKey) commitTabSwitcher()
    }
    const onBlur = () => cancelTabSwitcher()
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [
    cancelTabSwitcher,
    commitTabSwitcher,
    openOrStepTabSwitcher,
    stepSequentialTab,
    updateTabSwitcher
  ])

  // Ctrl/Cmd+B toggles the sidebar. Handled here in the CAPTURE phase so it
  // fires before the editor's "bold" keybinding (which would otherwise eat it
  // and made the shortcut feel unreliable). No menu accelerator, so it can't
  // double-fire either.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyB') {
        e.preventDefault()
        e.stopPropagation()
        handlers.current.toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Ctrl/Cmd+0 means two different things depending on where the caret is:
  // inside the rich editor it turns the current block back into a paragraph
  // (completing the Ctrl+1…6 heading set), everywhere else it resets the zoom.
  // A menu accelerator can't express that — and it wouldn't merely lose the
  // race, it would ALSO fire, so pressing Ctrl+0 to un-heading a block used to
  // silently reset your zoom as well. So zoomReset carries no accelerator (see
  // the View menu) and both meanings are resolved here, in the capture phase,
  // by looking at where the event came from. Editor.jsx keeps its own Ctrl+0
  // listener on view.dom; we simply decline to handle the event for it.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.code !== 'Digit0') return
      if (e.target?.closest?.('.ProseMirror')) return // rich editor → convert to paragraph
      e.preventDefault()
      e.stopPropagation()
      handlers.current.zoomReset()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    const paths = (session.openPaths || []).filter(Boolean)
    const untitled = (session.untitled || []).filter((u) => u && (u.content || '').trim())
    // Recreate unsaved scratch tabs (no path) from the last session.
    const addUntitled = () => {
      if (!untitled.length) return null
      const created = untitled.map((u) => ({
        id: genId(),
        path: null,
        title: u.title || tRef.current('tab.untitled'),
        content: u.content,
        // No prior save, so the baseline is empty → the tab shows as unsaved.
        savedContent: '',
        mtimeMs: null,
        reloadNonce: 0,
        heavy: isHeavyDoc(u.content)
      }))
      tabsRef.current = [...tabsRef.current, ...created]
      setTabs((prev) => [...prev, ...created])
      // Restored scratch docs are new (unsaved) markdown → Milkdown WYSIWYG.
      setMilkdownForced((prev) => {
        const next = new Set(prev)
        created.forEach((c) => next.add(c.id))
        return next
      })
      return created
    }
    if (paths.length) {
      // Restore strategy (was: read all N files sequentially, THEN activate the
      // last one — so the UI froze until every tab finished loading and focus
      // jumped to the wrong tab). Now, browser-style "sleeping tabs":
      //   1. Create lightweight PLACEHOLDER tabs for every path synchronously, in
      //      the saved order — the tab bar appears instantly and order is kept.
      //   2. Activate the previously-active tab (unless a double-clicked launch
      //      file already grabbed focus via `open-paths` → explicitOpenRef).
      //   3. Read ONLY the active tab from disk (the activation effect below); the
      //      rest stay asleep (empty `loading` placeholders) and are read the
      //      moment the user visits them. A restart with 20 tabs reads 1 file.
      const priorityPath =
        session.activePath && paths.includes(session.activePath) ? session.activePath : paths[0]
      const pinnedSet = new Set(session.pinnedPaths || [])
      const previewSet = new Set(session.previewPaths || [])
      const placeholders = paths.map((p) => ({
        id: genId(),
        path: p,
        title: baseName(p),
        content: '',
        savedContent: '',
        mtimeMs: null,
        reloadNonce: 0,
        heavy: false,
        pinned: pinnedSet.has(p),
        preview: previewSet.has(p) && !pinnedSet.has(p),
        loading: true // not yet read from disk; filled lazily on activation
      }))
      tabsRef.current = [...tabsRef.current, ...placeholders]
      setTabs((prev) => [...prev, ...placeholders])
      const priorityTab = placeholders.find((t) => t.path === priorityPath)
      if (priorityTab && !explicitOpenRef.current) {
        setActiveId(priorityTab.id)
        setHome(false)
      }
      addUntitled()
      // No eager loading: the active placeholder is filled by the activation
      // effect below; the rest stay asleep until the user visits them.
    } else {
      const created = addUntitled()
      if (created && created.length) setActiveId(created[0].id)
    }
    setStartupRestored(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lazily wake a sleeping restored tab: whenever a `loading` placeholder becomes
  // visible — the active tab (initial priority tab, a tab the user clicks, or a
  // double-clicked launch file) OR the split pane's tab — read its file from disk
  // then. fillTab no-ops on already-loaded tabs, so this is safe to fire on every
  // activation/split change.
  useEffect(() => {
    for (const id of [activeId, splitId]) {
      const tab = id != null && tabsRef.current.find((t) => t.id === id)
      if (tab && tab.loading) fillTab(tab.id)
    }
  }, [activeId, splitId, fillTab])

  // --------------------------- persistence -------------------------
  useEffect(() => {
    const data = {
      workspaces,
      // Keep the legacy single field as the first root, so downgrading to an older
      // build still opens (at least) one of the folders instead of nothing.
      workspace: workspaces[0] || null,
      theme,
      customTheme,
      lang,
      recents,
      sidebarOpen,
      sidebarMode,
      sidebarWidth,
      closedTabs,
      // openPaths (saved tabs, reopened from disk) + untitled (dirty, non-blank
      // scratch tabs, so the untouched welcome doc / empty new tabs don't keep
      // coming back). Pure + unit-tested — see buildSessionTabs in paths.js.
      ...buildSessionTabs(tabs),
      activePath
    }
    sessionRef.current = data
    // Skip the write entirely when nothing persistable changed since the last
    // WRITTEN snapshot — typing in a saved file re-runs this effect per
    // keystroke, but the snapshot's contents are identical (content of saved
    // tabs isn't persisted), so stringify + localStorage would be pure waste.
    if (sessionSnapshotEqual(lastWrittenSessionRef.current, data)) return
    // Debounce the write: this effect runs on every keystroke (tabs/content
    // change), and JSON.stringify-ing the whole session — including the full
    // text of large unsaved scratch docs — plus a synchronous localStorage write
    // on every keypress is enough to make typing in big documents stutter. Wait
    // for a brief pause, then write once. The close path flushes the last edit.
    const id = setTimeout(flushSession, 400)
    return () => clearTimeout(id)
  }, [
    workspaces,
    theme,
    customTheme,
    lang,
    recents,
    sidebarOpen,
    sidebarMode,
    sidebarWidth,
    closedTabs,
    tabs,
    activePath,
    flushSession
  ])

  // Flush the pending session snapshot immediately when the window is closing,
  // so the debounce above never drops the user's last few keystrokes.
  useEffect(() => {
    window.addEventListener('pagehide', flushSession)
    window.addEventListener('beforeunload', flushSession)
    return () => {
      window.removeEventListener('pagehide', flushSession)
      window.removeEventListener('beforeunload', flushSession)
    }
  }, [flushSession])

  // ------------------------- update check (notify-only) ------------
  useEffect(() => {
    let alive = true
    // Delayed a few seconds: the check itself is async (net.fetch in main), but
    // firing it at mount competes with session restore / first document read
    // for main-process time during the busiest startup window. Nothing about a
    // notify-only update is urgent.
    const timer = setTimeout(() => {
      window.api.checkUpdate?.().then((r) => {
        if (!alive || !r?.ok || !r.latest) return
        const dismissed = localStorage.getItem(UPDATE_DISMISS_KEY)
        if (isNewerVersion(r.latest, r.current) && r.latest !== dismissed) {
          setUpdate({ latest: r.latest, current: r.current, url: r.url, notes: r.notes, name: r.name })
        }
      }).catch(() => {})
    }, 4000)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  // Lightweight transient toast (copy feedback, etc.). Any component can fire one
  // via `fireToast(msg)` from ui.js.
  useEffect(() => {
    let timer = null
    const onToast = (e) => {
      const d = e?.detail
      const msg = typeof d === 'string' ? d : d?.msg
      const sticky = typeof d === 'object' && !!d?.sticky
      const duration = typeof d === 'object' ? d?.duration : undefined
      const kind = typeof d === 'object' ? d?.kind : undefined
      const actionLabel = typeof d === 'object' ? d?.actionLabel : undefined
      const onAction = typeof d === 'object' ? d?.onAction : undefined
      if (!msg) return
      setToast({ msg, key: Date.now() + Math.random(), sticky, kind, actionLabel, onAction })
      clearTimeout(timer)
      // duration wins; otherwise sticky stays until ✕, plain toasts hide quickly.
      const ms = duration || (sticky ? 0 : 1600)
      if (ms) timer = setTimeout(() => setToast(null), ms)
    }
    window.addEventListener(HM_TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(HM_TOAST_EVENT, onToast)
      clearTimeout(timer)
    }
  }, [])

  const dismissUpdate = useCallback(() => {
    setUpdate((u) => {
      if (u) localStorage.setItem(UPDATE_DISMISS_KEY, u.latest)
      return null
    })
  }, [])

  // ------------------------- first-run onboarding ------------------
  useEffect(() => {
    if (localStorage.getItem(ONBOARDED_KEY)) return
    localStorage.setItem(ONBOARDED_KEY, '1')
    // Only greet on a genuinely fresh start (no restored session — neither saved
    // files nor unsaved scratch tabs).
    if ((session.openPaths || []).filter(Boolean).length || (session.untitled || []).length) return
    const doc = welcomeDoc(session.lang || DEFAULT_LANG)
    const id = genId()
    setTabs((prev) => [
      ...prev,
      { id, path: null, title: doc.title, content: doc.content, savedContent: doc.content, mtimeMs: null, reloadNonce: 0 }
    ])
    // The welcome doc showcases the editor → render it in Milkdown WYSIWYG.
    setMilkdownForced((prev) => new Set(prev).add(id))
    setActiveId(id)
    // First run → point at the mode button and explain the two modes, once.
    if (!localStorage.getItem(MODEHINT_KEY)) setShowModeHint(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --------------------------- commands ----------------------------
  const commands = useMemo(
    () => {
      const caps = window.api.capabilities || {}
      const mod = window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'
      const shift = window.api.platform === 'darwin' ? '⇧' : 'Shift+'
      return [
        { id: 'cmd.new', title: t('cmd.new'), icon: 'file-plus', shortcut: `${mod}N`, run: () => handlers.current.new() },
        { id: 'cmd.open', title: t('cmd.open'), icon: 'file', shortcut: `${mod}O`, run: () => handlers.current.open() },
        { id: 'cmd.openFolder', title: t('cmd.openFolder'), icon: 'folder', shortcut: `${mod}${shift}O`, run: () => handlers.current.openFolder() },
        { id: 'cmd.save', title: t('cmd.save'), icon: 'save', shortcut: `${mod}S`, run: () => handlers.current.save() },
        { id: 'cmd.saveAs', title: t('cmd.saveAs'), icon: 'save', shortcut: `${mod}${shift}S`, run: () => handlers.current.saveAs() },
        { id: 'cmd.reopenClosedTab', title: t('cmd.reopenClosedTab'), icon: 'file', shortcut: `${mod}${shift}T`, run: () => handlers.current.reopenClosedTab() },
        { id: 'cmd.previousTab', title: t('cmd.previousTab'), icon: 'chevron-right', shortcut: `${mod}PageUp`, run: () => handlers.current.previousTab() },
        { id: 'cmd.nextTab', title: t('cmd.nextTab'), icon: 'chevron-right', shortcut: `${mod}PageDown`, run: () => handlers.current.nextTab() },
        { id: 'cmd.undoKeep', title: t('cmd.undoKeep'), icon: 'undo', shortcut: `${mod}Z`, run: () => handlers.current.undoKeep() },
        { id: 'cmd.redoKeep', title: t('cmd.redoKeep'), icon: 'undo', shortcut: `${mod}${shift}Z`, run: () => handlers.current.redoKeep() },
        { id: 'cmd.reviewKeep', title: t('keep.reviewChanges'), icon: 'outline', run: () => handlers.current.reviewKeep() },
        window.api.capabilities?.localHistory && { id: 'cmd.localHistory', title: t('history.command'), icon: 'history', run: () => handlers.current.localHistory() },
        { id: 'cmd.tableEdit', title: t('cmd.tableEdit'), icon: 'columns', run: () => handlers.current.tableCommand('edit') },
        { id: 'cmd.tableFilter', title: t('cmd.tableFilter'), icon: 'filter', run: () => handlers.current.tableCommand('filter') },
        { id: 'cmd.tableMore', title: t('cmd.tableMore'), icon: 'more', run: () => handlers.current.tableCommand('menu') },
        { id: 'cmd.tableRowAbove', title: t('cmd.tableRowAbove'), icon: 'plus', run: () => handlers.current.tableCommand('rowAbove') },
        { id: 'cmd.tableRowBelow', title: t('cmd.tableRowBelow'), icon: 'plus', run: () => handlers.current.tableCommand('rowBelow') },
        { id: 'cmd.tableRowDelete', title: t('cmd.tableRowDelete'), icon: 'close', run: () => handlers.current.tableCommand('rowDelete') },
        { id: 'cmd.tableColLeft', title: t('cmd.tableColLeft'), icon: 'columns', run: () => handlers.current.tableCommand('colLeft') },
        { id: 'cmd.tableColRight', title: t('cmd.tableColRight'), icon: 'columns', run: () => handlers.current.tableCommand('colRight') },
        { id: 'cmd.tableColDelete', title: t('cmd.tableColDelete'), icon: 'close', run: () => handlers.current.tableCommand('colDelete') },
        { id: 'cmd.blockInsertAbove', title: t('cmd.blockInsertAbove'), icon: 'plus', run: () => handlers.current.blockCommand('insertAbove') },
        { id: 'cmd.blockInsertBelow', title: t('cmd.blockInsertBelow'), icon: 'plus', run: () => handlers.current.blockCommand('insertBelow') },
        { id: 'cmd.blockDuplicate', title: t('cmd.blockDuplicate'), icon: 'file-plus', run: () => handlers.current.blockCommand('duplicate') },
        { id: 'cmd.blockDelete', title: t('cmd.blockDelete'), icon: 'close', run: () => handlers.current.blockCommand('delete') },
        { id: 'cmd.navigateBack', title: t('nav.back'), icon: 'chevron-right', shortcut: 'Alt+←', run: () => handlers.current.navigateBack() },
        { id: 'cmd.navigateForward', title: t('nav.forward'), icon: 'chevron-right', shortcut: 'Alt+→', run: () => handlers.current.navigateForward() },
        { id: 'cmd.toggleZen', title: t(zenMode ? 'cmd.exitZen' : 'cmd.enterZen'), icon: 'expand', shortcut: `${mod}K Z`, run: () => handlers.current.toggleZen() },
        caps.fileAttachments && { id: 'cmd.attach', title: t('cmd.attach'), icon: 'file-plus', run: () => handlers.current.attach() },
        // Export-to-PDF needs a save dialog / print pipeline that doesn't exist on mobile.
        caps.pdfExport && { id: 'cmd.exportPdf', title: t('cmd.exportPdf'), icon: 'file', run: () => handlers.current.exportPdf() },
        caps.htmlExport && { id: 'cmd.exportHtml', title: t('cmd.exportHtml'), icon: 'file', run: () => handlers.current.exportHtml() },
        caps.print && { id: 'cmd.print', title: t('cmd.print'), icon: 'file', run: () => handlers.current.print() },
        { id: 'cmd.sidebar', title: t('cmd.sidebar'), icon: 'sidebar', shortcut: `${mod}B`, run: () => handlers.current.toggleSidebar() },
        { id: 'cmd.files', title: t('cmd.files'), icon: 'folder', run: () => handlers.current.toggleFiles() },
        { id: 'cmd.outline', title: t('cmd.outline'), icon: 'outline', shortcut: `${mod}${shift}L`, run: () => handlers.current.toggleOutline() },
        { id: 'cmd.source', title: t('cmd.source'), icon: 'code', shortcut: `${mod}/`, run: () => handlers.current.toggleSource() },
        { id: 'cmd.toggleKeep', title: t('cmd.toggleKeep'), icon: 'shield', run: () => handlers.current.toggleEditorMode() },
        { id: 'cmd.theme', title: t('cmd.theme'), icon: 'moon', run: () => handlers.current.toggleTheme() },
        { id: 'cmd.find', title: t('cmd.find'), icon: 'search', shortcut: `${mod}F`, run: () => handlers.current.find() },
        { id: 'cmd.replace', title: t('cmd.replace'), icon: 'search', shortcut: window.api.platform === 'darwin' ? '⌥⌘F' : `${mod}H`, run: () => handlers.current.replace() },
        caps.workspaceSearch && { id: 'cmd.searchWorkspace', title: t('cmd.searchWorkspace'), icon: 'search', shortcut: `${mod}${shift}F`, run: () => handlers.current.searchWorkspace() },
        { id: 'cmd.linkProblems', title: t('links.problems'), icon: 'alert', shortcut: 'F8', run: () => handlers.current.linkProblems() },
        { id: 'cmd.findReferences', title: t('links.findReferences'), icon: 'search', run: () => handlers.current.findReferences() },
        { id: 'cmd.renameHeading', title: t('links.renameHeading'), icon: 'outline', shortcut: 'F2', run: () => handlers.current.renameHeading() },
        caps.spellcheck && {
          id: 'cmd.spell',
          title: t(settings.spellcheck ? 'cmd.spellOff' : 'cmd.spellOn'),
          icon: 'check',
          run: () => updateSettings({ spellcheck: !settings.spellcheck })
        },
        { id: 'cmd.settings', title: t('cmd.settings'), icon: 'settings', run: () => handlers.current.settings() }
      ].filter(Boolean)
    },
    [t, settings.spellcheck, updateSettings, zenMode]
  )

  // Discriminate the active view: the visible source <textarea> sets sourceRef;
  // otherwise we're in the rich editor. A previously-used hidden source pane does
  // not retain this ref.
  // Keep mode has no ProseMirror — fall back to the visible rendered `.km-doc`
  // so find still searches the document content there.
  const richRoot = () => {
    const pm = editorHostRef.current?.querySelector('.ProseMirror')
    if (pm) return pm
    const kms = editorAreaRef.current?.querySelectorAll('.km-doc') || []
    for (const km of kms) if (km.offsetParent !== null) return km // the on-screen one
    return null
  }

  // Capture where the user was working before the find input takes focus.
  // Milkdown uses its live ProseMirror selection head; keep mode has no caret,
  // so its visible viewport top becomes the stable start for this find session.
  const captureFindStart = () => {
    if (sourceRef.current) {
      const api = sourceRef.current.__hmSourceApi
      const selection = api?.getFullSelection?.()
      return {
        kind: 'source',
        offset: selection?.end ?? api?.getViewportOffset?.() ?? 0
      }
    }
    const root = richRoot()
    if (!root) return null

    if (root.classList.contains('ProseMirror')) {
      const view = editorApis.current[activeIdRef.current]?.getView?.()
      const head = view?.state?.selection?.head
      if (view && Number.isFinite(head)) {
        try {
          const point = view.domAtPos(head)
          const range = document.createRange()
          range.setStart(point.node, point.offset)
          range.collapse(true)
          return { kind: 'cursor', range }
        } catch {
          // Fall through to the native selection when a node view cannot map
          // the ProseMirror position directly to a DOM boundary.
        }
      }

      const selection = window.getSelection?.()
      const node = selection?.focusNode
      const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
      if (selection && node && (node === root || el === root || root.contains(el))) {
        try {
          const range = document.createRange()
          range.setStart(node, selection.focusOffset)
          range.collapse(true)
          return { kind: 'cursor', range }
        } catch {
          return null
        }
      }
      return null
    }

    const scroller = root.closest('.editor-scroll')
    return scroller ? { kind: 'viewport', scroller, scrollTop: scroller.scrollTop } : null
  }

  const findQueryRef = useRef('')
  const activeIdxRef = useRef(-1)
  const findModeRef = useRef('text')
  const lineBiRef = useRef(-1) // last located block index (line mode)
  useEffect(() => { findModeRef.current = find.mode }, [find.mode])
  useEffect(() => {
    findOptionsRef.current = {
      caseSensitive: find.caseSensitive,
      wholeWord: find.wholeWord,
      regex: find.regex,
      inSelection: find.inSelection
    }
  }, [find.caseSensitive, find.wholeWord, find.regex, find.inSelection])

  const activeFindKey = () => activeIdRef.current || '__home'

  const saveFindSession = (patch) => {
    const key = activeFindKey()
    findSessionsRef.current[key] = {
      ...(findSessionsRef.current[key] || {}),
      ...patch
    }
  }

  const activeFindScope = () => findScopesRef.current[activeFindKey()] || null

  const saveFindScope = (scope) => {
    const key = activeFindKey()
    if (scope) findScopesRef.current[key] = scope
    return findScopesRef.current[key] || null
  }

  const selectFindInputSoon = () => {
    setTimeout(() => {
      const input = findInputRef.current
      if (!input) return
      input.focus()
      input.select()
    }, 0)
  }

  const normalizeSelectedFindText = (value) => {
    const text = String(value ?? '').replace(/\r\n?/g, '\n').trim()
    if (!text) return ''
    return text.split('\n').map((line) => line.trim()).find(Boolean) || ''
  }

  const getSelectedFindScope = () => {
    const source = sourceRef.current
    if (
      source &&
      document.activeElement === source &&
      source.selectionStart != null &&
      source.selectionEnd != null &&
      source.selectionStart !== source.selectionEnd
    ) {
      const fullSelection = source.__hmSourceApi?.getFullSelection?.()
      const start = Math.min(fullSelection?.start ?? source.selectionStart, fullSelection?.end ?? source.selectionEnd)
      const end = Math.max(fullSelection?.start ?? source.selectionStart, fullSelection?.end ?? source.selectionEnd)
      const fullValue = source.__hmSourceApi?.getFullValue?.() ?? source.value
      const text = normalizeSelectedFindText(fullValue.slice(start, end))
      return text ? { text, source: { start, end } } : null
    }

    const root = richRoot()
    const sel = window.getSelection?.()
    if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return null

    const isInsideRoot = (node) => {
      if (!node) return false
      if (node === root) return true
      const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
      return el === root || root.contains(el)
    }
    if (!isInsideRoot(sel.anchorNode) || !isInsideRoot(sel.focusNode)) return null
    const text = normalizeSelectedFindText(sel.toString())
    if (!text) return null
    return { text, range: sel.getRangeAt(0).cloneRange() }
  }

  const matchInSource = (text, query, options, scope) => {
    const result = findMatchesInText(text, query, options)
    if (result.error || !options.inSelection || !scope?.source) return result
    const { start, end } = scope.source
    return {
      ...result,
      matches: result.matches.filter((m) => m.index >= start && m.index + m.length <= end)
    }
  }

  // Run a fresh search for `query`, scoped to the editor content.
  const runFind = useCallback((query, optionsArg = null, preferredActiveIdx = null, behavior = {}) => {
    const q = query ?? ''
    const options = optionsArg || findOptionsRef.current
    const scope = options.inSelection ? activeFindScope() : null
    findQueryRef.current = q
    clearFindHighlights()
    clearSourceFindHighlight(sourceFindTextareaRef.current || sourceRef.current)
    sourceFindTextareaRef.current = null
    findRangesRef.current = []
    activeIdxRef.current = -1
    let nextMatches = 0
    let nextActiveIdx = -1
    let error = ''

    if (sourceRef.current) {
      const source = sourceRef.current
      const sourceText = source.__hmSourceApi?.getFullValue?.() ?? source.value
      const result = q ? matchInSource(sourceText, q, options, scope) : { matches: [], error: '' }
      const hits = result.matches
      findRangesRef.current = hits
      error = result.error
      nextMatches = error ? 0 : hits.length
      if (nextMatches) {
        if (preferredActiveIdx != null) {
          nextActiveIdx = Math.min(Math.max(0, preferredActiveIdx), nextMatches - 1)
        } else {
          const start = findStartRef.current?.kind === 'source' ? findStartRef.current.offset : 0
          nextActiveIdx = hits.findIndex((match) => match.index >= start)
          if (nextActiveIdx < 0) nextActiveIdx = 0
        }
        activeIdxRef.current = nextActiveIdx
        const start = hits[nextActiveIdx].index
        const end = start + hits[nextActiveIdx].length
        if (behavior.reveal === false) paintSourceFindHighlight(source, start, end)
        else revealSourceFindMatch(source, start, end)
        sourceFindTextareaRef.current = source
      }
      setFind((f) => ({
        ...f,
        query: q,
        matches: nextMatches,
        active: nextActiveIdx >= 0 ? nextActiveIdx + 1 : 0,
        error
      }))
      saveFindSession({ query: q, mode: 'text', activeIdx: nextActiveIdx, inSelection: !!options.inSelection })
      return
    }
    // Keep mode paints in chunks after open; flush the rest so find sees the whole
    // document, not just the first painted chunk.
    if (q) editorApis.current[activeIdRef.current]?.ensureRendered?.()
    const root = richRoot()
    const result = q ? findRangesInEl(root, q, options, scope?.range || null) : { ranges: [], error: '' }
    const ranges = result.ranges
    findRangesRef.current = ranges
    error = result.error
    if (ranges.length) {
      nextActiveIdx =
        preferredActiveIdx == null
          ? findRangeIndexFromStart(ranges, findStartRef.current)
          : Math.min(Math.max(0, preferredActiveIdx), ranges.length - 1)
      activeIdxRef.current = nextActiveIdx
      paintFindHighlights(ranges, nextActiveIdx)
      if (behavior.reveal !== false) {
        scrollRangeIntoView(ranges[nextActiveIdx], root.closest('.editor-scroll'))
      }
    }
    nextMatches = error ? 0 : ranges.length
    setFind((f) => ({
      ...f,
      query: q,
      matches: nextMatches,
      active: nextActiveIdx >= 0 ? nextActiveIdx + 1 : 0,
      error
    }))
    saveFindSession({ query: q, mode: 'text', activeIdx: nextActiveIdx, inSelection: !!options.inSelection })
    // Reads current editor/session refs; keeping this stable avoids re-wiring the
    // debounced find path on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live "highlight as you type" walks the whole editor DOM, so debounce it: clear
  // instantly on empty (feels responsive), otherwise coalesce keystrokes. Enter /
  // next / prev still call runFind/stepFind directly for an immediate jump.
  const findDebounceRef = useRef(0)
  const runFindDebounced = useCallback((q) => {
    clearTimeout(findDebounceRef.current)
    if (!q) { runFind(''); return }
    findDebounceRef.current = setTimeout(() => runFind(q), 160)
  }, [runFind])

  // Keep mode emits only after an edit is confirmed; Milkdown emits on every
  // document transaction. Coalesce the latter so a burst of keystrokes causes
  // one DOM scan, then repaint highlights/count without scrolling the editor
  // away from the user's caret. Heavy documents do not enter Milkdown by
  // default, which keeps this bounded to the editor sizes Crepe can handle.
  const queueFindRefreshAfterEdit = useCallback((editedId) => {
    if (
      editedId !== activeIdRef.current ||
      !findOpenRef.current ||
      findModeRef.current !== 'text'
    ) return
    const query = findInputRef.current?.value ?? findQueryRef.current
    if (!query) return

    clearTimeout(findEditDebounceRef.current)
    findEditDebounceRef.current = setTimeout(() => {
      if (
        editedId !== activeIdRef.current ||
        !findOpenRef.current ||
        findModeRef.current !== 'text'
      ) return
      const liveQuery = findInputRef.current?.value ?? findQueryRef.current
      if (!liveQuery) return
      const preferredIdx = activeIdxRef.current >= 0 ? activeIdxRef.current : null
      runFind(liveQuery, findOptionsRef.current, preferredIdx, { reveal: false })
    }, 160)
  }, [runFind])
  refreshFindAfterEditRef.current = queueFindRefreshAfterEdit

  useEffect(() => () => clearTimeout(findEditDebounceRef.current), [])

  const rememberFindQuery = (query) => {
    const q = String(query ?? '').trim()
    if (!q || findModeRef.current !== 'text') return
    const history = findHistoryRef.current.filter((item) => item !== q)
    history.push(q)
    findHistoryRef.current = history.slice(-20)
    findHistoryCursorRef.current = -1
    findHistoryDraftRef.current = ''
  }

  const applyFindQuery = (query, options = {}) => {
    const q = String(query ?? '')
    if (!options.fromHistory) {
      findHistoryCursorRef.current = -1
      findHistoryDraftRef.current = ''
    }
    setFind((f) => ({ ...f, query: q, error: '' }))
    saveFindSession({ query: q, mode: findModeRef.current, activeIdx: -1 })
    if (findModeRef.current === 'line') runLineJump(q, false)
    else if (options.immediate) runFind(q)
    else runFindDebounced(q)
  }

  const recallFindHistory = (backwards) => {
    const history = findHistoryRef.current
    if (!history.length || findModeRef.current !== 'text') return false
    if (findHistoryCursorRef.current === -1) {
      findHistoryDraftRef.current = findInputRef.current?.value ?? find.query ?? ''
    }

    let next = findHistoryCursorRef.current
    if (backwards) next = next === -1 ? history.length - 1 : Math.max(0, next - 1)
    else if (next === -1) return false
    else next += 1

    if (next >= history.length) {
      findHistoryCursorRef.current = -1
      applyFindQuery(findHistoryDraftRef.current)
      return true
    }

    findHistoryCursorRef.current = next
    applyFindQuery(history[next], { fromHistory: true })
    setTimeout(() => {
      const input = findInputRef.current
      if (!input) return
      input.setSelectionRange(input.value.length, input.value.length)
    }, 0)
    return true
  }

  // Move to the next / previous match (wrapping around).
  const stepFind = useCallback((backwards = false) => {
    const items = findRangesRef.current
    if (!items.length) return
    let i = activeIdxRef.current + (backwards ? -1 : 1)
    if (i < 0) i = items.length - 1
    if (i >= items.length) i = 0
    activeIdxRef.current = i
    if (sourceRef.current) {
      const el = sourceRef.current
      const item = items[i]
      const start = typeof item === 'number' ? item : item.index
      const length = typeof item === 'number' ? findQueryRef.current.length : item.length
      revealSourceFindMatch(el, start, start + length)
      sourceFindTextareaRef.current = el
    } else {
      paintFindHighlights(items, i)
      scrollRangeIntoView(items[i], richRoot()?.closest('.editor-scroll'))
    }
    setFind((f) => ({ ...f, active: i + 1 }))
    saveFindSession({ activeIdx: i, mode: 'text' })
    // Uses refs for the active result set and visible editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stepTextFind = useCallback((backwards = false) => {
    const inputValue = findInputRef.current?.value
    const q = inputValue != null ? inputValue : find.query || findQueryRef.current
    if (!q) {
      runFind('')
      return false
    }

    clearTimeout(findDebounceRef.current)
    rememberFindQuery(q)
    const needsFreshSearch = q !== findQueryRef.current || !findRangesRef.current.length
    if (needsFreshSearch) {
      runFind(q)
      if (findRangesRef.current.length && (backwards || sourceRef.current)) stepFind(backwards)
      return true
    }

    stepFind(backwards)
    return true
  }, [find.query, runFind, stepFind])

  // ── Replace ──
  // Replace operates on the tab's MARKDOWN SOURCE (find & replace must keep the
  // keep-mode round-trip guarantee), then writes back through the same
  // content + reloadNonce patch external reloads use, so whichever editor is
  // mounted (rich / keep / textarea) re-reads the new content. For replace-one
  // in the rich/keep view, the active DOM-range ordinal is used as the source
  // ordinal — they line up for plain-text queries; when the rendered view and
  // the source disagree (markdown syntax inside the match), counts may differ
  // and the ordinal is clamped.
  const applyReplace = (all) => {
    if (findModeRef.current !== 'text') return
    const q = findInputRef.current?.value ?? findQueryRef.current
    if (!q) return
    const tab = tabsRef.current.find((x) => x.id === activeIdRef.current)
    if (!tab || tab.loading) return
    const options = findOptionsRef.current
    // "In selection" maps to source offsets only in the source editor; in the
    // rich/keep view the DOM scope has no source coordinates, so replace works
    // on the whole document there.
    const scope = options.inSelection ? activeFindScope() : null
    const onlyIndex = all ? null : Math.max(0, activeIdxRef.current)
    const result = replaceMatchesInText(
      tab.content, q, find.replace,
      { ...options, range: scope?.source || null },
      onlyIndex
    )
    if (result.error) {
      setFind((f) => ({ ...f, error: result.error }))
      return
    }
    if (!result.count) return
    rememberFindQuery(q)
    const patch = (t) =>
      t.id === tab.id
        ? { ...t, content: result.text, reloadNonce: t.reloadNonce + 1, heavy: isHeavyDoc(result.text) }
        : t
    tabsRef.current = tabsRef.current.map(patch)
    setTabs((prev) => prev.map(patch))
    if (all) fireToast(tRef.current('find.replacedCount', { n: result.count }))
    // Re-run the search once the editor has remounted with the new content, so
    // the highlights/count reflect the post-replace document and replace-one can
    // be pressed repeatedly. (Keep mode paints in chunks; runFind flushes it.)
    clearFindHighlights()
    findRangesRef.current = []
    activeIdxRef.current = -1
    setTimeout(() => runFind(q, options, all ? 0 : onlyIndex), 90)
  }

  // ── Line-number locate ──
  // Briefly highlight a preview block (display-only class) and scroll it center.
  const flashBlock = (el) => {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('hm-line-flash')
    void el.offsetWidth // restart the animation if the same block is re-targeted
    el.classList.add('hm-line-flash')
    window.setTimeout(() => el.classList.remove('hm-line-flash'), 1500)
  }

  // Jump the preview to the block that renders markdown source line `raw`. In
  // source mode this is an exact line jump; in keep/rich mode it resolves the
  // containing top-level block (`.km-block[data-bi]` / Nth .ProseMirror child).
  // `commit` (Enter/next/prev) is allowed to steal focus to show a text selection;
  // live typing (commit=false) only scrolls so the find input keeps focus.
  const runLineJump = useCallback((raw, commit = false) => {
    const str = String(raw ?? '').trim()
    findQueryRef.current = str
    saveFindSession({ query: str, mode: 'line', activeIdx: -1, inSelection: false })
    if (sourceRef.current) {
      const el = sourceRef.current
      const api = el.__hmSourceApi
      const lines = (api?.getFullValue?.() || el.value).split('\n')
      const total = api?.getLineCount?.() || lines.length
      const n = parseInt(str, 10)
      if (!str || !Number.isFinite(n)) { setFind((f) => ({ ...f, matches: total, active: 0 })); return }
      if (commit) rememberNavigationRef.current()
      const ln = Math.min(Math.max(1, n), total)
      if (api?.scrollToLine) {
        api.scrollToLine(ln, commit)
      } else {
        const cs = getComputedStyle(el)
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20
        el.scrollTop = Math.max(0, (ln - 1) * lh - el.clientHeight / 2)
        let off = 0
        for (let k = 0; k < ln - 1; k++) off += lines[k].length + 1
        if (commit) {
          el.focus()
          el.setSelectionRange(off, off + lines[ln - 1].length)
        }
      }
      setFind((f) => ({ ...f, matches: total, active: ln }))
      return
    }
    const tab = tabsRef.current.find((x) => x.id === activeIdRef.current)
    const content = tab?.content ?? ''
    const n = parseInt(str, 10)
    const { bi, total } = blockIndexForLine(content, Number.isFinite(n) ? n : 1)
    if (!str || !Number.isFinite(n)) { lineBiRef.current = -1; setFind((f) => ({ ...f, matches: total, active: 0 })); return }
    if (commit) rememberNavigationRef.current()
    lineBiRef.current = bi
    Object.values(editorApis.current).forEach((api) => api?.ensureRendered?.()) // flush keep chunks
    const root = richRoot()
    let block = null
    if (root && bi >= 0) {
      block = root.classList.contains('km-doc')
        ? root.querySelector(`.km-block[data-bi="${bi}"]`)
        : root.children[bi] || null
    }
    flashBlock(block)
    setFind((f) => ({ ...f, matches: total, active: Math.min(Math.max(1, n), total) }))
    // Uses refs for the active tab/editor and saves the current line query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Next/prev in line mode steps the target line by ±1 and re-jumps.
  const stepLine = useCallback((backwards = false) => {
    const n = parseInt(String(findQueryRef.current).trim(), 10)
    const cur = Number.isFinite(n) ? n : 1
    const next = Math.max(1, cur + (backwards ? -1 : 1))
    setFind((f) => ({ ...f, query: String(next) }))
    runLineJump(String(next), true)
  }, [runLineJump])

  const openFind = (withReplace = false) => {
    const selectedScope = getSelectedFindScope()
    const savedScope = selectedScope ? saveFindScope(selectedScope) : activeFindScope()
    const session = findSessionsRef.current[activeFindKey()] || {}
    const previousQuery = session.query ?? ''
    const query = selectedScope?.text || previousQuery || ''
    const inSelection = !!session.inSelection && !!savedScope

    clearTimeout(findDebounceRef.current)
    clearFindHighlights()
    clearSourceFindHighlight(sourceFindTextareaRef.current || sourceRef.current)
    sourceFindTextareaRef.current = null
    findRangesRef.current = []
    activeIdxRef.current = -1
    lineBiRef.current = -1
    findQueryRef.current = query
    findStartRef.current = captureFindStart()
    findOptionsRef.current = { ...findOptionsRef.current, inSelection }

    setHome(false)
    setFind((f) => ({
      ...f,
      open: true,
      mode: 'text',
      query,
      matches: query ? f.matches : 0,
      active: query ? f.active : 0,
      inSelection,
      selectionAvailable: !!savedScope,
      error: '',
      // Ctrl+H opens with the replace row; plain Ctrl+F collapses it.
      showReplace: !!withReplace
    }))
    selectFindInputSoon()
    saveFindSession({ query, mode: 'text', inSelection })
    const preferredActiveIdx = sourceRef.current ? session.activeIdx ?? 0 : null
    setTimeout(() => runFind(query, findOptionsRef.current, preferredActiveIdx), 0)
  }
  openFindRef.current = openFind

  const rerunTextFind = (options, activeIdx = activeIdxRef.current) => {
    if (findModeRef.current !== 'text') return
    const q = findInputRef.current?.value ?? findQueryRef.current
    clearTimeout(findDebounceRef.current)
    runFind(q, options, activeIdx >= 0 ? activeIdx : 0)
  }

  const toggleFindOption = (key) => {
    const options = {
      ...findOptionsRef.current,
      [key]: !findOptionsRef.current[key]
    }
    findOptionsRef.current = options
    setFind((f) => ({ ...f, [key]: options[key], error: '' }))
    rerunTextFind(options)
  }

  const toggleFindInSelection = () => {
    let scope = activeFindScope()
    const nextEnabled = !findOptionsRef.current.inSelection
    if (nextEnabled) {
      scope = saveFindScope(getSelectedFindScope()) || scope
      if (!scope) {
        setFind((f) => ({ ...f, selectionAvailable: false, inSelection: false }))
        return
      }
    }

    const options = { ...findOptionsRef.current, inSelection: nextEnabled }
    findOptionsRef.current = options
    saveFindSession({ inSelection: nextEnabled })
    setFind((f) => ({
      ...f,
      inSelection: nextEnabled,
      selectionAvailable: !!scope,
      error: ''
    }))
    rerunTextFind(options)
  }

  useEffect(() => {
    const isTextEntry = (target) => {
      if (!target || target === document.body) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
    }
    const isAllowedFindTarget = (target) => {
      if (!target || target === document.body) return true
      if (target === findInputRef.current || target === sourceRef.current) return true
      return !!target.closest?.('.findbar, .editor-area, .ProseMirror, .km-doc')
    }
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyF') {
        e.preventDefault()
        e.stopPropagation()
        openFindRef.current?.()
        return
      }

      // Find & replace: Ctrl+H on Windows/Linux; ⌥⌘F on macOS (⌘H hides the app).
      const isReplaceCombo =
        window.api.platform === 'darwin'
          ? e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyF'
          : e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.code === 'KeyH'
      if (isReplaceCombo) {
        e.preventDefault()
        e.stopPropagation()
        openFindRef.current?.(true)
        return
      }

      if (find.open && findModeRef.current === 'text' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const optionByCode = { KeyC: 'caseSensitive', KeyR: 'regex', KeyW: 'wholeWord' }
        const option = optionByCode[e.code]
        if (option) {
          e.preventDefault()
          e.stopPropagation()
          toggleFindOption(option)
          return
        }
      }

      const isF3 = e.key === 'F3' && !e.ctrlKey && !e.metaKey && !e.altKey
      const isMacFindNext =
        window.api.platform === 'darwin' && e.code === 'KeyG' && e.metaKey && !e.ctrlKey && !e.altKey
      if (!isF3 && !isMacFindNext) return
      if (isTextEntry(e.target) && !isAllowedFindTarget(e.target)) return

      let handled = false
      if (findModeRef.current === 'line') {
        if (!find.open) return
        const raw = findInputRef.current?.value ?? findQueryRef.current
        if (!String(raw ?? '').trim()) return
        stepLine(e.shiftKey)
        handled = true
      } else {
        handled = stepTextFind(e.shiftKey)
      }
      if (!handled) return
      e.preventDefault()
      e.stopPropagation()
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // The listener dispatches through refs/current callbacks; this keeps shortcut
    // handling stable while the input value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find.open, stepLine, stepTextFind])

  // Reveal a 1-based source line in a tab's visible editor, retrying until the
  // editor is mounted/rendered. `waitActive` also waits for the tab to become
  // the active one first (used when the jump follows an openPaths), so we don't
  // flash a block in the previously-shown doc before React commits the switch.
  // Content is re-read from the live tab on every attempt — a lazily-restored
  // placeholder may still be filling when the first attempt fires.
  const jumpToTabLine = useCallback((tabId, line, waitActive = false) => {
    if (!tabId || !line) return
    rememberNavigationRef.current()
    let tries = 0
    const attempt = () => {
      if (waitActive && activeIdRef.current !== tabId) {
        if (tries++ < 16) setTimeout(attempt, 70)
        return
      }
      if (sourceRef.current) {
        const el = sourceRef.current
        if (el.__hmSourceApi?.scrollToLine) {
          el.__hmSourceApi.scrollToLine(line, true)
          return
        }
        const lines = el.value.split('\n')
        const ln = Math.min(Math.max(1, line), lines.length)
        let off = 0
        for (let k = 0; k < ln - 1; k++) off += lines[k].length + 1
        el.focus()
        el.setSelectionRange(off, off + (lines[ln - 1] || '').length)
        const cs = getComputedStyle(el)
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20
        el.scrollTop = Math.max(0, (ln - 1) * lh - el.clientHeight / 2)
        return
      }
      const content = tabsRef.current.find((x) => x.id === tabId)?.content ?? ''
      const { bi } = blockIndexForLine(content, line)
      Object.values(editorApis.current).forEach((api) => api?.ensureRendered?.()) // flush keep chunks
      const root = richRoot()
      const block =
        root && bi >= 0
          ? root.classList.contains('km-doc')
            ? root.querySelector(`.km-block[data-bi="${bi}"]`)
            : root.children[bi] || null
          : null
      if (block) {
        flashBlock(block)
        return
      }
      if (tries++ < 16) setTimeout(attempt, 70) // wait for the editor to mount/render
    }
    attempt()
  }, [])
  jumpToTabLineRef.current = jumpToTabLine

  const locateReviewChange = useCallback((change) => {
    if (!changeReview) return
    const tabId = changeReview.tabId
    setChangeReview(null)
    setHome(false)
    setActiveId(tabId)
    setTimeout(() => jumpToTabLineRef.current(tabId, change.line, true), 0)
  }, [changeReview])

  const restoreReviewChange = useCallback((change) => {
    const review = changeReview
    if (!review?.allowRestore || !guardKeepDraft(review.tabId)) return
    editorApis.current[review.tabId]?.replaceLineRange?.(
      change.currentStart,
      change.after.length,
      change.before
    )
  }, [changeReview, guardKeepDraft])

  // Reveal an anchor (heading slug / explicit id / literal text) in a doc.
  const jumpToAnchor = useCallback((anchor, targetPath) => {
    const norm = (p) => (p || '').replace(/\\/g, '/')
    const tab = targetPath
      ? tabsRef.current.find((t) => norm(t.path) === norm(targetPath))
      : tabsRef.current.find((t) => t.id === activeIdRef.current)
    const content = tab?.content ?? ''
    const line = findAnchorLine(content, anchor) // 1-based, 0 if not found
    if (!line || !tab) return
    jumpToTabLine(tab.id, line, !!targetPath)
  }, [jumpToTabLine])

  // Workspace search: open (or focus) the file, then jump to the hit's line.
  const openSearchResult = useCallback(
    async (path, line) => {
      await openPaths([path])
      const norm = (p) => (p || '').replace(/\\/g, '/')
      const tab = tabsRef.current.find((t) => norm(t.path) === norm(path))
      if (tab) jumpToTabLine(tab.id, line, true)
    },
    [openPaths, jumpToTabLine]
  )
  const onPaletteOpenWorkspaceHeading = useCallback(
    (heading) => openSearchResult(heading.path, heading.line),
    [openSearchResult]
  )
  const onPaletteOpenLine = useCallback(
    (line) => {
      const id = activeIdRef.current
      if (id) jumpToTabLine(id, line)
    },
    [jumpToTabLine]
  )

  // ── in-app document links ──
  // A keep-mode link like [POL-001](L2_xxx.md#POL-001) opens the target doc as a
  // tab (or reuses it) and jumps to the anchor; a same-file / pure #anchor link
  // just jumps. External http(s)/mailto links are handled in the editors.
  const openDocLink = useCallback(
    async (relPath, anchor, fromPath, { openRight: openInRight = false } = {}) => {
      const sourceTabId = activeIdRef.current
      const base =
        fromPath || tabsRef.current.find((t) => t.id === sourceTabId)?.path || ''
      let targetPath = null
      let targetTab = tabsRef.current.find((t) => t.id === sourceTabId) || null
      if (relPath) {
        const p = relPath.replace(/\\/g, '/')
        targetPath = isAbsolutePath(p) ? p : resolveRelPath(dirName(base), p)
        // Only markdown opens in-app; extensionless links are treated as `.md`
        // (wiki-style). Other file types are out of scope (ignored).
        let openable = null
        if (MD_DOC_RE.test(targetPath)) openable = targetPath
        else if (!/\.[a-z0-9]+$/i.test(targetPath)) openable = targetPath + '.md'
        if (!openable) return
        targetPath = openable
        const already = tabsRef.current.find(
          (t) => (t.path || '').replace(/\\/g, '/') === targetPath.replace(/\\/g, '/')
        )
        await openPaths([targetPath])
        // openPaths shows its own alert if the file is missing; bail on failure.
        targetTab = tabsRef.current.find(
          (t) => (t.path || '').replace(/\\/g, '/') === targetPath.replace(/\\/g, '/')
        )
        if (!already && !targetTab) return
      }
      if (openInRight && targetTab && targetTab.id !== sourceTabId) {
        openRight(targetTab.id, sourceTabId)
        if (anchor) {
          const line = findAnchorLine(targetTab.content || '', anchor)
          const rawOffset = line
            ? lineStartOffset(targetTab.content || '', Math.max(0, line - 1))
            : 0
          let tries = 0
          const reveal = () => {
            const api = editorApis.current[targetTab.id]
            if (api?.restoreMarkdownOffset?.(rawOffset, false)) return
            if (tries++ < 16) setTimeout(reveal, 70)
          }
          setTimeout(reveal, 0)
        }
        return
      }
      if (anchor) jumpToAnchor(anchor, targetPath)
    },
    [openPaths, jumpToAnchor, openRight]
  )

  const toggleFindMode = useCallback(() => {
    clearFindHighlights()
    clearSourceFindHighlight(sourceFindTextareaRef.current || sourceRef.current)
    sourceFindTextareaRef.current = null
    findRangesRef.current = []
    activeIdxRef.current = -1
    lineBiRef.current = -1
    findQueryRef.current = ''
    findOptionsRef.current = { ...findOptionsRef.current, inSelection: false }
    setFind((f) => {
      const mode = f.mode === 'line' ? 'text' : 'line'
      saveFindSession({ mode, query: '', activeIdx: -1, inSelection: false })
      return { ...f, mode, query: '', matches: 0, active: 0, inSelection: false, error: '' }
    })
    selectFindInputSoon()
    // Uses refs and a functional state update to avoid stale mode/query values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeFind = useCallback(() => {
    clearTimeout(findDebounceRef.current)
    clearTimeout(findEditDebounceRef.current)
    findOpenRef.current = false
    clearFindHighlights()
    clearSourceFindHighlight(sourceFindTextareaRef.current || sourceRef.current)
    sourceFindTextareaRef.current = null
    findRangesRef.current = []
    activeIdxRef.current = -1
    lineBiRef.current = -1
    setFind((f) => ({ ...f, open: false }))
  }, [])

  // Re-run the search/jump when switching tabs while the find bar is open, so it
  // points at the newly-visible document.
  useEffect(() => {
    if (!find.open) return
    const session = findSessionsRef.current[activeFindKey()] || {}
    const scope = activeFindScope()
    const mode = session.mode || 'text'
    const query = session.query || ''
    const inSelection = !!session.inSelection && !!scope
    const options = { ...findOptionsRef.current, inSelection }
    findOptionsRef.current = options
    findModeRef.current = mode
    findQueryRef.current = query
    findStartRef.current = captureFindStart()
    setFind((f) => ({
      ...f,
      mode,
      query,
      inSelection,
      selectionAvailable: !!scope,
      matches: 0,
      active: 0,
      error: ''
    }))
    if (mode === 'line') runLineJump(query, false)
    else runFind(query, options, sourceRef.current ? session.activeIdx ?? 0 : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, sourceMode])

  const platformClass =
    ({ win32: ' is-win', darwin: ' is-mac', ios: ' is-ios is-mobile', android: ' is-android is-mobile' }[
      window.api.platform
    ] || '')
  const reviewTab = changeReview
    ? tabs.find((tab) => tab.id === changeReview.tabId)
    : null
  const reviewCurrent = reviewTab?.content ?? ''
  const localHistoryTab = localHistoryState
    ? tabs.find((tab) => tab.id === localHistoryState.tabId)
    : null
  const localHistoryCanRestore = localHistoryTab
    ? canRestoreLocalHistory(localHistoryTab.id)
    : false
  const tabSwitcherTabs = tabSwitcher
    ? tabSwitcher.ids
        .map((id) => tabsMeta.find((tab) => tab.id === id))
        .filter(Boolean)
    : []
  const tabSwitcherSelectedId = tabSwitcher?.ids[tabSwitcher.index] || null

  return (
    <I18nProvider lang={lang} setLang={setLang}>
    <div className={`app${platformClass}${isMobile && sidebarOpen ? ' drawer-open' : ''}${zenMode ? ' zen-mode' : ''}${zenReveal ? ' zen-reveal' : ''}`}>
      <div className="activity-bar">
        <button
          className={`activity-item activity-home${home ? ' active' : ''}`}
          title={t('nav.home')}
          onClick={() => handlers.current.home()}
        >
          <img className="activity-logo" src={logoUrl} alt="EasyMarkdown" />
        </button>
        <button
          className={`activity-item${sidebarMode === 'files' ? ' active' : ''}`}
          title={t('cmd.files')}
          onClick={() => handlers.current.toggleFiles()}
        >
          <Icon name="folder" size={20} />
        </button>
        {window.api.capabilities?.workspaceSearch && (
          <button
            className={`activity-item${sidebarMode === 'search' ? ' active' : ''}`}
            title={t('search.title')}
            onClick={() => handlers.current.searchWorkspace()}
          >
            <Icon name="search" size={20} />
          </button>
        )}
        <button
          className={`activity-item${sidebarMode === 'links' ? ' active' : ''}`}
          title={`${t('links.title')} (F8)`}
          onClick={() => handlers.current.linkProblems()}
        >
          <Icon name="alert" size={20} />
          {!!linkPanel.problems.length && (
            <span className="activity-badge">{Math.min(99, linkPanel.problems.length)}</span>
          )}
        </button>
        <button
          className={`activity-item${sidebarMode === 'outline' ? ' active' : ''}`}
          title={t('outline.title')}
          onClick={() => handlers.current.toggleOutline()}
        >
          <Icon name="outline" size={20} />
        </button>
        <div className="activity-spacer" />
        <button
          className="activity-item"
          title={sidebarOpen ? t('side.collapsePane') : t('side.expandPane')}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <Icon name={sidebarOpen ? 'panel-left-close' : 'panel-left-open'} size={20} />
        </button>
      </div>

      <div className="topbar">
        {isMobile && (
          <button
            className="icon-btn drag-no hm-menu-btn"
            title={t('cmd.files')}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <Icon name="menu" size={20} />
          </button>
        )}
        <Tabs
          tabs={tabsMeta}
          activeId={home ? null : activeId}
          splitId={home ? null : splitId}
          focusedPane={focusedPane}
          onActivate={onTabActivate}
          onClose={closeTab}
          onNew={newTab}
          onCloseOthers={closeOthers}
          onCloseLeft={onCloseLeftTabs}
          onCloseRight={onCloseRightTabs}
          onOpenRight={openRight}
          onRename={renameTabFile}
          onDuplicate={duplicateTabFile}
          onDelete={deleteTabFile}
          onExportPdf={exportPathToPdf}
          onReorder={reorderTabs}
          onTogglePin={toggleTabPin}
          onPromotePreview={promotePreviewTab}
        />
        <div className="topbar-spacer" />
        <button className="icon-btn drag-no" title={`${t('welcome.newFile')} (Ctrl+N)`} onClick={newTab}>
          <Icon name="plus" size={18} />
        </button>
        {!isMobile && (
          <button
            className={`icon-btn drag-no${split ? ' active' : ''}`}
            title={split ? t('split.close') : t('split.toggle')}
            onClick={toggleSplit}
          >
            <Icon name="columns" size={16} />
          </button>
        )}
        <button className="icon-btn drag-no" title="Command palette (Ctrl+P)" onClick={() => setPaletteOpen(true)}>
          <Icon name="command" size={16} />
        </button>
        {window.api.platform === 'win32' && <WindowControls t={t} />}
      </div>

      {isMobile && sidebarOpen && (
        <div className="hm-scrim" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="body">
        <aside
          ref={paneLeftRef}
          className={`pane-left${sidebarOpen ? '' : ' collapsed'}`}
          style={!isMobile && sidebarOpen ? { width: sidebarWidth, maxWidth: sidebarWidth } : undefined}
        >
          {sidebarOpen && (
            sidebarMode === 'files' ? (
              <Sidebar
                workspaces={workspaces}
                activePath={activePath}
                openTabPaths={openTabPaths}
                openTabPathsRaw={openTabPathsRaw}
                onOpenFile={onSidebarOpenFile}
                onOpenRight={openFileRight}
                onExportPdf={exportPathToPdf}
                onAddFolder={openFolder}
                onRemoveFolder={removeWorkspace}
                onReorderFolder={reorderWorkspaces}
                onRenamePath={onSidebarRenamePath}
                refreshNonce={refreshNonce}
                showHiddenFiles={settings.showHiddenFiles}
              />
            ) : sidebarMode === 'search' ? (
              <SearchPanel
                workspaces={workspaces}
                onOpenResult={openSearchResult}
                onAddFolder={openFolder}
                focusNonce={searchFocusNonce}
                showHiddenFiles={settings.showHiddenFiles}
              />
            ) : sidebarMode === 'links' ? (
              <LinkIntelligencePanel
                view={linkPanel.view}
                onSetView={(view) => setLinkPanel((prev) => ({ ...prev, view }))}
                docPath={linkPanel.docPath}
                problems={linkPanel.problems}
                diagnosing={linkPanel.diagnosing}
                referenceGroups={linkPanel.referenceGroups}
                referencesRunning={linkPanel.referencesRunning}
                referenceLabel={linkPanel.referenceLabel}
                filesScanned={linkPanel.filesScanned}
                truncated={linkPanel.truncated}
                onRefresh={() => diagnoseLinksForTab(
                  tabsRef.current.find((item) => item.id === activeIdRef.current)
                )}
                onFindCurrentReferences={() => findCurrentReferencesRef.current()}
                onOpenResult={openSearchResult}
              />
            ) : (
              <Outline content={activeTab?.content || ''} activeIndex={activeHeading} onJump={jumpToHeading} />
            )
          )}
        </aside>

        {!isMobile && sidebarOpen && (
          <div className="hm-sidebar-divider" onMouseDown={startSidebarDrag} title={t('side.dragResize')} />
        )}

        <main className="pane-center">
          {find.open && (
            <div className={`findbar${find.error ? ' has-error' : ''}`}>
              <div className="findbar-row">
              {find.mode === 'text' && (
                <button
                  className={`findbar-replace-toggle${find.showReplace ? ' active' : ''}`}
                  title={t('find.toggleReplace')}
                  aria-pressed={find.showReplace}
                  onClick={() => setFind((f) => ({ ...f, showReplace: !f.showReplace }))}
                >
                  <Icon name={find.showReplace ? 'chevron-down' : 'chevron-right'} size={13} />
                </button>
              )}
              <button
                className={`findbar-mode${find.mode === 'line' ? ' active' : ''}`}
                title={t(find.mode === 'line' ? 'find.modeLine' : 'find.modeText')}
                onClick={toggleFindMode}
              >
                <Icon name={find.mode === 'line' ? 'hash' : 'search'} size={14} />
              </button>
              <input
                ref={findInputRef}
                className={find.error ? 'is-error' : ''}
                value={find.query}
                inputMode={find.mode === 'line' ? 'numeric' : undefined}
                placeholder={t(find.mode === 'line' ? 'find.linePlaceholder' : 'find.placeholder')}
                onChange={(e) => applyFindQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (find.mode === 'line') runLineJump(find.query, true)
                    else stepTextFind(e.shiftKey)
                  }
                  if (find.mode === 'text' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                    if (recallFindHistory(e.key === 'ArrowUp')) {
                      e.preventDefault()
                    }
                  }
                  if (e.key === 'Escape') closeFind()
                }}
              />
              <span className={`findbar-count${find.error ? ' is-error' : find.query && !find.matches ? ' is-empty' : ''}`}>
                {find.query ? (find.error ? t('find.invalidRegex') : `${find.active || 0}/${find.matches || 0}`) : ''}
              </span>
              {find.mode === 'text' && (
                <>
                  <button
                    className={`findbar-option${find.caseSensitive ? ' active' : ''}`}
                    title={t('find.caseSensitive')}
                    aria-pressed={find.caseSensitive}
                    onClick={() => toggleFindOption('caseSensitive')}
                  >
                    Aa
                  </button>
                  <button
                    className={`findbar-option${find.regex ? ' active' : ''}`}
                    title={t('find.regex')}
                    aria-pressed={find.regex}
                    onClick={() => toggleFindOption('regex')}
                  >
                    .*
                  </button>
                  <button
                    className={`findbar-option${find.wholeWord ? ' active' : ''}`}
                    title={t('find.wholeWord')}
                    aria-pressed={find.wholeWord}
                    onClick={() => toggleFindOption('wholeWord')}
                  >
                    W
                  </button>
                  <button
                    className={`findbar-option${find.inSelection ? ' active' : ''}`}
                    title={find.selectionAvailable ? t('find.inSelection') : t('find.selectFirst')}
                    aria-pressed={find.inSelection}
                    onClick={toggleFindInSelection}
                  >
                    []
                  </button>
                </>
              )}
              <button
                title={t(find.mode === 'line' ? 'find.linePrev' : 'find.prev')}
                onClick={() => (find.mode === 'line' ? stepLine(true) : stepTextFind(true))}
              >
                <Icon name="chevron-up" size={14} />
              </button>
              <button
                title={t(find.mode === 'line' ? 'find.lineNext' : 'find.next')}
                onClick={() => (find.mode === 'line' ? stepLine(false) : stepTextFind(false))}
              >
                <Icon name="chevron-down" size={14} />
              </button>
              <button title={t('find.close')} onClick={closeFind}>
                <Icon name="close" size={14} />
              </button>
              </div>
              {find.mode === 'text' && find.showReplace && (
                <div className="findbar-row findbar-replace-row">
                  <input
                    className="findbar-replace-input"
                    value={find.replace}
                    placeholder={t('find.replacePlaceholder')}
                    onChange={(e) => {
                      const v = e.target.value
                      setFind((f) => ({ ...f, replace: v }))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        applyReplace(e.ctrlKey || e.metaKey)
                      }
                      if (e.key === 'Escape') closeFind()
                    }}
                  />
                  <button
                    className="findbar-replace-btn"
                    disabled={!find.query || !find.matches || !!find.error}
                    title={t('find.replaceTip')}
                    onClick={() => applyReplace(false)}
                  >
                    {t('find.replace')}
                  </button>
                  <button
                    className="findbar-replace-btn"
                    disabled={!find.query || !find.matches || !!find.error}
                    title={t('find.replaceAllTip')}
                    onClick={() => applyReplace(true)}
                  >
                    {t('find.replaceAll')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Editor area — a flex row so the active (left) and split (right) tabs
              can sit side by side. Editors are siblings here; only the one(s) in
              view are shown (the rest are display:none but stay mounted, so tab
              switches / toggling split never re-create an editor). Hidden as a
              whole on the welcome/home screen so it doesn't fight Welcome for space. */}
          <div
            ref={editorAreaRef}
            className={`editor-area${layoutSplit ? ' is-split' : ''}${sourceSplit ? ' is-source-split' : ''}`}
            style={{ display: home || !activeTab ? 'none' : undefined }}
          >
            {tabs.map((tab) => {
              const normalIsLeft = !sourceSplit && !home && tab.id === activeId
              const normalIsRight = !sourceSplit && split && tab.id === splitId
              const normalInView = normalIsLeft || normalIsRight
              const dualSource = sourceSplit && tab.id === activeId
              const dualPreview = sourceSplit && tab.id === sourcePreviewId
              const paneClassFor = (side) =>
                ` hm-pane-${side}${layoutSplit && focusedPane === side ? ' hm-focused' : ''}`
              const sourceSide = dualSource
                ? sourceOnLeft ? 'left' : 'right'
                : normalIsRight ? 'right' : 'left'
              const previewSide = dualPreview
                ? sourceOnLeft ? 'right' : 'left'
                : normalIsRight ? 'right' : 'left'
              const sourcePaneClass = paneClassFor(sourceSide)
              const previewPaneClass = paneClassFor(previewSide)
              const sourcePaneStyle = sourceSide === 'right' ? rightPaneStyle : leftPaneStyle
              const previewPaneStyle = previewSide === 'right' ? rightPaneStyle : leftPaneStyle
              // Cached per tab id — stable identities so the memoized editors
              // skip re-rendering when an unrelated tab's content changes.
              const h = getTabHandlers(tab.id)

              // Plain-text docs always use the textarea; a Markdown tab can enable
              // its own source pane on the left (the right split pane stays preview).
              // "Heavy" only matters for the Milkdown (Crepe) editor — its
              // near-quadratic handling of one giant paragraph freezes the thread.
              // The source-backed keep editor is plain DOM and renders heavy docs
              // fine, so only fall back to plain source for a Milkdown-bound tab
              // (and only until the user opts into rich-despite-heavy).
              const heavyAsSource =
                tab.heavy && milkdownForced.has(tab.id) && !richForced.has(tab.id)
              const plainText = isPlainTextDoc(tab)
              const sourceForActivePreview =
                !sourceSplit && sourceMode && normalIsLeft && !plainText && !heavyAsSource
              const sourceVisible =
                dualSource || (normalInView && (plainText || heavyAsSource || sourceForActivePreview))
              const shouldMountSource = (plainText || heavyAsSource)
                ? sourceVisible
                : sourceMountedIds.has(tab.id) || sourceForActivePreview || dualSource
              const sourceStyle = {
                ...sourcePaneStyle,
                display: sourceVisible ? undefined : 'none'
              }
              const sourceNode = shouldMountSource ? (
                <SourceEditorPane
                  key={`source:${tab.id}:${tab.reloadNonce}`}
                  textareaRef={(normalIsLeft || dualSource) && sourceVisible ? sourceRef : undefined}
                  paneClass={sourcePaneClass}
                  style={sourceStyle}
                  value={tab.content}
                  onChange={h.onSourceChange}
                  onViewportChange={h.onSourceViewportChange}
                  onSelectionChange={h.onSourceSelectionChange}
                  onPaneFocus={h.onSourcePaneFocus}
                  onPaneMouseDown={h.onSourcePaneFocus}
                />
              ) : null
              if (plainText || heavyAsSource) return sourceNode
              const previewVisible = dualPreview || (normalInView && !sourceForActivePreview)
              // `.md` default: the source-backed "keep" editor (zero-diff saves).
              // The user can opt this tab into Milkdown WYSIWYG (milkdownForced).
              // Reaching here means it's a Markdown doc not shown as plain source.
              const usesKeep = !milkdownForced.has(tab.id)
              if (usesKeep) {
                if (!previewVisible && !mountedIds.has(tab.id) && !sourceNode) return null
                return [
                  sourceNode,
                  <div
                    // Distinct key prefix from the Milkdown wrapper so toggling
                    // modes fully remounts (no ref/child reconciliation surprises).
                    key={`keep:${tab.id}:${tab.reloadNonce}`}
                    className={`editor-scroll km-scroll${previewPaneClass}`}
                    style={{ ...previewPaneStyle, display: previewVisible ? undefined : 'none' }}
                    onFocusCapture={h.onPaneFocus}
                    onMouseDownCapture={h.onPaneFocus}
                    onScrollCapture={h.onPreviewScroll}
                  >
                    <KeepEditor
                      inView={previewVisible}
                      initialContent={tab.content}
                      docPath={tab.path}
                      blankLineSpacing={settings.blankLineSpacing}
                      onChange={h.onChange}
                      onReady={h.onReady}
                      onFilterChange={h.onFilterChange}
                      onDraftChange={h.onDraftChange}
                      onHistoryChange={h.onHistoryChange}
                      onCommit={h.onCommit}
                      onOpenSource={openSourceAtLine}
                      onOpenDocLink={openDocLink}
                      onFindReferences={onKeepFindReferences}
                      onRenameHeading={onKeepRenameHeading}
                      sourceSplitMode={sourceSplit && dualPreview}
                      onLocateSource={h.onLocateSource}
                    />
                  </div>
                ]
              }
              // Lazy mount: don't create a Crepe editor for a tab the user hasn't
              // opened yet (keeps session-restore of many tabs fast). Panes in
              // view always mount; visited tabs stay mounted.
              if (!previewVisible && !mountedIds.has(tab.id) && !sourceNode) return null
              return [
                sourceNode,
                <div
                  // Include reloadNonce so an external-edit reload remounts the
                  // Crepe editor with the new content (the create effect only
                  // runs on mount). tab switches keep the same key → stay mounted.
                  key={`${tab.id}:${tab.reloadNonce}`}
                  className={`editor-scroll${previewPaneClass}`}
                  ref={(normalIsLeft || (dualPreview && tab.id === activeId)) && previewVisible ? editorHostRef : undefined}
                  style={{ ...previewPaneStyle, display: previewVisible ? undefined : 'none' }}
                  onFocusCapture={h.onPaneFocus}
                  onMouseDownCapture={h.onPaneFocus}
                >
                  <Suspense fallback={null}>
                    <Editor
                      tabId={`${tab.id}:${tab.reloadNonce}`}
                      initialContent={tab.content}
                      docPath={tab.path}
                      onChange={h.onChange}
                      onReady={h.onReady}
                      onOpenDocLink={openDocLink}
                    />
                  </Suspense>
                </div>
              ]
            })}

            {sourceSplit && (
              <div className="hm-source-split-tools" role="toolbar" aria-label={t('sourceSplit.toolbar')}>
                <span className="hm-source-split-label">
                  {sourcePreviewPinned
                    ? t('sourceSplit.pinnedLabel', { name: sourcePreviewTab?.title || '' })
                    : t('sourceSplit.label')}
                </span>
                <button
                  type="button"
                  className={sourcePreviewPinned ? 'active' : ''}
                  title={sourcePreviewPinned ? t('sourceSplit.unpin') : t('sourceSplit.pin')}
                  aria-pressed={sourcePreviewPinned}
                  onClick={() => {
                    setSourcePreviewPinned((pinned) => {
                      if (pinned) setSourcePreviewId(activeIdRef.current)
                      return !pinned
                    })
                  }}
                >
                  <Icon name="pin" size={13} />
                </button>
                <button
                  type="button"
                  title={t('sourceSplit.swap')}
                  onClick={() => setSourceOnLeft((left) => !left)}
                >
                  <Icon name="swap" size={14} />
                </button>
                <button
                  type="button"
                  className={sourceScrollSync ? 'active' : ''}
                  title={
                    sourcePreviewId === activeId
                      ? t('sourceSplit.sync')
                      : t('sourceSplit.syncUnavailable')
                  }
                  aria-pressed={sourceScrollSync}
                  disabled={sourcePreviewId !== activeId}
                  onClick={() => setSourceScrollSync((enabled) => !enabled)}
                >
                  <Icon name="sync" size={14} />
                </button>
              </div>
            )}

            {/* Heavy-doc notice: only shown when a Milkdown-bound doc is being
                displayed as plain source to stay responsive (the keep editor
                renders heavy docs directly); offer a one-click switch to rich. */}
            {!home &&
              activeTab &&
              activeTab.heavy &&
              milkdownForced.has(activeTab.id) &&
              !richForced.has(activeTab.id) && (
              <div className="hm-heavy-banner">
                <span>{t('heavy.notice')}</span>
                <button onClick={() => setRichForced((s) => new Set(s).add(activeTab.id))}>
                  {t('heavy.loadRich')}
                </button>
              </div>
            )}

            {layoutSplit && (
              <div
                className="hm-split-divider"
                style={{ order: 2 }}
                onMouseDown={startSplitDrag}
                title={t('split.drag')}
              />
            )}

            {layoutSplit && (
              <button
                className="hm-split-close"
                title={t('split.close')}
                onClick={sourceSplit ? closeSourceSplit : () => setSplitId(null)}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          {(home || !activeTab) && (
            <Welcome
              t={t}
              lang={lang}
              recents={recents}
              onNew={newTab}
              onOpen={() => handlers.current.open()}
              onOpenFolder={openFolder}
              onOpenRecent={(p) => openPaths([p], false, { followSidebar: true })}
              onRemoveRecent={(p) => setRecents((prev) => removeRecentPath(prev, p))}
              onClearRecents={() => setRecents((prev) => clearUnpinnedRecents(prev))}
              onTogglePinRecent={(p) => setRecents((prev) => toggleRecentPinned(prev, p))}
            />
          )}
        </main>
      </div>

      <StatusBar
        tab={home ? null : activeTab}
        hasDraft={!!activeTab && keepDraftIds.has(activeTab.id)}
        keepHistory={activeTab ? keepHistoryState[activeTab.id] : null}
        isMobile={isMobile}
        onSave={onStatusSave}
        onUndoKeep={onStatusUndoKeep}
        onRedoKeep={onStatusRedoKeep}
        onReviewKeep={onStatusReviewKeep}
        onShare={onStatusShare}
        theme={theme}
        setTheme={pickBuiltinTheme}
        customThemes={customThemes}
        customTheme={customTheme}
        onPickCustom={setCustomTheme}
        onRefreshThemes={refreshThemes}
        lang={lang}
        setLang={setLang}
        sourceMode={sourceMode}
        onToggleSource={toggleSource}
        viewMode={
          sourceSplit
            ? 'richSource'
            : sourceMode
              ? 'source'
              : 'rich'
        }
        onSelectViewMode={selectViewMode}
        keepEligible={
          // Heavy docs keep the toggle too: switching one to Milkdown lands in the
          // safe plain-source + "load rich" banner path (heavyAsSource above), never
          // the freeze-prone Crepe render — so there's no reason to hide the button
          // (it just vanishing on big files / big-table docs was confusing).
          !!activeTab && !isPlainTextDoc(activeTab)
        }
        keepMode={!!activeTab && !milkdownForced.has(activeTab.id)}
        onToggleKeep={onToggleKeep}
        showModeHint={showModeHint}
        onDismissModeHint={dismissModeHint}
        fontSize={settings.fontSize}
        onSetFontSize={onSetFontSize}
        zoom={settings.zoom}
        onSetZoom={onSetZoom}
        filterInfo={activeTab ? keepFilters[activeTab.id] : null}
        onClearFilters={() => {
          if (activeTab) editorApis.current[activeTab.id]?.clearAllFilters?.()
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {zenMode && (
        <button
          type="button"
          className="hm-zen-exit"
          title={`${t('zen.exit')} (${window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'}K Z)`}
          aria-label={t('zen.exit')}
          onClick={() => {
            setZenMode(false)
            setZenReveal(false)
          }}
        >
          <Icon name="close" size={14} />
        </button>
      )}

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        updateSettings={updateSettings}
        theme={theme}
        setTheme={pickBuiltinTheme}
        customThemes={customThemes}
        customTheme={customTheme}
        onPickCustom={setCustomTheme}
        onRefreshThemes={refreshThemes}
        onOpenThemesFolder={onOpenThemesFolder}
        onGetMoreThemes={onGetMoreThemes}
        onClearLocalHistory={clearAllLocalHistory}
        typographyProps={{
          fontSize: settings.fontSize,
          onSetFontSize,
          pageWidth: settings.pageWidth,
          onSetPageWidth,
          zoom: settings.zoom,
          onSetZoom,
          lineHeight: settings.lineHeight,
          onSetLineHeight,
          paragraphSpacing: settings.paragraphSpacing,
          onSetParagraphSpacing
        }}
      />

      <SaveFab
        visible={!home && !!activeTab && hasUnsavedTab(activeTab)}
        onSave={onStatusSave}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={onPaletteClose}
        commands={commands}
        files={files}
        headings={paletteHeadings}
        recentFiles={recents}
        lineCount={paletteLineCount}
        loadWorkspaceHeadings={loadPaletteWorkspaceHeadings}
        onOpenFile={onPaletteOpenFile}
        onOpenHeading={onPaletteOpenHeading}
        onOpenWorkspaceHeading={onPaletteOpenWorkspaceHeading}
        onOpenLine={onPaletteOpenLine}
      />

      {tabSwitcher && (
        <TabSwitcher
          tabs={tabSwitcherTabs}
          selectedId={tabSwitcherSelectedId}
          onSelect={selectTabSwitcherId}
          onCommit={commitTabSwitcher}
          onCancel={cancelTabSwitcher}
        />
      )}

      {toast && (
        <div
          className={`hm-toast${toast.sticky ? ' sticky' : ''}${toast.onAction ? ' actionable' : ''}`}
          role="status"
          key={toast.key}
        >
          {toast.kind === 'progress' && <span className="hm-toast-spin" />}
          {toast.kind === 'success' && (
            <span className="hm-toast-ico ok">
              <Icon name="check" size={13} strokeWidth={2.4} />
            </span>
          )}
          {toast.kind === 'error' && (
            <span className="hm-toast-ico err">
              <Icon name="alert" size={16} strokeWidth={2} />
            </span>
          )}
          <span className="hm-toast-msg">{toast.msg}</span>
          {toast.onAction && (
            <button
              type="button"
              className="hm-toast-action"
              onClick={() => {
                const action = toast.onAction
                setToast(null)
                action()
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          {toast.sticky && (
            <button className="hm-toast-close" onClick={() => setToast(null)} aria-label="Close">
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
      )}

      {activeTab?.conflict && (
        <div className="hm-conflict" role="alertdialog" aria-label={t('conflict.title')}>
          <div className="hm-conflict-body">
            <div className="hm-conflict-title">{t('conflict.title')}</div>
            <div className="hm-conflict-msg">
              {t('conflict.msg', { name: activeTab.title })}
            </div>
          </div>
          <div className="hm-conflict-actions">
            <button
              className="hm-conflict-btn"
              onClick={() => reviewConflictChanges(activeTab.id)}
            >
              {t('review.open')}
            </button>
            <button
              className="hm-conflict-btn"
              onClick={() => resolveConflict(activeTab.id, 'keep')}
            >
              {t('conflict.keep')}
            </button>
            <button
              className="hm-conflict-btn primary"
              onClick={() => resolveConflict(activeTab.id, 'reload')}
            >
              {t('conflict.reload')}
            </button>
          </div>
        </div>
      )}

      {renameState && (
        <RenameModal
          t={t}
          initial={renameState.value}
          onConfirm={(name) => commitTabRename(renameState.id, name)}
          onCancel={() => setRenameState(null)}
        />
      )}

      {headingRenameState && (
        <RenameModal
          t={t}
          title={t('links.renameHeading')}
          initial={headingRenameState.value}
          onConfirm={commitHeadingRename}
          onCancel={() => setHeadingRenameState(null)}
        />
      )}

      {linkUpdateState && (
        <LinkUpdateDialog
          t={t}
          state={linkUpdateState}
          onApply={() => applyLinkUpdate(true)}
          onRenameOnly={() => applyLinkUpdate(false)}
          onClose={() => {
            if (!linkUpdateState.busy) setLinkUpdateState(null)
          }}
        />
      )}

      {modeSwitchState && (
        <ModeSwitchDialog
          t={t}
          direction={modeSwitchState.direction}
          busy={modeSwitchSaving}
          onSaveAndSwitch={saveAndContinueModeSwitch}
          onSwitch={continueModeSwitch}
          onReview={reviewModeSwitchChanges}
          onCancel={cancelModeSwitch}
        />
      )}

      {changeReview && reviewTab && (
        <KeepChangeReview
          t={t}
          title={t(changeReview.titleKey)}
          description={t(changeReview.descriptionKey)}
          baseline={changeReview.baseline}
          current={reviewCurrent}
          allowRestore={changeReview.allowRestore}
          onLocate={locateReviewChange}
          onRestore={restoreReviewChange}
          onClose={() => setChangeReview(null)}
        />
      )}

      {localHistoryState && localHistoryTab && (
        <LocalHistoryDialog
          t={t}
          lang={lang}
          documentTitle={localHistoryTab.title}
          entries={localHistoryState.entries}
          canRestore={localHistoryCanRestore}
          onCompare={compareLocalHistory}
          onRestore={restoreLocalHistory}
          onDelete={deleteLocalHistoryEntry}
          onClearDocument={clearDocumentLocalHistory}
          onClose={() => setLocalHistoryState(null)}
        />
      )}

      {saveNameState && (
        <RenameModal
          t={t}
          title={t('save.nameTitle')}
          initial={saveNameState.value}
          onConfirm={(name) => commitMobileSave(saveNameState.id, name)}
          onCancel={() => {
            pendingModeAfterSaveRef.current = null
            setSaveNameState(null)
          }}
        />
      )}

      {update && (
        <UpdateToast
          t={t}
          latest={update.latest}
          current={update.current}
          notes={update.notes}
          onDownload={() => {
            window.api.openExternal(update.url)
            dismissUpdate()
          }}
          onDismiss={dismissUpdate}
        />
      )}
    </div>
    </I18nProvider>
  )
}
