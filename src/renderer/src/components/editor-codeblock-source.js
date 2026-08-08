const codeBlocksInDocument = (view) => {
  const blocks = []
  view?.state?.doc?.descendants?.((node, pos) => {
    if (node.type.name === 'code_block') blocks.push({ node, pos })
    return true
  })
  return blocks
}

export function codeBlockAtDom(view, element) {
  const block = element?.closest?.('.milkdown-code-block') || element
  if (!view || !block) return null
  try {
    const mapped = view.posAtDOM(block, 0)
    const $pos = view.state.doc.resolve(mapped)
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth)
      if (node.type.name === 'code_block') return { node, pos: $pos.before(depth), block }
    }
    const candidates = [
      { node: view.state.doc.nodeAt(mapped), pos: mapped },
      { node: $pos.nodeAfter, pos: mapped },
      { node: $pos.nodeBefore, pos: mapped - ($pos.nodeBefore?.nodeSize || 0) }
    ]
    const direct = candidates.find(({ node }) => node?.type?.name === 'code_block')
    if (direct) return { ...direct, block }
  } catch {
    // A CodeMirror node view can shield its internal DOM from posAtDOM.
  }

  const index = [...view.dom.querySelectorAll('.milkdown-code-block')].indexOf(block)
  const fallback = index >= 0 ? codeBlocksInDocument(view)[index] : null
  return fallback ? { ...fallback, block } : null
}

export const readCodeBlockSource = (view, element) =>
  codeBlockAtDom(view, element)?.node?.textContent ?? ''

export const codeBlockLanguage = (view, element) => {
  const resolved = codeBlockAtDom(view, element)
  if (resolved) return String(resolved.node.attrs.language || '').trim().toLowerCase()
  const block = element?.closest?.('.milkdown-code-block') || element
  return String(block?.querySelector?.('.language-button')?.textContent || '').trim().toLowerCase()
}
