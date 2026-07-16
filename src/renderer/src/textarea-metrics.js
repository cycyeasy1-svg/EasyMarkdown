const MIRROR_STYLES = [
  'direction', 'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'line-height', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width', 'box-sizing', 'word-wrap',
  'word-break', 'overflow-wrap', 'tab-size', 'text-indent', 'width'
]

export function syncTextareaMirrorStyle(textarea, mirror) {
  const cs = textarea.ownerDocument.defaultView.getComputedStyle(textarea)
  let css = ''
  for (const name of MIRROR_STYLES) css += `${name}:${cs.getPropertyValue(name)};`
  const whiteSpace = textarea.wrap === 'off' ? 'pre' : 'pre-wrap'
  mirror.style.cssText = `${css}position:absolute;visibility:hidden;white-space:${whiteSpace};top:0;left:0;`
  const px = (name) => parseFloat(cs.getPropertyValue(name)) || 0
  mirror.style.width = cs.boxSizing === 'border-box'
    ? `${textarea.clientWidth + px('border-left-width') + px('border-right-width')}px`
    : `${Math.max(0, textarea.clientWidth - px('padding-left') - px('padding-right'))}px`
  return cs
}

export function textareaOffsetY(textarea, offset) {
  const doc = textarea.ownerDocument
  const mirror = doc.createElement('div')
  syncTextareaMirrorStyle(textarea, mirror)
  doc.body.appendChild(mirror)
  try {
    const value = textarea.value || ''
    const text = doc.createTextNode(value + '\u200b')
    mirror.appendChild(text)
    const range = doc.createRange()
    range.setStart(text, Math.max(0, Math.min(offset, value.length)))
    range.collapse(true)
    return range.getBoundingClientRect().top - mirror.getBoundingClientRect().top
  } finally {
    mirror.remove()
  }
}

