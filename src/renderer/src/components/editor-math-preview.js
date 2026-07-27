import { Plugin } from '@milkdown/prose/state'
import katex from 'katex'
import { inlineMathAtCaret } from './editor-inline-math.js'

const MATHY_RE = /[\\^_{}]/

const isEscaped = (text, index) => {
  let slashes = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes++
  return slashes % 2 === 1
}

export function unclosedMathContent(textBeforeCaret) {
  const text = String(textBeforeCaret ?? '')
  for (let index = text.length - 1; index >= 0; index--) {
    if (text[index] !== '$' || isEscaped(text, index)) continue
    if (text[index - 1] === '$' || text[index + 1] === '$') continue
    const content = text.slice(index + 1)
    if (!content || /[$\n]/.test(content) || !MATHY_RE.test(content)) return null
    return content
  }
  return null
}

let tip = null
let tipOwner = null

function getTip() {
  if (tip?.isConnected) return tip
  tip = document.createElement('div')
  tip.className = 'hm-math-preview'
  tip.style.display = 'none'
  tip.setAttribute('aria-hidden', 'true')
  document.body.appendChild(tip)
  return tip
}

function placeTip(el, left, top) {
  const margin = 8
  el.style.left = Math.round(left) + 'px'
  el.style.top = Math.round(top) + 'px'
  el.style.display = ''
  const rect = el.getBoundingClientRect()
  if (rect.right > window.innerWidth - margin) {
    el.style.left = Math.max(margin, Math.round(window.innerWidth - rect.width - margin)) + 'px'
  }
  if (rect.bottom > window.innerHeight - margin) {
    el.style.top = Math.max(margin, Math.round(top - rect.height - 36)) + 'px'
  }
}

export function mathPreviewPlugin() {
  let raf = 0
  const hide = (view) => {
    if (view && tipOwner && tipOwner !== view) return
    const el = getTip()
    el.style.display = 'none'
    tipOwner = null
  }
  const render = (view) => {
    raf = 0
    const { selection } = view.state
    if (!view.hasFocus() || !selection.empty) return hide(view)
    const $head = selection.$head
    if ($head.parent.type.name === 'code_block') return hide(view)
    const blockText = $head.parent.textBetween(
      0,
      $head.parent.content.size,
      '\n',
      '\uFFFC'
    )
    const complete = inlineMathAtCaret(blockText, $head.parentOffset)
    const content = complete?.value || unclosedMathContent(
      view.state.doc.textBetween($head.start(), $head.pos, '\n')
    )
    if (!content) return hide(view)
    try {
      const el = getTip()
      el.innerHTML = katex.renderToString(content, {
        throwOnError: false,
        displayMode: false,
        output: 'html'
      })
      const coords = view.coordsAtPos(selection.head)
      placeTip(el, coords.left, coords.bottom + 6)
      tipOwner = view
    } catch {
      hide(view)
    }
  }
  const schedule = (view) => {
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => render(view))
  }

  return new Plugin({
    view(view) {
      const onBlur = () => hide(view)
      view.dom.addEventListener('blur', onBlur)
      schedule(view)
      return {
        update: (nextView) => schedule(nextView),
        destroy: () => {
          view.dom.removeEventListener('blur', onBlur)
          if (raf) cancelAnimationFrame(raf)
          hide(view)
        }
      }
    }
  })
}
