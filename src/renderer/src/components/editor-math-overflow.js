import { Plugin, PluginKey } from '@milkdown/prose/state'

const mathOverflowKey = new PluginKey('hm-math-overflow')

export function syncDisplayMathOverflow(root) {
  if (!root?.querySelectorAll) return
  root.querySelectorAll('.milkdown-code-block .preview > .katex-display').forEach((display) => {
    display.dataset.hmMathOverflow =
      display.scrollWidth > display.clientWidth + 1 ? 'true' : 'false'
  })
}

export function createMathOverflowPlugin() {
  return new Plugin({
    key: mathOverflowKey,
    view(view) {
      const root = view.dom
      let frame = 0
      const schedule = () => {
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          syncDisplayMathOverflow(root)
        })
      }
      const observer = new MutationObserver(schedule)
      observer.observe(root, { childList: true, subtree: true })
      const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(schedule)
        : null
      resizeObserver?.observe(root)
      syncDisplayMathOverflow(root)
      return {
        update: schedule,
        destroy() {
          observer.disconnect()
          resizeObserver?.disconnect()
          if (frame) cancelAnimationFrame(frame)
        }
      }
    }
  })
}
