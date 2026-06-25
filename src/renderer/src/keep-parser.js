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

// Inline rendering: preserve <br>, render bold / italic / inline code / links,
// everything else HTML-escaped. Display-only — never feeds back into the source.
export function inline(text) {
  const parts = String(text)
    .split(/<br\s*\/?>/i)
    .map((seg) => {
      let s = escapeHtml(seg)
      s = s.replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>')
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      return s
    })
  return parts.join('<br>')
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
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Fenced code block
    if (/^\s*```/.test(line)) {
      const start = i
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) i++
      if (i < lines.length) i++ // closing ```
      out.push({ type: 'code', start, end: i - 1 })
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
      /^[\s|:\-]+$/.test(lines[i + 1]) &&
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
    // List (contiguous; indented continuations stay in the block)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const start = i
      const baseIndent = line.search(/\S/)
      i++
      while (i < lines.length) {
        const cur = lines[i]
        if (cur.trim() === '') break // compact list — blank line ends it
        const ind = cur.search(/\S/)
        if (ind > baseIndent || /^\s*([-*+]|\d+[.)])\s+/.test(cur)) {
          i++
          continue
        }
        break
      }
      out.push({ type: 'list', start, end: i - 1 })
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
        !(
          lines[i].includes('|') &&
          i + 1 < lines.length &&
          /^[\s|:\-]+$/.test(lines[i + 1] || '') &&
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

// ── render helpers (return HTML strings; pure) ──
function renderList(b, viewLines) {
  const lines = viewLines.slice(b.start, b.end + 1)
  const ordered = /^\s*\d+[.)]\s+/.test(lines[0] || '')
  let html = ordered ? '<ol>' : '<ul>'
  for (const l of lines) {
    const m = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/)
    if (m) html += '<li>' + inline(m[2]) + '</li>'
    else html += '<li>' + inline(l.trim()) + '</li>'
  }
  html += ordered ? '</ol>' : '</ul>'
  return html
}

function renderTable(b, tableIdx, filterState, forExport) {
  const headers = b.headers
  let html = '<div class="km-table-wrap"><table class="km-table" data-ti="' + tableIdx + '"><thead><tr>'
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
      '"><div class="km-th-flex"><span class="km-th-content">' +
      inline(h) +
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
        inline(raw) +
        '</td>'
    }
    html += '</tr>'
  })
  html += '</tbody></table></div>'
  return html
}

// Render the whole document to HTML, plus return the parsed block map / viewLines
// so the caller (KeepEditor) can map edits back to source.
//   opts.srcEditLabel — label for the per-block "edit source" button
//   opts.forExport    — omit edit affordances (buttons / filter ▼) for PDF
export function renderDoc(rawLines, filterState = {}, opts = {}) {
  const forExport = !!opts.forExport
  const srcEditLabel = opts.srcEditLabel || 'edit'
  const viewLines = toViewLines(rawLines)
  const blocks = parseDoc(viewLines)
  let tableIdx = 0
  let html = ''
  blocks.forEach((b, bi) => {
    let inner = ''
    if (b.type === 'heading') {
      inner = '<h' + b.level + ' id="km-h-' + bi + '">' + inline(b.text) + '</h' + b.level + '>'
    } else if (b.type === 'paragraph') {
      inner = '<p>' + viewLines.slice(b.start, b.end + 1).map(inline).join('<br>') + '</p>'
    } else if (b.type === 'code') {
      inner = '<pre><code>' + escapeHtml(viewLines.slice(b.start + 1, b.end).join('\n')) + '</code></pre>'
    } else if (b.type === 'hr') {
      inner = '<hr>'
    } else if (b.type === 'quote') {
      inner =
        '<blockquote>' +
        inline(viewLines.slice(b.start, b.end + 1).map((l) => l.replace(/^\s*>\s?/, '')).join('<br>')) +
        '</blockquote>'
    } else if (b.type === 'list') {
      inner = renderList(b, viewLines)
    } else if (b.type === 'table') {
      inner = renderTable(b, tableIdx, filterState, forExport)
      tableIdx++
    }
    const editable = b.type !== 'table'
    html +=
      '<div class="km-block" data-bi="' +
      bi +
      '">' +
      (editable && !forExport
        ? '<button class="km-src-edit" data-bi="' + bi + '" type="button">' + escapeHtml(srcEditLabel) + '</button>'
        : '') +
      inner +
      '</div>'
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
