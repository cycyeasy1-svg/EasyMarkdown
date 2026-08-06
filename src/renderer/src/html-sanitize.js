// Pure, allow-list based HTML support shared by the rich editor and Keep mode.
//
// Keep's parser is bundled into both the desktop renderer and the VSCode webview,
// and is also exercised in Node-only unit tests. Keep this module DOM-free: it
// rebuilds recognized tags/attributes instead of trusting a browser parser, so
// the returned string is safe to assign to innerHTML in every host.

const BLOCK_ROOT_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'details',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul'
])

const INLINE_ROOT_TAGS = new Set([
  'abbr',
  'b',
  'big',
  'cite',
  'del',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var'
])

// Inside an already-recognized raw HTML container, preserve ordinary safe HTML
// links and images as well. They remain disabled as standalone inline roots so
// the existing strict empty-anchor rule and Markdown image/link syntax keep
// owning normal prose.
const CONTAINER_INLINE_ROOT_TAGS = new Set([...INLINE_ROOT_TAGS, 'a', 'img'])

// Neutral block containers commonly wrap Markdown produced by generators and
// converters. Their own tags still render as HTML, but their body is allowed to
// go back through the Markdown renderer (for example a GFM table inside <div>).
// Structural/raw-text roots such as table, ul, pre and p intentionally stay out:
// their children are HTML content, not a second Markdown document.
const MARKDOWN_CONTAINER_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'details',
  'div',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'header',
  'main',
  'nav',
  'section'
])

const SAFE_TAGS = new Set([
  ...BLOCK_ROOT_TAGS,
  ...INLINE_ROOT_TAGS,
  'a',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'dt',
  'hr',
  'img',
  'li'
])

const VOID_TAGS = new Set(['br', 'col', 'hr', 'img'])

const SAFE_ATTRS = new Set([
  'align',
  'alt',
  'border',
  'cellpadding',
  'cellspacing',
  'cite',
  'class',
  'color',
  'colspan',
  'datetime',
  'decoding',
  'dir',
  'face',
  'headers',
  'height',
  'href',
  'id',
  'lang',
  'loading',
  'name',
  'open',
  'rel',
  'role',
  'rowspan',
  'scope',
  'size',
  'span',
  'src',
  'start',
  'style',
  'target',
  'title',
  'type',
  'valign',
  'width'
])

// Presentation-only CSS. In particular, position/z-index/transform and URL-bearing
// properties are excluded so document HTML cannot cover or impersonate app chrome.
const SAFE_STYLE_PROPS = new Set([
  'background-color',
  'border',
  'border-bottom',
  'border-bottom-color',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-bottom-style',
  'border-bottom-width',
  'border-collapse',
  'border-color',
  'border-left',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-radius',
  'border-right',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-spacing',
  'border-style',
  'border-top',
  'border-top-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-top-style',
  'border-top-width',
  'border-width',
  'caption-side',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'letter-spacing',
  'line-height',
  'list-style-type',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'overflow-wrap',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'text-transform',
  'vertical-align',
  'white-space',
  'width',
  'word-break'
])

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Read one HTML tag without letting a `>` inside a quoted attribute terminate it.
// Returns null for malformed markup; callers then display the `<` as literal text.
function readTagAt(source, start) {
  if (source[start] !== '<') return null
  if (source.startsWith('<!--', start)) {
    const close = source.indexOf('-->', start + 4)
    return close < 0
      ? null
      : { kind: 'comment', start, end: close + 3, raw: source.slice(start, close + 3) }
  }

  let i = start + 1
  while (/\s/.test(source[i] || '')) i++
  let closing = false
  if (source[i] === '/') {
    closing = true
    i++
    while (/\s/.test(source[i] || '')) i++
  }

  const nameMatch = source.slice(i).match(/^[A-Za-z][A-Za-z0-9-]*/)
  if (!nameMatch) return null
  const name = nameMatch[0].toLowerCase()
  i += nameMatch[0].length
  const attrsStart = i
  let quote = ''
  for (; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') {
      const raw = source.slice(start, i + 1)
      const attrSource = source.slice(attrsStart, i)
      return {
        kind: 'tag',
        start,
        end: i + 1,
        raw,
        name,
        closing,
        selfClosing: !closing && /\/\s*$/.test(attrSource),
        attrSource
      }
    }
    if (ch === '<') return null
  }
  return null
}

function decodeUrlProbe(value) {
  return String(value)
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (_, hex, dec) => {
      const code = parseInt(hex || dec, hex ? 16 : 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    })
    .replace(/&(colon|tab|newline);?/gi, (_, name) => {
      if (name.toLowerCase() === 'colon') return ':'
      return name.toLowerCase() === 'tab' ? '\t' : '\n'
    })
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .toLowerCase()
}

function safeUrlAttr(name, value) {
  const probe = decodeUrlProbe(value)
  if (/^(javascript|vbscript):/.test(probe)) return null
  if (name === 'href' && /^data:/.test(probe)) return null
  if (
    name === 'src' &&
    /^data:/.test(probe) &&
    !/^data:image\/(?:avif|gif|jpeg|jpg|png|webp)(?:;|,)/.test(probe)
  ) {
    return null
  }
  return value
}

function sanitizeStyle(value) {
  const safe = []
  for (const declaration of String(value).split(';')) {
    const colon = declaration.indexOf(':')
    if (colon < 1) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const cssValue = declaration.slice(colon + 1).trim()
    if (!SAFE_STYLE_PROPS.has(property) || !cssValue) continue
    if (/[<>]|url\s*\(|expression\s*\(|@import|javascript:|vbscript:|data:/i.test(cssValue)) {
      continue
    }
    safe.push(property + ': ' + cssValue)
  }
  return safe.join('; ')
}

function sanitizeAttributes(tag, options) {
  const source = tag.attrSource.replace(/\/\s*$/, '')
  const attrs = []
  let i = 0
  while (i < source.length) {
    while (/\s/.test(source[i] || '')) i++
    if (i >= source.length) break

    const match = source.slice(i).match(/^[^\s"'<>/=]+/)
    if (!match) return null
    const originalName = match[0]
    const name = originalName.toLowerCase()
    i += originalName.length
    while (/\s/.test(source[i] || '')) i++

    let value = null
    if (source[i] === '=') {
      i++
      while (/\s/.test(source[i] || '')) i++
      const quote = source[i] === '"' || source[i] === "'" ? source[i++] : ''
      const valueStart = i
      if (quote) {
        while (i < source.length && source[i] !== quote) i++
        if (i >= source.length) return null
        value = source.slice(valueStart, i)
        i++
      } else {
        while (i < source.length && !/\s/.test(source[i])) i++
        value = source.slice(valueStart, i)
      }
    }

    if (!SAFE_ATTRS.has(name) && !/^aria-[a-z0-9_.:-]+$/.test(name)) continue
    if (/^on/i.test(name)) continue

    if (name === 'style') {
      value = sanitizeStyle(value || '')
      if (!value) continue
    } else if (name === 'href' || name === 'src' || name === 'cite') {
      value = safeUrlAttr(name, value || '')
      if (value == null) continue
      if (
        name === 'src' &&
        tag.name === 'img' &&
        typeof options.resolveImageSrc === 'function'
      ) {
        try {
          value = options.resolveImageSrc(value)
        } catch {
          continue
        }
      }
    } else if (name === 'target' && !/^_(?:blank|self)$/i.test(value || '')) {
      continue
    }

    if (value == null) attrs.push(name)
    else attrs.push(name + '="' + escapeAttribute(value) + '"')
  }
  return attrs
}

function rebuildTag(tag, options) {
  if (!SAFE_TAGS.has(tag.name)) return escapeText(tag.raw)
  if (tag.closing) return VOID_TAGS.has(tag.name) ? '' : '</' + tag.name + '>'
  const attrs = sanitizeAttributes(tag, options)
  if (!attrs) return escapeText(tag.raw)
  const suffix = tag.selfClosing && !VOID_TAGS.has(tag.name) ? ' /' : ''
  return '<' + tag.name + (attrs.length ? ' ' + attrs.join(' ') : '') + suffix + '>'
}

export function sanitizeHtmlFragment(html, options = {}) {
  const source = String(html)
  let out = ''
  let cursor = 0
  while (cursor < source.length) {
    const lt = source.indexOf('<', cursor)
    if (lt < 0) {
      out += source.slice(cursor)
      break
    }
    out += source.slice(cursor, lt)
    const tag = readTagAt(source, lt)
    if (!tag) {
      out += '&lt;'
      cursor = lt + 1
      continue
    }
    if (tag.kind === 'tag') out += rebuildTag(tag, options)
    // HTML comments are display metadata and are intentionally omitted.
    cursor = tag.end
  }
  return out
}

function leadingTag(source, start = 0) {
  let pos = start
  while (/\s/.test(source[pos] || '')) pos++
  const tag = readTagAt(source, pos)
  return tag?.kind === 'tag' ? tag : null
}

export function isRenderableBlockHtml(value) {
  const tag = leadingTag(String(value))
  return !!tag && !tag.closing && BLOCK_ROOT_TAGS.has(tag.name)
}

export function isRenderableInlineHtml(value) {
  const source = String(value)
  const match = matchRenderableInlineHtml(source, source.search(/\S|$/))
  return !!match && source.slice(match.end).trim() === ''
}

// Recognize a lone opening/closing neutral container tag. Remark may split a
// Markdown-bearing block into `<div>` · table · `</div>` sibling nodes; the rich
// editor uses this descriptor to merge that run back to its exact source slice.
export function matchMarkdownContainerTag(value) {
  const source = String(value)
  const tag = leadingTag(source)
  if (
    !tag ||
    tag.selfClosing ||
    !MARKDOWN_CONTAINER_TAGS.has(tag.name) ||
    source.slice(tag.end).trim()
  ) {
    return null
  }
  return { name: tag.name, closing: tag.closing }
}

// Return the exact source end and wrapper/body split of a recognized inline
// fragment. The Markdown renderer sanitizes the wrapper and parses the body.
export function matchRenderableInlineHtml(source, start, options = {}) {
  const first = readTagAt(source, start)
  const allowedTags = options.container ? CONTAINER_INLINE_ROOT_TAGS : INLINE_ROOT_TAGS
  if (
    !first ||
    first.kind !== 'tag' ||
    first.closing ||
    !allowedTags.has(first.name)
  ) {
    return null
  }

  if (first.selfClosing || VOID_TAGS.has(first.name)) {
    return {
      end: first.end,
      html: source.slice(start, first.end),
      open: first.raw,
      inner: '',
      close: ''
    }
  }

  let depth = 0
  let cursor = start
  while (cursor < source.length) {
    const lt = source.indexOf('<', cursor)
    if (lt < 0) break
    const tag = readTagAt(source, lt)
    if (!tag) {
      cursor = lt + 1
      continue
    }
    if (tag.kind === 'tag' && tag.name === first.name) {
      if (tag.closing) depth--
      else if (!tag.selfClosing) depth++
      if (depth === 0) {
        return {
          end: tag.end,
          html: source.slice(start, tag.end),
          open: first.raw,
          inner: source.slice(first.end, tag.start),
          close: tag.raw
        }
      }
    }
    cursor = tag.end
  }
  return null
}

// Split a balanced neutral HTML block into its wrapper and Markdown-capable body.
// Only surrounding whitespace may follow the closing tag; otherwise the old
// whole-fragment sanitizer remains the safer, lossless fallback.
export function splitMarkdownContainerHtml(value) {
  const source = String(value)
  const first = leadingTag(source)
  if (
    !first ||
    first.closing ||
    first.selfClosing ||
    !MARKDOWN_CONTAINER_TAGS.has(first.name)
  ) {
    return null
  }

  let depth = 0
  let cursor = first.start
  while (cursor < source.length) {
    const lt = source.indexOf('<', cursor)
    if (lt < 0) break
    const tag = readTagAt(source, lt)
    if (!tag) {
      cursor = lt + 1
      continue
    }
    if (tag.kind === 'tag' && tag.name === first.name) {
      if (tag.closing) depth--
      else if (!tag.selfClosing) depth++
      if (depth === 0) {
        const suffix = source.slice(tag.end)
        if (suffix.trim()) return null
        return {
          prefix: source.slice(0, first.start),
          open: first.raw,
          inner: source.slice(first.end, tag.start),
          close: tag.raw,
          suffix
        }
      }
    }
    cursor = tag.end
  }
  return null
}

// Keep's block scanner needs a line range, not a parsed DOM node. Find the closing
// tag for a recognized outer block while preserving its exact source lines.
export function findRenderableBlockHtmlEnd(lines, start) {
  const source = lines.slice(start).join('\n')
  const first = leadingTag(source)
  if (!first || first.closing || !BLOCK_ROOT_TAGS.has(first.name)) return -1
  if (first.selfClosing || VOID_TAGS.has(first.name)) return start

  let depth = 0
  let cursor = first.start
  while (cursor < source.length) {
    const lt = source.indexOf('<', cursor)
    if (lt < 0) break
    const tag = readTagAt(source, lt)
    if (!tag) {
      cursor = lt + 1
      continue
    }
    if (tag.kind === 'tag' && tag.name === first.name) {
      if (tag.closing) depth--
      else if (!tag.selfClosing) depth++
      if (depth === 0) {
        const relativeLine = source.slice(0, tag.end).split('\n').length - 1
        return start + relativeLine
      }
    }
    cursor = tag.end
  }
  return -1
}
