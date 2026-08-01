// Source-line → rendered-block mapping is needed only by line-jump actions.
// Keep it separate from the always-loaded find helpers because the exact block
// segmentation comes from keep-parser (and therefore markdown-it).
import { parseDoc, toViewLines } from './keep-parser.js'

export function docBlocks(content) {
  return parseDoc(toViewLines(String(content ?? '').split('\n')))
}

export function blockIndexForLine(content, lineNo) {
  const total = String(content ?? '').split('\n').length
  const blocks = docBlocks(content)
  if (!blocks.length) return { bi: -1, total }
  const target = Math.max(0, Math.min(total - 1, (lineNo | 0) - 1))
  let bi = -1
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (target >= block.start && target <= block.end) {
      bi = index
      break
    }
    if (block.start > target) {
      bi = index
      break
    }
  }
  if (bi === -1) bi = blocks.length - 1
  return { bi, total }
}
