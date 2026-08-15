const escapeCodeText = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * Split code source without discarding intentional empty or trailing lines.
 * Generated line numbers are presentation-only CSS counters, so this array
 * remains the exact clipboard/save text contract.
 */
export function splitCodeLines(source) {
  return String(source ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
}

/**
 * Render semantic code rows shared by Keep and the PDF snapshot. The markup
 * deliberately contains no numeric text: `.hm-code-line::before` owns the
 * visual counter, keeping copy/paste and Markdown round-trips source-clean.
 */
export function renderCodeLinesHtml(source) {
  return splitCodeLines(source)
    .map(
      (line) =>
        '<span class="hm-code-line"><span class="hm-code-line-text">' +
        escapeCodeText(line) +
        '</span></span>'
    )
    .join('')
}

export function renderNumberedCodeBlockHtml(source) {
  return (
    '<pre class="hm-code-block"><code class="hm-code-lines">' +
    renderCodeLinesHtml(source) +
    '</code></pre>'
  )
}
