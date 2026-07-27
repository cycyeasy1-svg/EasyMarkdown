import { describe, expect, it } from 'vitest'
import { Schema } from '@milkdown/prose/model'
import { EditorState } from '@milkdown/prose/state'
import { convertListAtSelection } from '../src/renderer/src/components/editor-list-conversion.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    bullet_list: { group: 'block', content: 'list_item+' },
    ordered_list: {
      group: 'block',
      content: 'list_item+',
      attrs: { order: { default: 1 } }
    },
    list_item: {
      content: 'paragraph block*',
      attrs: {
        checked: { default: null },
        label: { default: '•' },
        listType: { default: 'bullet' }
      }
    }
  }
})

const paragraph = (text) => schema.nodes.paragraph.create(null, schema.text(text))
const item = (text, rest = []) =>
  schema.nodes.list_item.create(null, [paragraph(text), ...rest])

function makeView(doc) {
  let state = EditorState.create({ schema, doc })
  return {
    get state() {
      return state
    },
    dispatch(tr) {
      state = state.apply(tr)
    }
  }
}

describe('list conversion', () => {
  it('converts only the current list level and keeps nested lists intact', () => {
    const nested = schema.nodes.ordered_list.create({ order: 3 }, [item('child')])
    const root = schema.nodes.bullet_list.create(null, [item('parent', [nested]), item('second')])
    const view = makeView(schema.nodes.doc.create(null, [root]))

    expect(convertListAtSelection(view, 'ordered_list', 0)).toBe(true)
    const converted = view.state.doc.firstChild
    expect(converted.type.name).toBe('ordered_list')
    expect(converted.firstChild.attrs.listType).toBe('ordered')
    expect(converted.firstChild.lastChild.type.name).toBe('ordered_list')
    expect(converted.firstChild.lastChild.attrs.order).toBe(3)
    expect(converted.firstChild.lastChild.firstChild.attrs.listType).toBe('bullet')
  })

  it('adds and removes task checkbox state on direct items', () => {
    const root = schema.nodes.bullet_list.create(null, [item('one'), item('two')])
    const view = makeView(schema.nodes.doc.create(null, [root]))
    expect(convertListAtSelection(view, 'task_list', 0)).toBe(true)
    expect(view.state.doc.firstChild.firstChild.attrs.checked).toBe(false)
    expect(convertListAtSelection(view, 'bullet_list', 0)).toBe(true)
    expect(view.state.doc.firstChild.firstChild.attrs.checked).toBeNull()
  })
})
