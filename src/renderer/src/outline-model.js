// Parse every heading that Keep/Rich renders: ATX, Setext and one-line HTML.
// Fenced code and the document-leading YAML front matter are intentionally
// excluded. Offsets point into the untouched source for navigation/reordering.
export function parseHeadingDetails(markdown) {
  const lines = String(markdown || '').split('\n')
  const lineOffsets = []
  let offset = 0
  lines.forEach((line) => {
    lineOffsets.push(offset)
    offset += line.length + 1
  })
  const headings = []
  let inFence = false
  let fence = ''
  let index = 0
  if (/^---\s*$/.test(lines[0] || '')) {
    let end = 1
    while (end < lines.length && !/^---\s*$/.test(lines[end])) end += 1
    if (end < lines.length) index = end + 1
  }
  for (; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = line.match(/^(\s*)(```+|~~~+)/)
    if (fenceMatch) {
      const marker = fenceMatch[2][0]
      if (!inFence) {
        inFence = true
        fence = marker
      } else if (marker === fence) {
        inFence = false
      }
      continue
    }
    if (inFence) continue
    const atx = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (atx) {
      headings.push({
        level: atx[1].length,
        text: atx[2].trim(),
        line: index,
        charOffset: lineOffsets[index]
      })
      continue
    }
    const html = line.match(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/i)
    if (html) {
      headings.push({
        level: Number(html[1]),
        text: html[2].replace(/<[^>]+>/g, '').trim(),
        line: index,
        charOffset: lineOffsets[index]
      })
      continue
    }
    const next = lines[index + 1]
    if (
      next !== undefined &&
      /^(=+|-+)\s*$/.test(next) &&
      /\S/.test(line) &&
      !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\||\s*$)/.test(line)
    ) {
      headings.push({
        level: next.trim()[0] === '=' ? 1 : 2,
        text: line.trim(),
        line: index,
        charOffset: lineOffsets[index]
      })
      index += 1
    }
  }
  return headings
}

export const parseHeadings = (markdown) =>
  parseHeadingDetails(markdown).map(({ level, text }) => ({ level, text }))
