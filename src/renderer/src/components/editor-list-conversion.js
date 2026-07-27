import { Fragment } from '@milkdown/prose/model'
import { TextSelection } from '@milkdown/prose/state'

const LIST_TYPES = new Set(['bullet_list', 'ordered_list'])
const isList = (node) => LIST_TYPES.has(node?.type?.name)
const isTaskItem = (node) =>
  node?.type?.name === 'list_item' &&
  node.attrs?.checked !== null &&
  node.attrs?.checked !== undefined

function closestListAt(state, pos = state.selection.$from.pos) {
  const safePos = Math.max(0, Math.min(pos, state.doc.content.size))
  const $pos = state.doc.resolve(safePos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (isList(node)) return { node, pos: $pos.before(depth) }
  }
  return null
}

function hasTaskItems(list) {
  let task = false
  list.forEach((node) => {
    if (isTaskItem(node)) task = true
  })
  return task
}

export function getListConversionContext(state, pos) {
  const list = closestListAt(state, pos)
  if (!list) return null
  const task = hasTaskItems(list.node)
  const alternative = list.node.type.name === 'bullet_list' ? 'ordered_list' : 'bullet_list'
  return {
    listPos: list.pos,
    sourceType: list.node.type.name,
    actions: (task ? ['bullet_list', 'ordered_list'] : [alternative, 'task_list'])
      .map((targetType) => ({ targetType }))
  }
}

function convertedListLevel(node, targetType, targetName) {
  const task = targetName === 'task_list'
  const ordered = targetName === 'ordered_list'
  const items = []
  let itemIndex = 0
  node.forEach((child) => {
    if (child.type.name !== 'list_item') {
      items.push(child)
      return
    }
    itemIndex += 1
    items.push(child.type.create(
      {
        ...child.attrs,
        checked: task ? false : null,
        label: ordered ? `${itemIndex}.` : '•',
        listType: ordered ? 'ordered' : 'bullet'
      },
      child.content,
      child.marks
    ))
  })
  return targetType.create(
    ordered ? { order: 1 } : null,
    Fragment.from(items),
    node.marks
  )
}

export function convertListAtSelection(view, targetName, listPos) {
  const state = view?.state
  if (!state || ![...LIST_TYPES, 'task_list'].includes(targetName)) return false
  const direct = Number.isFinite(listPos) ? state.doc.nodeAt(listPos) : null
  const list = isList(direct) ? { node: direct, pos: listPos } : closestListAt(state)
  if (!list) return false
  const targetType = state.schema.nodes[targetName === 'task_list' ? 'bullet_list' : targetName]
  if (!targetType) return false
  const sourceTask = hasTaskItems(list.node)
  if (list.node.type === targetType && targetName !== 'task_list' && !sourceTask) return false

  const replacement = convertedListLevel(list.node, targetType, targetName)
  let tr = state.tr
    .setMeta('addToHistory', true)
    .replaceWith(list.pos, list.pos + list.node.nodeSize, replacement)
  const oldEnd = list.pos + list.node.nodeSize
  const selection = state.selection
  if (
    Math.min(selection.anchor, selection.head) >= list.pos &&
    Math.max(selection.anchor, selection.head) <= oldEnd
  ) {
    const end = list.pos + replacement.nodeSize
    try {
      tr = tr.setSelection(TextSelection.create(
        tr.doc,
        Math.max(list.pos + 1, Math.min(selection.anchor, end - 1)),
        Math.max(list.pos + 1, Math.min(selection.head, end - 1))
      ))
    } catch {
      // Keep ProseMirror's mapped selection if the exact text position vanished.
    }
  }
  view.dispatch(tr.scrollIntoView())
  return true
}
