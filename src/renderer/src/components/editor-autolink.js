// remark-gfm can extend a URL across following CJK prose because its autolink
// terminators are ASCII-oriented. Preserve the valid ASCII domain as the link
// and put the swallowed non-ASCII suffix back as ordinary text.
const NON_ASCII_RE = /[^\x00-\x7F]/
const AUTOLINK_RE = /^(https?:\/\/|www\.)/i

function replacementForBadLink(node) {
  const url = node.url || ''
  const children = node.children || []
  const text = children.length === 1 && children[0].type === 'text' ? children[0].value : null
  if (text == null) return children.length ? children : [{ type: 'text', value: url }]

  const urlCut = url.search(NON_ASCII_RE)
  const textCut = text.search(NON_ASCII_RE)
  const asciiUrl = urlCut >= 0 ? url.slice(0, urlCut) : url
  const asciiText = textCut >= 0 ? text.slice(0, textCut) : text
  const suffix = textCut >= 0 ? text.slice(textCut) : ''
  const domain = asciiUrl.replace(/^https?:\/\//i, '')

  if (asciiUrl && domain.includes('.') && asciiText) {
    const nodes = [
      { type: 'link', url: asciiUrl, children: [{ type: 'text', value: asciiText }] }
    ]
    if (suffix) nodes.push({ type: 'text', value: suffix })
    return nodes
  }
  return [{ type: 'text', value: text }]
}

export function repairNonAsciiAutolinks(node) {
  if (!node || !Array.isArray(node.children)) return
  const next = []
  for (const child of node.children) {
    if (
      child.type === 'link' &&
      AUTOLINK_RE.test(child.url || '') &&
      NON_ASCII_RE.test(child.url || '')
    ) {
      for (const replacement of replacementForBadLink(child)) {
        repairNonAsciiAutolinks(replacement)
        next.push(replacement)
      }
    } else {
      repairNonAsciiAutolinks(child)
      next.push(child)
    }
  }
  node.children = next
}

export function remarkRepairNonAsciiAutolinks() {
  return (tree) => repairNonAsciiAutolinks(tree)
}
