import { Plugin, PluginKey } from '@milkdown/prose/state'

const blockHandleGuardKey = new PluginKey('hm-block-handle-gutter')
const GUTTER_WIDTH = 36

const hideBlockHandles = (view) => {
  const root = view.dom.closest('.milkdown') || view.dom.parentElement
  root?.querySelectorAll('.milkdown-block-handle[data-show="true"]')
    .forEach((handle) => {
      handle.dataset.show = 'false'
    })
}

// Crepe resolves the hovered block from the editor midpoint, which can make an
// inline HTML span look as though it owns a block drag handle. Only leave the
// block interaction active in the narrow left gutter where users expect it.
export function createBlockHandleGutterPlugin() {
  return new Plugin({
    key: blockHandleGuardKey,
    props: {
      handleDOMEvents: {
        pointermove(view, event) {
          const rect = view.dom.getBoundingClientRect()
          const inGutter =
            event.clientX >= rect.left &&
            event.clientX <= rect.left + GUTTER_WIDTH
          if (inGutter) return false
          hideBlockHandles(view)
          return true
        }
      }
    }
  })
}
