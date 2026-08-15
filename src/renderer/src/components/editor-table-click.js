// Milkdown's table node view intercepts pointer/mouse down inside a cell and
// converts the click into a NodeSelection. That makes the first click select
// the cell and requires another click before the caret can edit text. Let
// ProseMirror handle cell content directly, while delegating buttons, handles,
// drag/drop, and every event outside td/th to Milkdown's original stopEvent.
import { TableNodeView } from '@milkdown/components/table-block'

const PATCHED = Symbol.for('easymarkdown.milkdown-table-single-click')
const proto = TableNodeView?.prototype

if (typeof proto?.stopEvent !== 'function') {
  console.warn(
    '[easymarkdown] table single-click patch: TableNodeView API changed — single-click editing is unavailable.'
  )
} else if (!proto[PATCHED]) {
  const originalStopEvent = proto.stopEvent
  proto.stopEvent = function stopEventWithCellEditing(event) {
    const target = event?.target
    const cell = target?.closest?.('td, th')
    if (
      (event?.type === 'mousedown' || event?.type === 'pointerdown') &&
      cell &&
      this.contentDOM?.contains(cell)
    ) {
      return false
    }
    return originalStopEvent.call(this, event)
  }
  Object.defineProperty(proto, PATCHED, { value: true })
}
