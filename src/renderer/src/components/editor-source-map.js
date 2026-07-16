// Structure-aware mapping between Markdown source offsets and ProseMirror
// positions. Matching by block kind + occurrence keeps repeated headings,
// formatted inline text, tables and atomic nodes from drifting by a raw ratio.
const nodeStart = (node) => node?.position?.start?.offset
const nodeEnd = (node) => node?.position?.end?.offset

const textOf = (node) => {
  if (!node) return ''
  if (node.value != null) return String(node.value)
  if (node.alt != null) return String(node.alt)
  if (!node.children) return ''
  return node.children.map(textOf).join('')
}

const valueSpan = (markdown, node) => {
  const start = nodeStart(node)
  const end = nodeEnd(node)
  const value = node?.value == null ? '' : String(node.value)
  if (!Number.isFinite(start) || !Number.isFinite(end) || !value) return null
  const raw = markdown.slice(start, end)
  const idx = raw.indexOf(value)
  if (idx < 0) return { start, end, value }
  return { start: start + idx, end: start + idx + value.length, value }
}

const pushTextItems = (items, markdown, node) => {
  const span = valueSpan(markdown, node)
  if (!span) return
  for (let i = 0; i < span.value.length; i++) {
    items.push({ rawStart: span.start + i, rawEnd: span.start + i + 1 })
  }
}

const collectInlineItems = (markdown, node, items = []) => {
  if (!node) return items
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
    case 'html':
    case 'yaml':
    case 'math':
    case 'inlineMath':
      pushTextItems(items, markdown, node)
      return items
    case 'image':
    case 'imageReference':
    case 'break': {
      const start = nodeStart(node)
      const end = nodeEnd(node)
      if (Number.isFinite(start) && Number.isFinite(end)) {
        items.push({ rawStart: start, rawEnd: end, atom: true })
      }
      return items
    }
    default:
      break
  }
  node.children?.forEach((child) => collectInlineItems(markdown, child, items))
  return items
}

const mdBlock = (markdown, node, kind = node.type) => {
  const start = nodeStart(node)
  const end = nodeEnd(node)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { kind, start, end, text: textOf(node), items: collectInlineItems(markdown, node) }
}

const collectMdBlocks = (markdown, tree) => {
  const blocks = []
  const walk = (node) => {
    if (!node) return
    if (node.type === 'paragraph') {
      const images = (node.children || []).filter((child) =>
        child.type === 'image' || child.type === 'imageReference'
      )
      const textChildren = (node.children || []).filter((child) =>
        child.type !== 'image' && child.type !== 'imageReference'
      )
      if (images.length && !textChildren.some((child) => textOf(child).trim())) {
        images.forEach((child) => {
          const block = mdBlock(markdown, child, 'image')
          if (block) blocks.push(block)
        })
        return
      }
      const block = mdBlock(markdown, node, 'paragraph')
      if (block) blocks.push(block)
      return
    }
    if (['heading', 'code', 'html', 'yaml', 'math'].includes(node.type)) {
      const block = mdBlock(markdown, node, node.type)
      if (block) blocks.push(block)
      return
    }
    if (node.type === 'thematicBreak') {
      const block = mdBlock(markdown, node, 'atom')
      if (block) blocks.push(block)
      return
    }
    if (node.type === 'tableCell') {
      const block = mdBlock(markdown, node, 'tableCell')
      if (block) blocks.push(block)
      return
    }
    node.children?.forEach(walk)
  }
  walk(tree)
  return blocks
}

const isPmAtom = (node) => {
  if (!node || node.isText) return false
  const name = node.type?.name || ''
  const attrs = node.attrs || {}
  return node.isAtom || node.isLeaf || node.childCount === 0 || attrs.src || attrs.url ||
    /image|html|frontmatter|horizontal_rule|hard_break|thematic|rule/i.test(name)
}

const pmKind = (node) => {
  const name = node.type?.name || ''
  if (/heading/i.test(name)) return 'heading'
  if (/code/i.test(name)) return 'code'
  if (/image/i.test(name)) return 'image'
  if (/html/i.test(name)) return 'html'
  if (/frontmatter|yaml/i.test(name)) return 'yaml'
  if (/table.*cell|cell/i.test(name)) return 'tableCell'
  if (isPmAtom(node)) return 'atom'
  return 'paragraph'
}

const isInsideTableCell = (doc, pos) => {
  try {
    const $pos = doc.resolve(Math.max(0, Math.min(pos + 1, doc.content.size)))
    for (let depth = $pos.depth; depth >= 0; depth--) {
      if (/table.*cell|cell/i.test($pos.node(depth).type?.name || '')) return true
    }
  } catch {
    // A transient position can disappear while a transaction is applying.
  }
  return false
}

const collectPmBlocks = (doc) => {
  const blocks = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      blocks.push({
        kind: isInsideTableCell(doc, pos) ? 'tableCell' : pmKind(node),
        pos,
        contentPos: pos + 1,
        text: node.textContent || '',
        textblock: true
      })
      return false
    }
    if (isPmAtom(node)) {
      blocks.push({ kind: pmKind(node), pos, contentPos: pos, text: node.textContent || '', atom: true })
      return false
    }
    return true
  })
  return blocks
}

const sameKind = (left, right) =>
  left === right ||
  (left === 'math' && right === 'code') ||
  (left === 'yaml' && right === 'yaml') ||
  (left === 'atom' && right === 'atom')

const normText = (text) => String(text || '').replace(/\s+/g, ' ').trim()

const correspondingByOccurrence = (source, target, index, sourceKind, sourceText) => {
  const normalized = normText(sourceText)
  if (normalized) {
    const before = source.slice(0, index)
      .filter((item) => sameKind(item.kind, sourceKind) && normText(item.text) === normalized).length
    const exact = target.filter((item) => sameKind(sourceKind, item.kind) && normText(item.text) === normalized)
    if (exact.length) return exact[Math.min(before, exact.length - 1)]
  }
  if (target[index] && sameKind(sourceKind, target[index].kind)) return target[index]
  const occurrence = source.slice(0, index).filter((item) => sameKind(item.kind, sourceKind)).length
  const same = target.filter((item) => sameKind(sourceKind, item.kind))
  return same[occurrence] || target[Math.max(0, Math.min(target.length - 1, index))] || null
}

const nearestMdIndex = (blocks, rawOffset) => {
  if (!blocks.length) return -1
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (rawOffset >= block.start && rawOffset <= block.end) return i
    if (rawOffset < block.start) {
      if (!i) return 0
      return rawOffset - blocks[i - 1].end <= block.start - rawOffset ? i - 1 : i
    }
  }
  return blocks.length - 1
}

const pmIndexAtPos = (blocks, pos) => {
  if (!blocks.length) return -1
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const end = block.textblock ? block.contentPos + block.text.length : block.pos + 1
    if (pos >= block.pos && pos <= end) return i
    if (pos < block.pos) return Math.max(0, i - 1)
  }
  return blocks.length - 1
}

const localIndexForRaw = (block, rawOffset) => {
  const items = block.items || []
  if (!items.length) return 0
  const raw = Math.max(block.start, Math.min(rawOffset || 0, block.end))
  for (let i = 0; i < items.length; i++) {
    if (raw >= items[i].rawStart && raw < items[i].rawEnd) return i
    if (raw < items[i].rawStart) return i
  }
  return items.length
}

const rawForLocalIndex = (block, local) => {
  const items = block.items || []
  if (!items.length) return block.start
  const index = Math.max(0, Math.min(Math.round(local || 0), items.length))
  return index >= items.length ? items[items.length - 1].rawEnd : items[index].rawStart
}

const parseBlocks = (markdown, remark) => {
  try {
    return collectMdBlocks(markdown, remark.runSync(remark.parse(markdown), markdown))
  } catch {
    return []
  }
}

export function pmPosToMarkdownOffset(markdown, pmPos, doc, remark) {
  if (!markdown || !doc || !remark) return null
  const mdBlocks = parseBlocks(markdown, remark)
  const pmBlocks = collectPmBlocks(doc)
  const pmIndex = pmIndexAtPos(pmBlocks, pmPos)
  if (pmIndex < 0) return null
  const pm = pmBlocks[pmIndex]
  const md = correspondingByOccurrence(pmBlocks, mdBlocks, pmIndex, pm.kind, pm.text)
  if (!md) return null
  if (pm.atom) return md.start
  return rawForLocalIndex(md, Math.max(0, Math.min(pmPos - pm.contentPos, pm.text.length)))
}

export function markdownOffsetToPmPos(markdown, rawOffset, doc, remark) {
  if (!markdown || !doc || !remark) return null
  const mdBlocks = parseBlocks(markdown, remark)
  const pmBlocks = collectPmBlocks(doc)
  const mdIndex = nearestMdIndex(mdBlocks, rawOffset)
  if (mdIndex < 0) return null
  const md = mdBlocks[mdIndex]
  const pm = correspondingByOccurrence(mdBlocks, pmBlocks, mdIndex, md.kind, md.text)
  if (!pm) return null
  if (pm.atom) return { pos: pm.pos, atom: true }
  const local = localIndexForRaw(md, rawOffset)
  return { pos: pm.contentPos + Math.max(0, Math.min(local, pm.text.length)), atom: false }
}
