// Keep-mode (source-backed) parser & renderer — ported from the approved
// prototype (E:\AI\20260624\md-prototype.html). Pure functions only: no React,
// no DOM mutation, so they're safe to import anywhere and easy to swap later for
// a remark(position)-based parser behind the same interface.
//
// ── Line-ending responsibility boundary (the whole point of keep mode) ──
// The "正本" (source of truth) is `rawLines` — the file split on '\n', WITH any
// trailing '\r' kept intact. We never normalize \r away in the source: doing so
// would rewrite every CRLF line on save and blow the "zero diff" requirement.
//   • Save  = rawLines.join('\n')               (bytes unchanged where unedited)
//   • Parse / render = a `viewLines` view with \r stripped (`toViewLines`)
// Regexes below assume \r-free input, so ALWAYS pass viewLines (not rawLines) to
// parseDoc / the render helpers. Cell + block edits write back to rawLines and
// preserve the original line's \r (see replaceCellInLine / the block-edit path
// in KeepEditor). Forgetting this makes the heading/separator regexes ('$', '.')
// match the wrong thing on CRLF lines, so the dispatcher and the paragraph
// exclusion disagree, `i` stops advancing, and the parse loops forever →
// `RangeError: Invalid array length`. (A real trap hit in the prototype.)

import { isRelativePath, resolveToFileUrl } from './components/editor-images.js'

// ── language sniff (per-document writing font) ──
// Kana is a definitive Japanese signal (Han characters are shared with Chinese,
// so they are NOT). Callers put the result on the doc container's `lang`
// attribute; CSS `:lang(ja)` then switches the writing font to the Japanese
// stack (--font-write-ja) so kanji get Japanese glyph forms instead of the
// Chinese-font fallback. Covers hiragana, katakana and halfwidth katakana.
// (main/helpers.js docLangAttr mirrors this regex for the PDF/HTML export —
// keep the two in sync.)
const KANA_RE = /[ぁ-ゖァ-ヺｦ-ﾝ]/
export function detectDocLang(text) {
  const lines = Array.isArray(text) ? text : [text]
  for (const line of lines) if (KANA_RE.test(line)) return 'ja'
  return ''
}

// ── escaping ──
export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
export function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Re-enable HTML character references after escaping. escapeHtml turned every `&`
// into `&amp;`, which makes a source `&nbsp;` render as the literal text "&nbsp;"
// instead of a space. Turn an escaped, *well-formed* entity (`&amp;nbsp;`,
// `&amp;#160;`, `&amp;copy;`) back into a real reference so the browser decodes it,
// while a bare `&` (no trailing `;`) stays `&amp;` and shows as a literal "&".
// Safe: a decoded reference like `&lt;` renders as the character "<", never as a
// tag — the browser does not re-parse entity text as HTML.
function decodeEntityRefs(s) {
  return s.replace(/&amp;(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, '&$1;')
}

// Build a safe `href` from a link target that was ALREADY HTML-escaped (the whole
// segment ran through escapeHtml first, so `&`→`&amp;`, `<`→`&lt;`). We must NOT
// re-run escapeAttr — that would double-escape `&amp;` into `&amp;amp;`. We only
// (1) neutralize `"` so the URL can't break out of the attribute, and (2) blank a
// `javascript:`/`data:`/`vbscript:` scheme so a crafted link can't run code on
// click (keep mode renders real <a> via innerHTML).
function safeHref(escapedHref) {
  const probe = escapedHref.replace(/&amp;/gi, '&').trim().toLowerCase()
  if (/^(javascript|data|vbscript):/.test(probe)) return ''
  return escapedHref.replace(/"/g, '&quot;')
}

// Build a display `src` for an image. The path arrives ALREADY HTML-escaped (the
// segment ran through escapeHtml). A document-relative path is resolved against
// the doc folder as a file:// URL (display-only, like Milkdown's image node view —
// the source keeps the original relative path); http(s)/data/file URLs pass
// through. A `javascript:`/`vbscript:` scheme is blanked; `data:` is allowed so
// inline base64 images still render; `"` is neutralized so it can't break out.
function safeImgSrc(escapedSrc, baseDir) {
  const raw = escapedSrc.trim()
  if (baseDir && isRelativePath(raw)) return resolveToFileUrl(baseDir, raw).replace(/"/g, '&quot;')
  const probe = raw.replace(/&amp;/gi, '&').toLowerCase()
  if (/^(javascript|vbscript):/.test(probe)) return ''
  return raw.replace(/"/g, '&quot;')
}

// Inline rendering: preserve <br>, render bold / italic / inline code / images /
// links, everything else HTML-escaped. Display-only — never feeds back into the
// source. `baseDir` (the document's folder) resolves relative image paths.
export function inline(text, baseDir) {
  const parts = String(text)
    .split(/<br\s*\/?>/i)
    .map((seg) => {
      let s = escapeHtml(seg)
      // Pull inline code out first (placeholders) so neither entity decoding nor
      // the bold/italic passes touch a code span's literal contents — `` `&nbsp;` ``
      // must stay literal, like in standard Markdown.
      // Use a NUL sentinel (\x00…\x00) as the placeholder, never a space-wrapped
      // number: literal prose like "以下 2 区域" would otherwise be mistaken for a
      // placeholder on restore and render as <code>undefined</code>.
      const codes = []
      s = s.replace(/`([^`]+)`/g, (m, c) => {
        codes.push(c)
        return '\x00' + (codes.length - 1) + '\x00'
      })
      s = decodeEntityRefs(s)
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      // Images BEFORE links — otherwise the link regex grabs the `[alt](src)` part
      // and leaves a stray `!`.
      s = s.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        (m, alt, src) => '<img src="' + safeImgSrc(src, baseDir) + '" alt="' + alt.replace(/"/g, '&quot;') + '">'
      )
      s = s.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (m, label, href) => '<a href="' + safeHref(href) + '" target="_blank" rel="noopener">' + label + '</a>'
      )
      s = s.replace(/\x00(\d+)\x00/g, (m, i) => '<code>' + codes[+i] + '</code>')
      return s
    })
  return parts.join('<br>')
}

const TABLE_COL_MIN_EM = 6
const TABLE_COL_HEADER_MAX_EM = 22
const TABLE_COL_MAX_EM = 44
const WIDE_CHAR_RE =
  /[\u1100-\u115f\u2329\u232a\u2e80-\u303f\u3040-\u30ff\u3100-\u312f\u3130-\u318f\u31a0-\u31ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function stripWidthMarkup(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/&(?:#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, 'x')
    .replace(/[*_~]/g, '')
    .trim()
}

function measureTextEm(text) {
  let units = 0
  for (const ch of Array.from(stripWidthMarkup(text))) {
    if (/\s/.test(ch)) units += 0.35
    else if (WIDE_CHAR_RE.test(ch)) units += 1
    else units += 0.58
  }
  return units
}

export function estimateTableColumnWidths(headers, dataRows = []) {
  const widths = headers.map((h) =>
    clamp(Math.ceil(measureTextEm(h) + 4), TABLE_COL_MIN_EM, TABLE_COL_HEADER_MAX_EM)
  )

  dataRows.forEach((row) => {
    for (let ci = 0; ci < headers.length; ci++) {
      const raw = ci < row.cells.length ? row.cells[ci] : ''
      if (!raw) continue
      const segments = String(raw).split(/<br\s*\/?>/i)
      const brCount = Math.max(0, segments.length - 1)
      const maxSegment = segments.reduce((max, segment) => Math.max(max, measureTextEm(segment)), 0)
      const total = measureTextEm(segments.join(' '))
      const contentWidth = Math.max(
        maxSegment,
        total * (brCount ? 0.42 : 0.72) + Math.min(brCount, 6) * 1.2
      )
      widths[ci] = Math.max(widths[ci], clamp(Math.ceil(contentWidth + 2), TABLE_COL_MIN_EM, TABLE_COL_MAX_EM))
    }
  })

  return widths.map((width) => clamp(width, TABLE_COL_MIN_EM, TABLE_COL_MAX_EM))
}

// Split a table row on unescaped pipes, trimming the outer empties.
export function splitRow(line) {
  const t = String(line).trim()
  const parts = []
  let cur = ''
  let esc = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (ch === '\\' && !esc) {
      esc = true
      cur += ch
      continue
    }
    if (ch === '|' && !esc) {
      parts.push(cur)
      cur = ''
    } else cur += ch
    esc = false
  }
  parts.push(cur)
  if (parts.length && parts[0].trim() === '') parts.shift()
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop()
  return parts.map((p) => p.trim())
}

// rawLines (\r included) → viewLines (\r stripped), used for parse + display.
export function toViewLines(rawLines) {
  return rawLines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
}

// ── parse: build the source map of blocks ──
// `lines` MUST be \r-free (viewLines). Each block records its raw line range
// [start,end]; tables additionally carry headerLine / sepLine / headers /
// dataRows[{lineIdx, cells}] so cells map back to exact source lines.
export function parseDoc(lines) {
  const out = []
  // Emit a 'list' sub-block for the line range [s,e], trimming blank lines off
  // both ends (so a segment never starts/ends on a loose-list gap). Used to split
  // a list run into per-numbered-item blocks and around any nested table.
  const pushListSeg = (s, e) => {
    while (e >= s && lines[e].trim() === '') e--
    while (s <= e && lines[s].trim() === '') s++
    if (s <= e) out.push({ type: 'list', start: s, end: e })
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // YAML frontmatter: a `---` fence on the FIRST line, closed by `---` or `...`.
    // Only recognized when the closing fence exists — a lone opening `---` falls
    // through and stays an hr (locked by the characterization tests). Without
    // this branch the opener rendered as an hr and the body as a paragraph that
    // swallowed the closing fence.
    if (i === 0 && line.trim() === '---') {
      let j = 1
      while (j < lines.length && lines[j].trim() !== '---' && lines[j].trim() !== '...') j++
      if (j < lines.length) {
        out.push({ type: 'frontmatter', start: 0, end: j })
        i = j + 1
        continue
      }
    }
    // Fenced code block. Capture the info-string language so the renderer can turn
    // a ```mermaid fence into a live diagram (and leave others as code).
    if (/^\s*```/.test(line)) {
      const start = i
      const lang = line.replace(/^\s*```/, '').trim().split(/\s+/)[0].toLowerCase()
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) i++
      if (i < lines.length) i++ // closing ```
      out.push({ type: 'code', start, end: i - 1, lang })
      continue
    }
    // Block math: a line starting with `$$`. Closes on the next line containing
    // `$$` (covers both the single-line `$$ x $$` and the fenced multi-line form).
    if (/^\s*\$\$/.test(line)) {
      const start = i
      const after = line.slice(line.indexOf('$$') + 2)
      if (after.includes('$$')) {
        out.push({ type: 'mathblock', start, end: i })
        i++
        continue
      }
      i++
      while (i < lines.length && !lines[i].includes('$$')) i++
      if (i < lines.length) i++ // closing $$ line
      out.push({ type: 'mathblock', start, end: i - 1 })
      continue
    }
    // Heading
    const hm = line.match(/^(#{1,6})\s+(.*)$/)
    if (hm) {
      out.push({ type: 'heading', start: i, end: i, level: hm[1].length, text: hm[2] })
      i++
      continue
    }
    // Table (header row + separator row)
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('|') &&
      /^[\s|:-]+$/.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      const start = i
      const headerLine = i
      const sepLine = i + 1
      const dataRows = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        dataRows.push({ lineIdx: i, cells: splitRow(lines[i]) })
        i++
      }
      out.push({
        type: 'table',
        start,
        end: i - 1,
        headerLine,
        sepLine,
        headers: splitRow(lines[headerLine]),
        dataRows
      })
      continue
    }
    // Horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ type: 'hr', start: i, end: i })
      i++
      continue
    }
    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const start = i
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) i++
      out.push({ type: 'quote', start, end: i - 1 })
      continue
    }
    // List. Indented continuations stay in the block; a blank line keeps the
    // list together only if a same-level item or an indented continuation
    // follows (a "loose" list — still ONE list, so numbering stays continuous).
    // Otherwise the blank line ends it. `end` excludes trailing blank lines.
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const start = i
      const baseIndent = line.search(/\S/)
      let lastContent = i
      i++
      while (i < lines.length) {
        const cur = lines[i]
        if (cur.trim() === '') {
          let j = i + 1
          while (j < lines.length && lines[j].trim() === '') j++
          const nxt = j < lines.length ? lines[j] : null
          const nind = nxt ? nxt.search(/\S/) : -1
          if (nxt && (nind > baseIndent || (nind === baseIndent && /^\s*([-*+]|\d+[.)])\s+/.test(nxt)))) {
            i = j // loose list: skip the blank gap and keep going
            continue
          }
          break // blank line ends the list
        }
        const ind = cur.search(/\S/)
        if (ind > baseIndent || /^\s*([-*+]|\d+[.)])\s+/.test(cur)) {
          lastContent = i
          i++
          continue
        }
        break
      }
      // Segment the list run instead of emitting one block, so a long numbered
      // list (each step a separate edit target) and any indented table inside a
      // list item render the way the source reads:
      //   • a NESTED TABLE breaks out as its own `table` block — it then gets the
      //     real grid + cell editing + filters + structural edits (table mode),
      //     while the surrounding item text stays source-editable (block mode).
      //   • a new top-level NUMBERED item (番号) starts its own `list` block, so
      //     editing one step doesn't open the whole list as one textarea.
      // Bullet (-/*/+) runs are NOT split — they stay one block (unchanged).
      const runEnd = lastContent
      let segStart = start
      let p = start
      while (p <= runEnd) {
        // Nested table: a `|`-row followed by a `---` separator (both possibly
        // indented). Flush the list text before it, emit a table block, resume.
        if (
          lines[p].includes('|') &&
          p + 1 <= runEnd &&
          /^[\s|:-]+$/.test(lines[p + 1]) &&
          lines[p + 1].includes('-')
        ) {
          pushListSeg(segStart, p - 1)
          const headerLine = p
          const sepLine = p + 1
          const dataRows = []
          let q = p + 2
          while (q <= runEnd && lines[q].includes('|') && lines[q].trim() !== '') {
            dataRows.push({ lineIdx: q, cells: splitRow(lines[q]) })
            q++
          }
          out.push({
            type: 'table',
            start: headerLine,
            end: q - 1,
            headerLine,
            sepLine,
            headers: splitRow(lines[headerLine]),
            dataRows
          })
          p = q
          segStart = q
          continue
        }
        // A new top-level numbered item begins its own block (番号 granularity).
        if (p > segStart && lines[p].search(/\S/) === baseIndent && /^\s*\d+[.)]\s+/.test(lines[p])) {
          pushListSeg(segStart, p - 1)
          segStart = p
        }
        p++
      }
      pushListSeg(segStart, runEnd)
      i = lastContent + 1
      continue
    }
    // Blank line
    if (line.trim() === '') {
      i++
      continue
    }
    // Paragraph (everything until a blank line or a block-starter)
    {
      const start = i
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^#{1,6}\s+/.test(lines[i]) &&
        !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
        !/^\s*>\s?/.test(lines[i]) &&
        !/^\s*```/.test(lines[i]) &&
        !/^\s*\$\$/.test(lines[i]) &&
        !(
          lines[i].includes('|') &&
          i + 1 < lines.length &&
          /^[\s|:-]+$/.test(lines[i + 1] || '') &&
          (lines[i + 1] || '').includes('-')
        )
      ) {
        i++
      }
      if (i === start) i++ // safety: always advance so the loop can't hang
      out.push({ type: 'paragraph', start, end: i - 1 })
    }
  }
  return out
}

// ── cell edit: replace ONE cell on ONE raw line, leaving the rest byte-identical ──
// Operates on the RAW line (\r included) so the trailing \r and every other cell
// survive untouched. Only the target column's pipe-delimited slice is swapped.
export function replaceCellInLine(line, colIdx, newValue) {
  const t = String(line).trim()
  const hasLead = t.startsWith('|')
  const parts = []
  let cur = ''
  let esc = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && !esc) {
      esc = true
      cur += ch
      continue
    }
    if (ch === '|' && !esc) {
      parts.push(cur)
      cur = ''
    } else cur += ch
    esc = false
  }
  parts.push(cur)
  const cellIdx = (hasLead ? 1 : 0) + colIdx
  if (cellIdx < parts.length) parts[cellIdx] = ' ' + newValue + ' '
  return parts.join('|')
}

// ── structural table edits (keep mode) ──
// All operate on RAW lines (\r preserved) and stay strictly within the table's
// line range, so the zero-diff guarantee holds outside the touched table. They
// edit pipe segments in place (like replaceCellInLine), so every cell the edit
// doesn't touch keeps its exact original bytes.

// Split a raw line into pipe segments (NOT trimmed), tracking the trailing \r and
// whether the row leads with a pipe. Mirrors splitRow/replaceCellInLine parsing.
function splitSegments(line) {
  const eol = String(line).endsWith('\r') ? '\r' : ''
  const body = eol ? line.slice(0, -1) : line
  const parts = []
  let cur = ''
  let esc = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\' && !esc) {
      esc = true
      cur += ch
      continue
    }
    if (ch === '|' && !esc) {
      parts.push(cur)
      cur = ''
    } else cur += ch
    esc = false
  }
  parts.push(cur)
  return { parts, eol, body }
}

// Insert a new column segment at column `colIdx` (the new column takes that
// index). `content` is the cell body (e.g. '' for data/header, '---' for sep).
export function insertColumnInLine(line, colIdx, content) {
  const { parts, eol, body } = splitSegments(line)
  const hasLead = body.trim().startsWith('|')
  const pos = (hasLead ? 1 : 0) + colIdx
  parts.splice(Math.max(0, Math.min(pos, parts.length)), 0, ' ' + content + ' ')
  return parts.join('|') + eol
}

// Remove the column segment at `colIdx`. No-op if the index is out of range.
export function removeColumnInLine(line, colIdx) {
  const { parts, eol, body } = splitSegments(line)
  const hasLead = body.trim().startsWith('|')
  const pos = (hasLead ? 1 : 0) + colIdx
  if (pos >= 0 && pos < parts.length) parts.splice(pos, 1)
  return parts.join('|') + eol
}

// Build a blank data row with `nCols` empty cells, matching `refLine`'s pipe
// style (leading/trailing pipe + \r) so the new line blends into the table.
export function buildTableRow(nCols, refLine) {
  const eol = String(refLine).endsWith('\r') ? '\r' : ''
  const noEol = eol ? refLine.slice(0, -1) : refLine
  // Keep the reference row's leading indentation so a row inserted into a nested
  // (indented, in-list) table stays indented — else it'd drop to column 0 and the
  // list run would no longer cover it, splitting the table on the next parse.
  const indent = (noEol.match(/^\s*/) || [''])[0]
  const t = noEol.trim()
  const lead = t.startsWith('|')
  const trail = t.endsWith('|')
  const inner = Array(Math.max(1, nCols)).fill('  ').join('|')
  return indent + (lead ? '|' : '') + inner + (trail ? '|' : '') + eol
}

// ── block-edit write-back: replace a non-table block's raw line range [start,end]
// with new source text, leaving every line OUTSIDE that range byte-identical. The
// new text (the view-text from the block's "edit source" textarea, split on '\n')
// inherits the block's original EOL style — the trailing-\r presence of its first
// raw line — so untouched bytes never shift across a CRLF/LF boundary and the
// "zero diff" guarantee holds outside the edited block. Returns a NEW rawLines
// array; the input is not mutated. Mirrors the splice in KeepEditor's block
// "edit source" commit (the single source of truth stays rawLines).
export function replaceBlockLines(rawLines, start, end, newText) {
  const eol = String(rawLines[start] || '').endsWith('\r') ? '\r' : ''
  const newLines = String(newText)
    .split('\n')
    .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l) + eol)
  const out = rawLines.slice()
  out.splice(start, end - start + 1, ...newLines)
  return out
}

// ── render helpers (return HTML strings; pure) ──
function renderList(b, viewLines, baseDir, opts = {}) {
  const lines = viewLines.slice(b.start, b.end + 1)
  // Parse each line into a list item carrying its own indent depth and marker
  // type (ordered vs bullet). Unmarked indented lines are continuations of the
  // previous item (e.g. a wrapped paragraph), appended with a soft break. Each
  // marker line also records its source line (b.start + k) so a GFM task item's
  // checkbox can map a click back to exactly one raw line.
  const items = []
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k]
    if (l.trim() === '') continue // loose-list gaps carry no content
    const m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (m) {
      const num = m[2].match(/^\d+/)
      // GFM task item: `[ ]` / `[x]` right after the marker, then a space (or
      // nothing — an empty task). `- [x]foo` (no space) stays literal text.
      const task = m[3].match(/^\[([ xX])\](?:\s+(.*))?$/)
      items.push({
        indent: m[1].length,
        ordered: !!num,
        start: num ? +num[0] : null,
        task: !!task,
        checked: !!task && task[1] !== ' ',
        line: b.start + k,
        html: inline(task ? task[2] || '' : m[3], baseDir)
      })
    } else if (items.length) {
      items[items.length - 1].html += '<br>' + inline(l.trim(), baseDir)
    } else {
      items.push({ indent: 0, ordered: false, html: inline(l.trim(), baseDir) })
    }
  }
  // A task item's checkbox is a REAL <input> carrying its source line. It's only
  // interactive where a click handler exists to write the toggle back (the VSCode
  // webview passes opts.interactiveTasks); elsewhere (desktop keep mode, PDF
  // export) it renders disabled — an enabled box with no handler would toggle
  // visually and silently revert on the next re-render, which is worse.
  const taskBox = (it) =>
    it.task
      ? '<input type="checkbox" class="km-task-cb" data-line="' +
        it.line +
        '"' +
        (it.checked ? ' checked' : '') +
        (opts.interactiveTasks ? '' : ' disabled') +
        '>'
      : ''
  const liOpen = (it) => '<li' + (it.task ? ' class="km-task-item"' : '') + '>' + taskBox(it) + it.html
  // Build nested <ul>/<ol> from the indent levels. Each nesting level keeps the
  // marker type of its first item, so a "1." parent with "-" children renders as
  // an ordered list containing a bullet sublist (not one flat numbered list).
  let html = ''
  const stack = [] // open lists, innermost last: { indent, ordered }
  const openList = (it) => {
    stack.push({ indent: it.indent, ordered: it.ordered })
    // Honor the first item's number (CommonMark: a list's start = its first
    // item's marker). `<ol>` alone always restarts at 1, so "3. / 4." rendered
    // as 1. / 2. — emit start="3" when it isn't the default.
    const open = it.ordered
      ? '<ol' + (it.start != null && it.start !== 1 ? ' start="' + it.start + '"' : '') + '>'
      : '<ul>'
    html += open + liOpen(it)
  }
  const closeList = () => {
    const s = stack.pop()
    html += '</li>' + (s.ordered ? '</ol>' : '</ul>')
  }
  for (const it of items) {
    if (!stack.length || it.indent > stack[stack.length - 1].indent) {
      openList(it) // first list, or a sublist nested inside the open <li>
      continue
    }
    while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) closeList()
    html += '</li>' + liOpen(it) // sibling at the current level
  }
  while (stack.length) closeList()
  return html
}

function renderTable(b, tableIdx, filterState, forExport, baseDir) {
  const headers = b.headers
  const colWidths = estimateTableColumnWidths(headers, b.dataRows)
  const tableWidth = Math.ceil(colWidths.reduce((sum, width) => sum + width, 0))
  let html =
    '<div class="km-table-wrap"><table class="km-table" data-ti="' +
    tableIdx +
    '" style="--km-table-min-width:' +
    tableWidth +
    'em"><colgroup>'
  colWidths.forEach((width) => {
    html += '<col style="width:' + width + 'em">'
  })
  html += '</colgroup><thead><tr>'
  headers.forEach((h, ci) => {
    const active =
      !forExport && filterState[tableIdx] && filterState[tableIdx][ci] && filterState[tableIdx][ci].size > 0
    const filterBtn = forExport
      ? ''
      : '<button class="km-filter-btn' +
        (active ? ' active' : '') +
        '" data-ti="' +
        tableIdx +
        '" data-ci="' +
        ci +
        '" type="button" title="筛选">&#9660;</button>'
    html +=
      '<th data-line="' +
      b.headerLine +
      '" data-ci="' +
      ci +
      '" data-raw="' +
      escapeAttr(h) +
      '"><div class="km-th-flex"><span class="km-th-content">' +
      inline(h, baseDir) +
      '</span>' +
      filterBtn +
      '</div></th>'
  })
  html += '</tr></thead><tbody>'
  b.dataRows.forEach((r, ri) => {
    html += '<tr data-ri="' + ri + '">'
    for (let ci = 0; ci < headers.length; ci++) {
      const raw = ci < r.cells.length ? r.cells[ci] : ''
      html +=
        '<td data-line="' +
        r.lineIdx +
        '" data-ci="' +
        ci +
        '" data-raw="' +
        escapeAttr(raw) +
        '">' +
        inline(raw, baseDir) +
        '</td>'
    }
    html += '</tr>'
  })
  html += '</tbody></table></div>'
  return html
}

// Render ONE block's interior (the "edit source" button + its content HTML), i.e.
// everything that goes *inside* the wrapping `<div class="km-block">`. Factored out
// of renderDoc so KeepEditor can rebuild a single block in place (e.g. restoring a
// block after a clean edit-cancel) without re-rendering — and re-serializing — the
// whole document. Tables are never block-edited, so `tableIdx` only matters when
// renderDoc drives the full loop; scoped single-block restores are non-table.
//   opts.srcEditLabel · opts.forExport · opts.filterState · opts.tableIdx
//   opts.interactiveTasks — render GFM task checkboxes enabled (the caller wires
//   the click → single-line toggle); default disabled (display-only).
export function renderBlockInner(b, bi, viewLines, opts = {}) {
  const forExport = !!opts.forExport
  const srcEditLabel = opts.srcEditLabel || 'edit'
  const collapseLabel = opts.collapseLabel || 'Collapse / expand section'
  const filterState = opts.filterState || {}
  const tableIdx = opts.tableIdx || 0
  const baseDir = opts.baseDir
  let inner = ''
  if (b.type === 'heading') {
    // A chevron toggle in the left gutter folds the heading's section (KeepEditor
    // wires the click → pure DOM visibility, never touching the source). Omitted
    // for export so the printed/PDF doc shows every section expanded.
    const collapseBtn = forExport
      ? ''
      : '<button class="km-collapse-toggle" type="button" tabindex="-1" title="' +
        escapeAttr(collapseLabel) +
        '" aria-label="' +
        escapeAttr(collapseLabel) +
        '"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>'
    inner =
      '<h' + b.level + ' id="km-h-' + bi + '" class="km-heading">' + collapseBtn + inline(b.text, baseDir) + '</h' + b.level + '>'
  } else if (b.type === 'paragraph') {
    inner = '<p>' + viewLines.slice(b.start, b.end + 1).map((l) => inline(l, baseDir)).join('<br>') + '</p>'
  } else if (b.type === 'code') {
    const body = viewLines.slice(b.start + 1, b.end).join('\n')
    // A ```mermaid fence renders as a live diagram (filled by KeepEditor after
    // render); every other language stays a plain code block. The source still
    // round-trips and edits through the block "edit source" affordance.
    inner =
      b.lang === 'mermaid'
        ? '<div class="km-mermaid" data-code="' + escapeAttr(body) + '"></div>'
        : '<pre><code>' + escapeHtml(body) + '</code></pre>'
  } else if (b.type === 'mathblock') {
    // Strip the $$ delimiters; KeepEditor renders the TeX with KaTeX after render.
    const tex = viewLines
      .slice(b.start, b.end + 1)
      .join('\n')
      .replace(/^\s*\$\$/, '')
      .replace(/\$\$\s*$/, '')
      .trim()
    inner = '<div class="km-math" data-tex="' + escapeAttr(tex) + '"></div>'
  } else if (b.type === 'hr') {
    inner = '<hr>'
  } else if (b.type === 'quote') {
    inner =
      '<blockquote>' +
      inline(viewLines.slice(b.start, b.end + 1).map((l) => l.replace(/^\s*>\s?/, '')).join('<br>'), baseDir) +
      '</blockquote>'
  } else if (b.type === 'list') {
    inner = renderList(b, viewLines, baseDir, { interactiveTasks: !!opts.interactiveTasks && !forExport })
  } else if (b.type === 'table') {
    inner = renderTable(b, tableIdx, filterState, forExport, baseDir)
  } else if (b.type === 'frontmatter') {
    // Metadata card, mirroring the rich editor's frontmatter node view
    // (editor-frontmatter.js buildCard): flat `key: value` lines → a definition
    // grid; any complex YAML (nesting, lists, multiline) → a code box so we never
    // misrender. Non-table, so the block keeps the generic "edit source" button —
    // editing round-trips through the raw lines, zero-diff.
    const body = viewLines.slice(b.start + 1, b.end)
    const simple = body.every((l) => l.trim() === '' || /^[A-Za-z0-9_.-]+:\s?.*$/.test(l))
    let content = ''
    if (simple) {
      let grid = ''
      for (const l of body) {
        const m = l.match(/^([A-Za-z0-9_.-]+):\s?(.*)$/)
        if (m) grid += '<dt>' + escapeHtml(m[1]) + '</dt><dd>' + escapeHtml(m[2]) + '</dd>'
      }
      if (grid) content = '<dl class="km-fm-grid">' + grid + '</dl>'
    }
    if (!content) content = '<pre class="km-fm-raw">' + escapeHtml(body.join('\n')) + '</pre>'
    inner = '<div class="km-frontmatter"><div class="km-fm-head">YAML</div>' + content + '</div>'
  }
  const editable = b.type !== 'table'
  const btn =
    editable && !forExport
      ? '<button class="km-src-edit" data-bi="' +
        bi +
        '" type="button" title="' +
        escapeAttr(srcEditLabel) +
        '"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>' +
        escapeHtml(srcEditLabel) +
        '</span></button>'
      : ''
  return btn + inner
}

// Render the `[from, to)` slice of an already-parsed block list to wrapped HTML
// (`<div class="km-block">…</div>` per block). Factored out of renderDoc so
// KeepEditor can paint a large document in chunks across idle frames instead of
// in one blocking innerHTML. `startTableIdx` is the running table counter at
// `from` — tables key their filter state by index, so the count must continue
// unbroken across chunks; the returned `tableIdx` threads into the next slice.
// `opts` mirrors renderBlockInner's (srcEditLabel / collapseLabel / forExport /
// filterState / baseDir); `tableIdx` is supplied per block here, not by the caller.
export function renderBlockRange(blocks, viewLines, from, to, startTableIdx = 0, opts = {}) {
  let tableIdx = startTableIdx
  let html = ''
  for (let bi = from; bi < to; bi++) {
    const b = blocks[bi]
    const innerHtml = renderBlockInner(b, bi, viewLines, { ...opts, tableIdx })
    if (b.type === 'table') tableIdx++
    // Heading blocks carry their level so KeepEditor can compute the section range
    // (every following block until the next heading of the same or higher level).
    const hlevel = b.type === 'heading' ? ' data-hlevel="' + b.level + '"' : ''
    html += '<div class="km-block"' + hlevel + ' data-bi="' + bi + '">' + innerHtml + '</div>'
  }
  return { html, tableIdx }
}

// Render the whole document to HTML, plus return the parsed block map / viewLines
// so the caller (KeepEditor) can map edits back to source.
//   opts.srcEditLabel — label for the per-block "edit source" button
//   opts.collapseLabel — label for the per-heading collapse/expand toggle
//   opts.forExport    — omit edit affordances (buttons / filter ▼) for PDF
//   opts.baseDir      — document folder, for resolving relative image paths
export function renderDoc(rawLines, filterState = {}, opts = {}) {
  const viewLines = toViewLines(rawLines)
  const blocks = parseDoc(viewLines)
  const { html } = renderBlockRange(blocks, viewLines, 0, blocks.length, 0, {
    forExport: !!opts.forExport,
    srcEditLabel: opts.srcEditLabel || 'edit',
    collapseLabel: opts.collapseLabel,
    filterState,
    baseDir: opts.baseDir,
    interactiveTasks: !!opts.interactiveTasks
  })
  return { html: html || '<div class="km-empty"></div>', blocks, viewLines }
}

// Headings for the outline panel, in document order.
export function extractHeadings(blocks) {
  const out = []
  blocks.forEach((b, bi) => {
    if (b.type === 'heading') out.push({ level: b.level, text: b.text, bi })
  })
  return out
}
