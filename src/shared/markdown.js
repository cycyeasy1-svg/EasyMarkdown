export const slugifyMarkdownAnchor = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')

// Extract direct inline links/images and link definitions with exact destination
// spans. The scanner is intentionally line-local: reference updates can then
// replace only the destination bytes on that line and leave the rest of every
// Markdown file untouched.
export function extractMarkdownLinks(content, cap = 5000) {
  const source = String(content ?? '')
  const lines = source.split('\n')
  const out = []
  let absolute = 0
  /** @type {string | null} */
  let fence = null
  let frontMatter = lines[0]?.replace(/\r$/, '') === '---'

  const push = (line, lineIndex, start, end, target, isImage, kind = 'inline') => {
    if (!target || out.length >= cap) return
    out.push({
      target,
      isImage,
      kind,
      line: lineIndex + 1,
      column: start + 1,
      start: absolute + start,
      end: absolute + end
    })
  }

  for (let lineIndex = 0; lineIndex < lines.length && out.length < cap; lineIndex++) {
    const rawLine = lines[lineIndex]
    const line = rawLine.replace(/\r$/, '')
    if (frontMatter) {
      if (lineIndex > 0 && (line === '---' || line === '...')) frontMatter = false
      absolute += rawLine.length + 1
      continue
    }
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      absolute += rawLine.length + 1
      continue
    }
    if (fence) {
      absolute += rawLine.length + 1
      continue
    }

    const definition = line.match(/^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/)
    if (definition) {
      const target = definition[1] || definition[2]
      const start = line.indexOf(target, definition.index)
      push(line, lineIndex, start, start + target.length, target, false, 'definition')
    }

    let codeTicks = 0
    for (let i = 0; i < line.length && out.length < cap; i++) {
      if (line[i] === '\\') {
        i += 1
        continue
      }
      if (line[i] === '`') {
        let run = 1
        while (line[i + run] === '`') run += 1
        codeTicks = codeTicks === run ? 0 : codeTicks ? codeTicks : run
        i += run - 1
        continue
      }
      if (codeTicks) continue
      const isImage = line[i] === '!' && line[i + 1] === '['
      if (!isImage && line[i] !== '[') continue
      const labelStart = i + (isImage ? 2 : 1)
      let close = labelStart
      for (; close < line.length; close++) {
        if (line[close] === '\\') close += 1
        else if (line[close] === ']') break
      }
      if (line[close] !== ']' || line[close + 1] !== '(') continue
      let pos = close + 2
      while (/\s/.test(line[pos] || '')) pos += 1
      let start = pos
      let end = pos
      if (line[pos] === '<') {
        start = ++pos
        while (pos < line.length && line[pos] !== '>') {
          if (line[pos] === '\\') pos += 1
          pos += 1
        }
        if (line[pos] !== '>') continue
        end = pos
      } else {
        let depth = 0
        while (pos < line.length) {
          const ch = line[pos]
          if (ch === '\\') {
            pos += 2
            continue
          }
          if (ch === '(') depth += 1
          else if (ch === ')') {
            if (depth === 0) break
            depth -= 1
          } else if (/\s/.test(ch) && depth === 0) {
            break
          }
          pos += 1
        }
        end = pos
      }
      const target = line.slice(start, end)
      push(line, lineIndex, start, end, target, isImage)
      i = Math.max(i, pos)
    }
    absolute += rawLine.length + 1
  }
  return out
}

export const attachmentLinkMarkdown = (name, path) => {
  const label = String(name || 'attachment').replace(/([\\[\]])/g, '\\$1')
  const target = String(path || '').replace(/[<>]/g, (ch) => (ch === '<' ? '%3C' : '%3E'))
  return `[${label}](<${target}>)`
}
