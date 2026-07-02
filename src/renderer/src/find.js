// find-in-document helpers
// Search is scoped to the editor content only (the rich .ProseMirror element or
// the source <textarea>), never the find bar or other UI — so the text typed in
// the find box is never itself matched. Highlighting uses the CSS Custom
// Highlight API, which paints ranges without touching the DOM.
import { parseDoc, toViewLines } from './keep-parser.js'
const FIND_HL = 'hm-find'
const FIND_HL_CUR = 'hm-find-current'
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
