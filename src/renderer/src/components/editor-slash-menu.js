import { SlashProvider } from '@milkdown/kit/plugin/slash'
import { commandsCtx } from '@milkdown/kit/core'
import {
  clearTextInCurrentBlockCommand,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
  addBlockTypeCommand,
  selectTextNearPosCommand
} from '@milkdown/kit/preset/commonmark'
import { createTable } from '@milkdown/kit/preset/gfm'
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state'
import { pinyin as toPinyin } from 'pinyin-pro'

const KEY = new PluginKey('hm-slash-menu')

// Keep Crepe's block handle, but replace its label-only slash filter with the
// keyword-aware menu below.
export function disableCrepeSlash(ctx) {
  ctx.update('CREPE_MENU_SLASH_SPEC', () => ({
    view: () => ({ update() {}, destroy() {} })
  }))
}

const strokeSvg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
const textSvg = (text) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><text x="3" y="17" font-size="13" font-weight="700" fill="currentColor" font-family="-apple-system,Segoe UI,sans-serif">${text}</text></svg>`

const ICON = {
  text: strokeSvg('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h11"/>'),
  quote: strokeSvg('<path d="M7 5v14"/><path d="M11 9h7M11 13h7M11 17h5"/>'),
  divider: strokeSvg('<path d="M4 12h16"/>'),
  bullet:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="4.5" cy="7" r="1.6"/><circle cx="4.5" cy="12" r="1.6"/><circle cx="4.5" cy="17" r="1.6"/><path d="M9 7h12M9 12h12M9 17h12" stroke="currentColor" stroke-width="1.6"/></svg>',
  ordered:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><text x="1.5" y="9" font-size="7" font-weight="700" fill="currentColor">1.</text><text x="1.5" y="14.5" font-size="7" font-weight="700" fill="currentColor">2.</text><text x="1.5" y="20" font-size="7" font-weight="700" fill="currentColor">3.</text><path d="M9 7h12M9 12h12M9 17h12" stroke="currentColor" stroke-width="1.6"/></svg>',
  task: strokeSvg('<rect x="3" y="5" width="5" height="5" rx="1"/><path d="M4 7.5l1 1 2-2"/><rect x="3" y="14" width="5" height="5" rx="1"/><path d="M11 7.5h10M11 16.5h10"/>'),
  image: strokeSvg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="M21 16l-5-5-9 8"/>'),
  code: strokeSvg('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4M13.5 6.5l-3 11"/>'),
  table: strokeSvg('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M10 4v16"/>'),
  math: '<svg viewBox="0 0 24 24" aria-hidden="true"><text x="4" y="18" font-size="15" font-weight="600" fill="currentColor">∑</text></svg>'
}

function clearThen(ctx, commandKey, payload) {
  const commands = ctx.get(commandsCtx)
  commands.call(clearTextInCurrentBlockCommand.key)
  commands.call(commandKey, payload)
}

function node(view, name) {
  return view.state.schema.nodes[name]
}

const RUN = {
  text: (ctx, view) => clearThen(ctx, setBlockTypeCommand.key, { nodeType: node(view, 'paragraph') }),
  heading: (level) => (ctx, view) =>
    clearThen(ctx, setBlockTypeCommand.key, { nodeType: node(view, 'heading'), attrs: { level } }),
  quote: (ctx, view) => clearThen(ctx, wrapInBlockTypeCommand.key, { nodeType: node(view, 'blockquote') }),
  divider: (ctx, view) => clearThen(ctx, addBlockTypeCommand.key, { nodeType: node(view, 'hr') }),
  bullet: (ctx, view) => clearThen(ctx, wrapInBlockTypeCommand.key, { nodeType: node(view, 'bullet_list') }),
  ordered: (ctx, view) => clearThen(ctx, wrapInBlockTypeCommand.key, { nodeType: node(view, 'ordered_list') }),
  task: (ctx, view) =>
    clearThen(ctx, wrapInBlockTypeCommand.key, { nodeType: node(view, 'list_item'), attrs: { checked: false } }),
  image: (ctx, view) => {
    const imageType = node(view, 'image-block') || node(view, 'image')
    if (imageType) clearThen(ctx, addBlockTypeCommand.key, { nodeType: imageType })
  },
  code: (ctx, view) => clearThen(ctx, setBlockTypeCommand.key, { nodeType: node(view, 'code_block') }),
  codeLang: (language) => (ctx, view) =>
    clearThen(ctx, setBlockTypeCommand.key, {
      nodeType: node(view, 'code_block'),
      attrs: { language }
    }),
  math: (ctx, view) =>
    clearThen(ctx, addBlockTypeCommand.key, {
      nodeType: node(view, 'code_block'),
      attrs: { language: 'LaTeX' }
    }),
  table: (ctx, view) => {
    const commands = ctx.get(commandsCtx)
    commands.call(clearTextInCurrentBlockCommand.key)
    const { from } = view.state.selection
    commands.call(addBlockTypeCommand.key, { nodeType: createTable(ctx, 3, 3) })
    commands.call(selectTextNearPosCommand.key, { pos: from })
  }
}

const GROUP_LABEL = { text: 'slash.text', list: 'slash.list', advanced: 'slash.advanced' }
const LANGUAGES = [
  ['javascript', ['js', 'javascript']], ['typescript', ['ts', 'typescript']],
  ['python', ['py', 'python']], ['java', ['java']], ['go', ['go', 'golang']],
  ['rust', ['rust', 'rs']], ['cpp', ['cpp', 'c++', 'cxx']],
  ['csharp', ['csharp', 'c#', 'cs']], ['php', ['php']], ['ruby', ['ruby', 'rb']],
  ['swift', ['swift']], ['kotlin', ['kotlin', 'kt']], ['scala', ['scala']],
  ['sql', ['sql']], ['html', ['html']], ['css', ['css']], ['json', ['json']],
  ['yaml', ['yaml', 'yml']], ['xml', ['xml']],
  ['bash', ['bash', 'sh', 'shell', 'zsh']], ['powershell', ['powershell', 'ps1']],
  ['lua', ['lua']], ['dart', ['dart']], ['markdown', ['markdown', 'md']],
  ['mermaid', ['mermaid', 'mmd']], ['diff', ['diff', 'patch']],
  ['dockerfile', ['dockerfile']], ['graphql', ['graphql']]
]

const PY_CACHE = new Map()
function pinyinKeywords(label) {
  if (!label) return []
  const cached = PY_CACHE.get(label)
  if (cached) return cached
  const out = new Set()
  try {
    const full = toPinyin(label, { toneType: 'none', type: 'array' }).join('').replace(/\s+/g, '').toLowerCase()
    const first = toPinyin(label, { pattern: 'first', toneType: 'none', type: 'array' }).join('').replace(/\s+/g, '').toLowerCase()
    if (full && /[a-z]/.test(full)) out.add(full)
    if (first && /[a-z]/.test(first) && first !== full) out.add(first)
  } catch {
    // Matching must never be able to break editing.
  }
  const result = [...out]
  PY_CACHE.set(label, result)
  return result
}

function languageItemsFor(t, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  return LANGUAGES.flatMap(([name, aliases]) => {
    const keywords = [...new Set([name, ...aliases])]
    if (!keywords.some((alias) => alias.startsWith(q))) return []
    return [{
      id: `code:${name}`,
      group: 'advanced',
      label: `${t('slash.code')} · ${name}`,
      icon: ICON.code,
      keywords,
      run: RUN.codeLang(name)
    }]
  })
}

export function buildSlashItems(t, query = '') {
  const keywords = (id) =>
    (t(`slash.kw.${id}`) || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return [
    { id: 'text', group: 'text', label: t('slash.text'), icon: ICON.text, keywords: keywords('text'), run: RUN.text },
    ...[1, 2, 3, 4, 5, 6].map((level) => ({
      id: `h${level}`,
      group: 'text',
      label: t(`block.h${level}`),
      icon: textSvg(`H${level}`),
      keywords: keywords(`h${level}`),
      run: RUN.heading(level)
    })),
    { id: 'quote', group: 'text', label: t('slash.quote'), icon: ICON.quote, keywords: keywords('quote'), run: RUN.quote },
    { id: 'divider', group: 'text', label: t('slash.divider'), icon: ICON.divider, keywords: keywords('divider'), run: RUN.divider },
    { id: 'bullet', group: 'list', label: t('slash.bullet'), icon: ICON.bullet, keywords: keywords('bullet'), run: RUN.bullet },
    { id: 'ordered', group: 'list', label: t('slash.ordered'), icon: ICON.ordered, keywords: keywords('ordered'), run: RUN.ordered },
    { id: 'task', group: 'list', label: t('slash.task'), icon: ICON.task, keywords: keywords('task'), run: RUN.task },
    { id: 'image', group: 'advanced', label: t('slash.image'), icon: ICON.image, keywords: keywords('image'), run: RUN.image },
    { id: 'code', group: 'advanced', label: t('slash.code'), icon: ICON.code, keywords: keywords('code'), run: RUN.code },
    { id: 'table', group: 'advanced', label: t('slash.table'), icon: ICON.table, keywords: keywords('table'), run: RUN.table },
    { id: 'math', group: 'advanced', label: t('slash.math'), icon: ICON.math, keywords: keywords('math'), run: RUN.math },
    ...languageItemsFor(t, query)
  ].map((item) => ({ ...item, keywords: [...item.keywords, ...pinyinKeywords(item.label)] }))
}

export function scoreSlashItem(item, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return 1
  const label = item.label.toLowerCase()
  if (item.keywords.includes(q) || label === q) return 90
  if (label.startsWith(q) || item.keywords.some((keyword) => keyword.startsWith(q))) return 50
  if (q.length >= 3 && (label.includes(q) || item.keywords.some((keyword) => keyword.includes(q)))) return 10
  return -1
}

function hasAncestorType($pos, name) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === name) return true
  }
  return false
}

function atEndOfBlock(selection) {
  return selection instanceof TextSelection &&
    selection.$head.parentOffset === selection.$head.parent.content.size
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char])
}

class SlashMenu {
  constructor(ctx, view, getT) {
    this.ctx = ctx
    this.view = view
    this.getT = getT
    this.filtered = []
    this.selectedIndex = 0
    this.boundsRaf = 0

    const content = document.createElement('div')
    content.className = 'milkdown-slash-menu hm-smart-slash'
    content.setAttribute('data-show', 'false')
    content.setAttribute('role', 'listbox')
    content.addEventListener('pointermove', this.onPointerMove)
    content.addEventListener('pointerdown', this.onPointerDown)
    content.addEventListener('pointerup', this.onPointerUp)
    this.content = content

    this.provider = new SlashProvider({
      content,
      debounce: 20,
      offset: 10,
      shouldShow: (currentView) => this.shouldShow(currentView)
    })
    this.provider.onShow = () => this.scheduleBounds()
  }

  scheduleBounds() {
    if (this.boundsRaf) cancelAnimationFrame(this.boundsRaf)
    this.boundsRaf = requestAnimationFrame(() => {
      this.boundsRaf = 0
      this.content.style.translate = '0 0'
      const rect = this.content.getBoundingClientRect()
      const margin = 8
      let dx = 0
      let dy = 0
      if (rect.right > innerWidth - margin) dx = innerWidth - margin - rect.right
      if (rect.left + dx < margin) dx += margin - (rect.left + dx)
      if (rect.bottom > innerHeight - margin) dy = innerHeight - margin - rect.bottom
      if (rect.top + dy < margin) dy += margin - (rect.top + dy)
      this.content.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`
    })
  }

  shouldShow(view) {
    const selection = view.state.selection
    if (hasAncestorType(selection.$from, 'code_block') || hasAncestorType(selection.$from, 'list_item')) return false
    const text = this.provider.getContent(view, (n) => ['paragraph', 'heading'].includes(n.type.name))
    if (text == null || !atEndOfBlock(selection) || !text.startsWith('/')) return false
    this.render(text.slice(1))
    return true
  }

  render(query) {
    const q = (query || '').trim().toLowerCase()
    const all = buildSlashItems(this.getT, query)
    this.filtered = q
      ? all.map((item, index) => ({ item, index, score: scoreSlashItem(item, q) }))
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ item }) => item)
      : all
    this.selectedIndex = 0

    if (!this.filtered.length) {
      this.content.innerHTML = `<div class="menu-groups"><div class="menu-group"><div class="hm-slash-empty">${escapeHtml(this.getT('slash.empty'))}</div></div></div>`
      this.scheduleBounds()
      return
    }
    const itemHtml = (item, index) =>
      `<li class="hm-slash-item${index === 0 ? ' hover' : ''}" data-index="${index}" role="option" aria-selected="${index === 0}">${item.icon}<span>${escapeHtml(item.label)}</span></li>`
    let html = '<div class="menu-groups">'
    if (q) {
      html += `<div class="menu-group">${this.filtered.map(itemHtml).join('')}</div>`
    } else {
      let index = 0
      for (const group of ['text', 'list', 'advanced']) {
        const items = this.filtered.filter((item) => item.group === group)
        if (!items.length) continue
        html += `<div class="menu-group"><h6>${escapeHtml(this.getT(GROUP_LABEL[group]))}</h6>`
        for (const item of items) html += itemHtml(item, index++)
        html += '</div>'
      }
    }
    this.content.innerHTML = `${html}</div>`
    this.scheduleBounds()
  }

  highlight() {
    const items = this.content.querySelectorAll('.hm-slash-item')
    items.forEach((item, index) => {
      const selected = index === this.selectedIndex
      item.classList.toggle('hover', selected)
      item.setAttribute('aria-selected', String(selected))
    })
    items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }

  move(delta) {
    if (!this.filtered.length) return
    this.selectedIndex = (this.selectedIndex + delta + this.filtered.length) % this.filtered.length
    this.highlight()
  }

  runSelected() {
    const item = this.filtered[this.selectedIndex]
    if (!item) return
    this.provider.hide()
    item.run(this.ctx, this.view)
    this.view.focus()
  }

  onKey(event) {
    if (this.content.getAttribute('data-show') !== 'true') return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Tab') {
      event.preventDefault()
      this.move(event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1)
      return true
    }
    if (event.key === 'Enter') {
      if (!this.filtered.length) {
        this.provider.hide()
        return false
      }
      event.preventDefault()
      this.runSelected()
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      this.provider.hide()
      return true
    }
    return false
  }

  onPointerMove = (event) => {
    const item = event.target.closest?.('.hm-slash-item')
    if (!item) return
    this.selectedIndex = Number(item.dataset.index)
    this.highlight()
  }

  onPointerDown = (event) => {
    if (event.target.closest?.('.hm-slash-item')) event.preventDefault()
  }

  onPointerUp = (event) => {
    const item = event.target.closest?.('.hm-slash-item')
    if (!item) return
    this.selectedIndex = Number(item.dataset.index)
    this.runSelected()
  }

  update(view, previousState) {
    this.provider.update(view, previousState)
  }

  destroy() {
    if (this.boundsRaf) cancelAnimationFrame(this.boundsRaf)
    this.provider.destroy()
    this.content.remove()
  }
}

export function createSlashPlugin(ctx, getT) {
  let menu = null
  return new Plugin({
    key: KEY,
    view: (view) => {
      menu = new SlashMenu(ctx, view, getT)
      return {
        update: (currentView, previousState) => menu?.update(currentView, previousState),
        destroy: () => {
          menu?.destroy()
          menu = null
        }
      }
    },
    props: {
      handleKeyDown: (_view, event) => menu?.onKey(event) || false
    }
  })
}
