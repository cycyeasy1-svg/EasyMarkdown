// find-in-document helpers
// Search is scoped to the editor content only (the rich .ProseMirror element or
// the source <textarea>), never the find bar or other UI — so the text typed in
// the find box is never itself matched. Highlighting uses the CSS Custom
// Highlight API, which paints ranges without touching the DOM.
import { parseDoc, toViewLines } from './keep-parser.js'
import { syncTextareaMirrorStyle, textareaOffsetY } from './textarea-metrics.js'
const FIND_HL = 'hm-find'
const FIND_HL_CUR = 'hm-find-current'
const SOURCE_FIND_MARK = 'hm-source-find-current'
const findHighlightSupported =
  typeof window !== 'undefined' && !!window.CSS?.highlights && typeof window.Highlight === 'function'

export function clearFindHighlights() {
  if (!findHighlightSupported) return
  CSS.highlights.delete(FIND_HL)
  CSS.highlights.delete(FIND_HL_CUR)
}

const WORD_CHAR_RE = /[\p{L}\p{N}_]/u

function isWordChar(ch) {
  return !!ch && WORD_CHAR_RE.test(ch)
}

function isWholeWordMatch(text, start, length) {
  return !isWordChar(text[start - 1]) && !isWordChar(text[start + length])
}

export function findMatchesInText(text, query, options = {}) {
  const source = String(text ?? '')
  const needle = String(query ?? '')
  if (!source || !needle) return { matches: [], error: '' }

  const caseSensitive = !!options.caseSensitive
  const wholeWord = !!options.wholeWord
  const regexMode = !!options.regex
  const matches = []

  if (regexMode) {
    let re
    try {
      re = new RegExp(needle, `g${caseSensitive ? '' : 'i'}`)
    } catch {
      return { matches: [], error: 'regex' }
    }

    let match
    while ((match = re.exec(source))) {
      const value = match[0]
      if (!value) {
        re.lastIndex += 1
        continue
      }
      if (!wholeWord || isWholeWordMatch(source, match.index, value.length)) {
        matches.push({ index: match.index, length: value.length })
      }
    }
    return { matches, error: '' }
  }

  const haystack = caseSensitive ? source : source.toLowerCase()
  const target = caseSensitive ? needle : needle.toLowerCase()
  let idx = haystack.indexOf(target)
  while (idx !== -1) {
    if (!wholeWord || isWholeWordMatch(source, idx, needle.length)) {
      matches.push({ index: idx, length: needle.length })
    }
    idx = haystack.indexOf(target, idx + Math.max(1, needle.length))
  }

  return { matches, error: '' }
}

// Expand $&, $1…$99 and $$ in a regex replacement template (a subset of
// String.replace semantics — enough for find & replace).
function expandReplacement(match, template) {
  return template.replace(/\$(\$|&|\d{1,2})/g, (_s, g) => {
    if (g === '$') return '$'
    if (g === '&') return match[0]
    // "$12" with no group 12 falls back to group 1 followed by a literal "2".
    if (g.length === 2 && match[Number(g)] === undefined) {
      const head = match[Number(g[0])]
      return head === undefined ? '' : head + g[1]
    }
    return match[Number(g)] ?? ''
  })
}

// Replace matches of `query` in `text`. Pure string-in / string-out so all three
// editors (rich, keep, source textarea) share it — the caller writes the result
// back through the tab-content pipeline. Options mirror findMatchesInText
// (caseSensitive / wholeWord / regex) plus:
//   options.range     — {start,end} char window; matches outside are left alone
//                       (the source editor's "in selection" scope).
//   onlyIndex         — replace just the Nth match (0-based, clamped); null = all.
// Returns { text, count, error } — count = how many replacements were made.
export function replaceMatchesInText(text, query, replacement, options = {}, onlyIndex = null) {
  const source = String(text ?? '')
  const needle = String(query ?? '')
  const repl = String(replacement ?? '')
  if (!source || !needle) return { text: source, count: 0, error: '' }

  let pieces = []
  if (options.regex) {
    let re
    try {
      re = new RegExp(needle, `g${options.caseSensitive ? '' : 'i'}`)
    } catch {
      return { text: source, count: 0, error: 'regex' }
    }
    let m
    while ((m = re.exec(source))) {
      if (!m[0]) {
        re.lastIndex += 1
        continue
      }
      if (options.wholeWord && !isWholeWordMatch(source, m.index, m[0].length)) continue
      pieces.push({ index: m.index, length: m[0].length, insert: expandReplacement(m, repl) })
    }
  } else {
    const { matches } = findMatchesInText(source, needle, options)
    pieces = matches.map((m) => ({ index: m.index, length: m.length, insert: repl }))
  }

  if (options.range) {
    const { start = 0, end = source.length } = options.range
    pieces = pieces.filter((p) => p.index >= start && p.index + p.length <= end)
  }
  if (onlyIndex != null) {
    const p = pieces[Math.max(0, Math.min(onlyIndex, pieces.length - 1))]
    pieces = p ? [p] : []
  }
  if (!pieces.length) return { text: source, count: 0, error: '' }

  let out = ''
  let pos = 0
  for (const p of pieces) {
    out += source.slice(pos, p.index) + p.insert
    pos = p.index + p.length
  }
  out += source.slice(pos)
  return { text: out, count: pieces.length, error: '' }
}

export function findRangesInEl(root, query, options = {}, scopeRange = null) {
  const ranges = []
  if (!root || !query) return { ranges, error: '' }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  let error = ''
  while ((node = walker.nextNode())) {
    const val = node.nodeValue
    if (!val) continue
    if (scopeRange) {
      let intersects = false
      try {
        intersects = scopeRange.intersectsNode(node)
      } catch {
        intersects = false
      }
      if (!intersects) continue
    }

    let start = 0
    let end = val.length
    if (scopeRange) {
      if (node === scopeRange.startContainer) start = Math.max(0, scopeRange.startOffset)
      if (node === scopeRange.endContainer) end = Math.min(val.length, scopeRange.endOffset)
      if (end <= start) continue
    }

    const result = findMatchesInText(val, query, options)
    if (result.error) {
      error = result.error
      break
    }
    for (const match of result.matches) {
      if (match.index < start || match.index + match.length > end) continue
      const r = document.createRange()
      r.setStart(node, match.index)
      r.setEnd(node, match.index + match.length)
      ranges.push(r)
    }
  }
  return { ranges: error ? [] : ranges, error }
}

function clearSourceFindMarks(doc) {
  doc?.querySelectorAll(`.${SOURCE_FIND_MARK}`).forEach((node) => node.remove())
}

function sourceRangeRects(textarea, start, end) {
  const doc = textarea.ownerDocument
  const mirror = doc.createElement('div')
  syncTextareaMirrorStyle(textarea, mirror)
  mirror.appendChild(doc.createTextNode((textarea.value || '').slice(0, start)))
  const span = doc.createElement('span')
  span.textContent = (textarea.value || '').slice(start, end) || '\u200b'
  mirror.appendChild(span)
  doc.body.appendChild(mirror)
  try {
    const base = mirror.getBoundingClientRect()
    return Array.from(span.getClientRects()).map((rect) => ({
      left: rect.left - base.left,
      top: rect.top - base.top,
      width: rect.width,
      height: rect.height
    }))
  } finally {
    mirror.remove()
  }
}

function renderSourceFindHighlight(textarea) {
  const fullRange = textarea?.__hmSourceFindRange
  if (!textarea?.isConnected || !fullRange) return
  const doc = textarea.ownerDocument
  clearSourceFindMarks(doc)
  const mapRange = textarea.__hmSourceApi?.fullRangeToDisplayRange
  const displayRange = mapRange
    ? mapRange(fullRange.start, fullRange.end, false)
    : fullRange
  if (!displayRange || displayRange.end <= displayRange.start) return
  let rects
  try {
    rects = sourceRangeRects(textarea, displayRange.start, displayRange.end)
  } catch {
    return
  }
  const textareaRect = textarea.getBoundingClientRect()
  rects.forEach((rect) => {
    const left = textareaRect.left + rect.left - textarea.scrollLeft
    const top = textareaRect.top + rect.top - textarea.scrollTop
    const clippedLeft = Math.max(left, textareaRect.left)
    const clippedTop = Math.max(top, textareaRect.top)
    const clippedRight = Math.min(left + rect.width, textareaRect.right)
    const clippedBottom = Math.min(top + rect.height, textareaRect.bottom)
    if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return
    const mark = doc.createElement('div')
    mark.className = SOURCE_FIND_MARK
    mark.style.left = `${clippedLeft}px`
    mark.style.top = `${clippedTop}px`
    mark.style.width = `${clippedRight - clippedLeft}px`
    mark.style.height = `${clippedBottom - clippedTop}px`
    doc.body.appendChild(mark)
  })
}

export function paintSourceFindHighlight(textarea, start, end) {
  if (!textarea) return
  const doc = textarea.ownerDocument
  textarea.__hmSourceFindRange = { start, end }
  if (!textarea.__hmSourceFindCleanup) {
    let raf = 0
    let fallbackTimer = 0
    const schedule = () => {
      if (!raf) {
        raf = doc.defaultView.requestAnimationFrame(() => {
          raf = 0
          renderSourceFindHighlight(textarea)
        })
      }
      if (!fallbackTimer) {
        fallbackTimer = doc.defaultView.setTimeout(() => {
          fallbackTimer = 0
          if (raf) doc.defaultView.cancelAnimationFrame(raf)
          raf = 0
          renderSourceFindHighlight(textarea)
        }, 80)
      }
    }
    ;['scroll', 'input', 'hm:source-layout'].forEach((event) =>
      textarea.addEventListener(event, schedule, { passive: true })
    )
    doc.defaultView.addEventListener('resize', schedule)
    textarea.__hmSourceFindCleanup = () => {
      if (raf) doc.defaultView.cancelAnimationFrame(raf)
      if (fallbackTimer) doc.defaultView.clearTimeout(fallbackTimer)
      ;['scroll', 'input', 'hm:source-layout'].forEach((event) =>
        textarea.removeEventListener(event, schedule)
      )
      doc.defaultView.removeEventListener('resize', schedule)
      delete textarea.__hmSourceFindCleanup
      delete textarea.__hmSourceFindRange
      clearSourceFindMarks(doc)
    }
  }
  renderSourceFindHighlight(textarea)
}

export function revealSourceFindMatch(textarea, start, end) {
  if (!textarea || !Number.isInteger(start) || !Number.isInteger(end)) return false
  textarea.__hmSourceApi?.fullRangeToDisplayRange?.(start, end, true)
  let applied = false
  const apply = () => {
    if (applied) return true
    const mapRange = textarea.__hmSourceApi?.fullRangeToDisplayRange
    const displayRange = mapRange ? mapRange(start, end, false) : { start, end }
    if (!displayRange) return false
    textarea.setSelectionRange(displayRange.start, displayRange.end)
    try {
      const cs = textarea.ownerDocument.defaultView.getComputedStyle(textarea)
      const fontPx = parseFloat(cs.fontSize) || 14
      const linePx = parseFloat(cs.lineHeight) || fontPx * 1.75
      const y = textareaOffsetY(textarea, displayRange.start)
      const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight)
      textarea.scrollTop = Math.max(0, Math.min(maxScroll, y - (textarea.clientHeight - linePx) / 2))
    } catch {
      // The selection still identifies the hit if measurement is unavailable.
    }
    paintSourceFindHighlight(textarea, start, end)
    applied = true
    return true
  }
  apply()
  requestAnimationFrame(apply)
  setTimeout(apply, 90)
  return true
}

export function clearSourceFindHighlight(textarea) {
  if (textarea?.__hmSourceFindCleanup) {
    textarea.__hmSourceFindCleanup()
    return
  }
  if (textarea?.ownerDocument) {
    delete textarea.__hmSourceFindRange
    clearSourceFindMarks(textarea.ownerDocument)
  } else if (typeof document !== 'undefined') {
    clearSourceFindMarks(document)
  }
}

// Pick the first match at or after the position where find was opened. Milkdown
// supplies a collapsed DOM Range at the ProseMirror selection head; keep mode
// supplies the editor's scrollTop so later query edits do not drift after the
// previous result scrolls into view. If the anchor is past the final match, wrap
// to the first result just like next-match navigation does.
export function findRangeIndexFromStart(ranges, start) {
  if (!ranges?.length || !start) return 0

  if (start.kind === 'cursor' && start.range) {
    for (let i = 0; i < ranges.length; i++) {
      try {
        // Range.START_TO_START is 0. Avoid reading the global Range constructor
        // here so this helper remains unit-testable in the Node test environment.
        if (ranges[i].compareBoundaryPoints(0, start.range) >= 0) return i
      } catch {
        // A rerender may detach the saved cursor range. Fall back to document start.
        return 0
      }
    }
    return 0
  }

  if (start.kind === 'viewport' && start.scroller) {
    const scroller = start.scroller
    const startScrollTop = Number(start.scrollTop)
    if (!Number.isFinite(startScrollTop)) return 0
    const scrollerRect = scroller.getBoundingClientRect?.()
    const currentScrollTop = Number(scroller.scrollTop) || 0
    if (!scrollerRect) return 0

    for (let i = 0; i < ranges.length; i++) {
      const rect = ranges[i].getBoundingClientRect?.()
      // Hidden/collapsed matches have no box and cannot represent the visible
      // screen position. Search onward for the first rendered result.
      if (!rect || (!rect.width && !rect.height)) continue
      const contentBottom = rect.bottom - scrollerRect.top + currentScrollTop
      if (contentBottom >= startScrollTop) return i
    }
  }

  return 0
}

export function paintFindHighlights(ranges, activeIdx) {
  if (!findHighlightSupported) return
  CSS.highlights.delete(FIND_HL)
  CSS.highlights.delete(FIND_HL_CUR)
  if (!ranges.length) return
  CSS.highlights.set(FIND_HL, new Highlight(...ranges))
  if (ranges[activeIdx]) {
    const cur = new Highlight(ranges[activeIdx])
    cur.priority = 1
    CSS.highlights.set(FIND_HL_CUR, cur)
  }
}
export function scrollRangeIntoView(range, scroller) {
  if (!range || !scroller) return
  // Reveal the match inside any *nested* scroll containers first — e.g. keep-mode
  // table boxes (`.km-table-wrap`, overflow:auto, sticky header) clip both axes
  // with their own scroll position. scrollIntoView walks ALL scrollable ancestors
  // (the table box AND the outer scroller), which the manual scrollTop math below
  // cannot, and `inline:'nearest'` recovers columns hidden by horizontal scroll.
  const node = range.startContainer
  const el = node.nodeType === 3 ? node.parentElement : node
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  // Then center it in the editor scroller for comfortable reading.
  const rect = range.getBoundingClientRect()
  const sr = scroller.getBoundingClientRect()
  if (!rect.height && !rect.width) return
  if (rect.top < sr.top + 12 || rect.bottom > sr.bottom - 12) {
    scroller.scrollTop += (rect.top + rect.bottom) / 2 - (sr.top + sr.bottom) / 2
  }
}
// ── line-number locate ──
// Map a markdown *source line* to the top-level block that renders it, so the
// rich/keep preview can jump there. Uses the same block segmentation keep mode
// renders with (parseDoc), so a block's index equals its `.km-block[data-bi]`
// (keep) and lines up with the Nth top-level node in the Crepe/.ProseMirror tree.
export function docBlocks(content) {
  return parseDoc(toViewLines(String(content ?? '').split('\n')))
}
// Returns { bi, total } for a 1-based `lineNo`: bi = the containing block's
// index (or the next block when the line is a blank gap; -1 when there are no
// blocks), total = total line count. Out-of-range lines clamp to the ends.
export function blockIndexForLine(content, lineNo) {
  const total = String(content ?? '').split('\n').length
  const blocks = docBlocks(content)
  if (!blocks.length) return { bi: -1, total }
  const target = Math.max(0, Math.min(total - 1, (lineNo | 0) - 1)) // 0-based, clamped
  let bi = -1
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]
    if (target >= b.start && target <= b.end) { bi = k; break }
    if (b.start > target) { bi = k; break } // line fell in a blank gap → next block
  }
  if (bi === -1) bi = blocks.length - 1 // past the last block → last block
  return { bi, total }
}
export function matchIndices(text, query) {
  return findMatchesInText(text, query).matches.map((m) => m.index)
}
