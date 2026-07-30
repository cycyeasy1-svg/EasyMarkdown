// Shared Keep-mode inline formatting helpers.
//
// Both the desktop Keep editor and the VSCode webview edit a location-scoped
// textarea, then commit that draft through their existing minimal source patch.
// This module only transforms the textarea selection; it never parses or
// serializes the surrounding document, so Keep's zero-diff boundary stays intact.

import {
  KEEP_TEXT_COLOR_GROUPS,
  keepTextColorByValue
} from './keep-format-colors.js'

export { KEEP_TEXT_COLOR_GROUPS, KEEP_TEXT_COLORS } from './keep-format-colors.js'

const INLINE_BLOCK_TYPES = new Set(['heading', 'paragraph', 'quote', 'list'])
const COLOR_OPEN_RE = /<span\s+style="color:\s*(#[0-9a-f]{6})"\s*>$/i
const COLOR_SELECTED_RE =
  /^<span\s+style="color:\s*(#[0-9a-f]{6})"\s*>([\s\S]*)<\/span>$/i
const HTML_ENVELOPES = [
  { open: /<span\s+style="color:\s*#[0-9a-f]{6}"\s*>$/i, close: '</span>' },
  { open: /<mark\s+class="hm-hl-yellow"\s*>$/i, close: '</mark>' },
  { open: /<u>$/i, close: '</u>' }
]
const BACKSLASH_ENTITY = '&#92;'
const GENERATED_FORMAT_OPEN_RE =
  /^(?:\*{1,3}|~~|==|<(?:span|mark|u|strong|em|s)\b)/i

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}

function normalizeSelection(value, start, end) {
  const text = String(value ?? '')
  const from = clamp(start, 0, text.length)
  const to = clamp(end, from, text.length)
  return { text, start: from, end: to }
}

function coreSelection(text, start, end) {
  if (start === end) return { start, end }
  let from = start
  let to = end
  while (from < to && /\s/.test(text[from])) from++
  while (to > from && /\s/.test(text[to - 1])) to--
  return { start: from, end: to }
}

function formattingEnvelope(text, start, end) {
  const original = text.slice(start, end)
  let from = start
  let to = end
  let expanded = true
  while (expanded) {
    expanded = false
    const prefix = text.slice(0, from)
    for (const wrapper of HTML_ENVELOPES) {
      const match = prefix.match(wrapper.open)
      if (!match || !text.slice(to).startsWith(wrapper.close)) continue
      from -= match[0].length
      to += wrapper.close.length
      expanded = true
      break
    }
  }
  return { start: from, end: to, original }
}

function retargetOriginalSelection(result, original) {
  if (!result.changed || !original) return result
  const selected = result.value.slice(result.selectionStart, result.selectionEnd)
  const offset = selected.indexOf(original)
  if (offset < 0) return result
  return {
    ...result,
    selectionStart: result.selectionStart + offset,
    selectionEnd: result.selectionStart + offset + original.length
  }
}

function unchanged(text, start, end, reason = '') {
  return { value: text, selectionStart: start, selectionEnd: end, changed: false, reason }
}

function changed(value, selectionStart, selectionEnd) {
  return { value, selectionStart, selectionEnd, changed: true, reason: '' }
}

function wrapperState(text, start, end, open, close) {
  const selected = text.slice(start, end)
  if (
    start !== end &&
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  ) {
    return { kind: 'selected' }
  }
  if (
    start >= open.length &&
    text.slice(start - open.length, start) === open &&
    text.slice(end, end + close.length) === close
  ) {
    return { kind: 'surrounding' }
  }
  return null
}

function backslashRunBefore(text, index) {
  let count = 0
  while (index - count - 1 >= 0 && text[index - count - 1] === '\\') count++
  return count
}

function boundaryEscapeAt(text, wrapperStart) {
  const entityStart = wrapperStart - BACKSLASH_ENTITY.length
  if (entityStart < 0 || text.slice(entityStart, wrapperStart) !== BACKSLASH_ENTITY) return null
  return { entityStart, wrapperStart }
}

function removeWrapper(text, start, end, open, close, state) {
  const wrapperStart = state.kind === 'selected' ? start : start - open.length
  const inner =
    state.kind === 'selected'
      ? text.slice(start + open.length, end - close.length)
      : text.slice(start, end)
  const suffixStart =
    state.kind === 'selected' ? end : end + close.length
  const boundary = boundaryEscapeAt(text, wrapperStart)
  // If another generated wrapper remains inside, it inherits the encoded path
  // separator. Otherwise decode it back to the exact source slash that existed
  // before formatting.
  if (boundary && !GENERATED_FORMAT_OPEN_RE.test(inner)) {
    return changed(
      text.slice(0, boundary.entityStart) + '\\' + inner + text.slice(suffixStart),
      boundary.entityStart + 1,
      boundary.entityStart + 1 + inner.length
    )
  }
  if (state.kind === 'selected') {
    return changed(
      text.slice(0, start) + inner + text.slice(end),
      start,
      start + inner.length
    )
  }
  return changed(
    text.slice(0, start - open.length) + text.slice(start, end) + text.slice(end + close.length),
    start - open.length,
    end - open.length
  )
}

function addWrapper(text, start, end, open, close) {
  const core = coreSelection(text, start, end)
  const inner = text.slice(core.start, core.end)
  const needsBoundaryEscape = backslashRunBefore(text, core.start) % 2 === 1
  const insertStart = needsBoundaryEscape ? core.start - 1 : core.start
  const prefix = needsBoundaryEscape ? BACKSLASH_ENTITY : ''
  const selectionShift = prefix.length - (needsBoundaryEscape ? 1 : 0)
  return changed(
    text.slice(0, insertStart) + prefix + open + inner + close + text.slice(core.end),
    core.start + selectionShift + open.length,
    core.end + selectionShift + open.length
  )
}

function toggleWrapper(text, start, end, open, close) {
  const core = coreSelection(text, start, end)
  const state = wrapperState(text, core.start, core.end, open, close)
  if (state) return removeWrapper(text, core.start, core.end, open, close, state)
  return addWrapper(text, core.start, core.end, open, close)
}

function starRunBefore(text, index) {
  let count = 0
  while (index - count - 1 >= 0 && text[index - count - 1] === '*') count++
  return count
}

function starRunAfter(text, index) {
  let count = 0
  while (index + count < text.length && text[index + count] === '*') count++
  return count
}

function selectedStarRuns(text, start, end) {
  let before = 0
  let after = 0
  while (start + before < end && text[start + before] === '*') before++
  while (end - after - 1 >= start && text[end - after - 1] === '*') after++
  return { before, after }
}

function starFormatActive(text, start, end, width) {
  if (start !== end) {
    const selected = selectedStarRuns(text, start, end)
    if (width === 1 && selected.before % 2 === 1 && selected.after % 2 === 1) {
      return { kind: 'selected' }
    }
    if (width === 2 && selected.before >= 2 && selected.after >= 2) {
      return { kind: 'selected' }
    }
  }

  const before = starRunBefore(text, start)
  const after = starRunAfter(text, end)
  if (width === 1 && before % 2 === 1 && after % 2 === 1) return { kind: 'surrounding' }
  if (width === 2 && before >= 2 && after >= 2) return { kind: 'surrounding' }
  return null
}

function toggleStarFormat(text, start, end, width) {
  const core = coreSelection(text, start, end)
  if (core.start === core.end) {
    const marker = '*'.repeat(width)
    return toggleWrapper(text, core.start, core.end, marker, marker)
  }

  const state = starFormatActive(text, core.start, core.end, width)
  const marker = '*'.repeat(width)
  if (state) return removeWrapper(text, core.start, core.end, marker, marker, state)

  return addWrapper(text, core.start, core.end, marker, marker)
}

function findColorWrapper(text, start, end) {
  const selected = text.slice(start, end)
  const selectedMatch = selected.match(COLOR_SELECTED_RE)
  if (selectedMatch) {
    return {
      kind: 'selected',
      color: selectedMatch[1].toLowerCase(),
      open: selected.slice(0, selected.indexOf('>') + 1),
      inner: selectedMatch[2]
    }
  }

  const openMatch = text.slice(0, start).match(COLOR_OPEN_RE)
  if (openMatch && text.slice(end).startsWith('</span>')) {
    return {
      kind: 'surrounding',
      color: openMatch[1].toLowerCase(),
      open: openMatch[0],
      inner: text.slice(start, end)
    }
  }
  return null
}

function applyColor(text, start, end, requestedColor) {
  const core = coreSelection(text, start, end)
  const state = findColorWrapper(text, core.start, core.end)
  const color = String(requestedColor || '').toLowerCase()

  if (state) {
    if (!color || color === state.color) {
      return removeWrapper(text, core.start, core.end, state.open, '</span>', state)
    }
    const open = `<span style="color: ${color}">`
    if (state.kind === 'selected') {
      const replacement = open + state.inner + '</span>'
      return changed(
        text.slice(0, core.start) + replacement + text.slice(core.end),
        core.start + open.length,
        core.start + open.length + state.inner.length
      )
    }
    const delta = open.length - state.open.length
    return changed(
      text.slice(0, core.start - state.open.length) +
        open +
        state.inner +
        text.slice(core.end),
      core.start + delta,
      core.end + delta
    )
  }

  if (!color) return unchanged(text, start, end)
  return toggleWrapper(text, core.start, core.end, `<span style="color: ${color}">`, '</span>')
}

function highlightState(text, start, end) {
  const htmlOpen = '<mark class="hm-hl-yellow">'
  return (
    (wrapperState(text, start, end, '==', '==') && { open: '==', close: '==' }) ||
    (wrapperState(text, start, end, htmlOpen, '</mark>') && {
      open: htmlOpen,
      close: '</mark>'
    })
  )
}

function toggleHighlight(text, start, end) {
  const core = coreSelection(text, start, end)
  const wrapper = highlightState(text, core.start, core.end)
  if (wrapper) {
    const state = wrapperState(text, core.start, core.end, wrapper.open, wrapper.close)
    return removeWrapper(text, core.start, core.end, wrapper.open, wrapper.close, state)
  }
  // The shared highlight grammar deliberately rejects '=' inside ==…==.
  // Fall back to the already-supported safe HTML form for those selections.
  const selected = text.slice(core.start, core.end)
  return selected.includes('=')
    ? toggleWrapper(text, core.start, core.end, '<mark class="hm-hl-yellow">', '</mark>')
    : toggleWrapper(text, core.start, core.end, '==', '==')
}

export function keepBlockSupportsFormatting(type) {
  return INLINE_BLOCK_TYPES.has(type)
}

export function detectKeepTextFormat(value, start, end) {
  const { text, start: from, end: to } = normalizeSelection(value, start, end)
  const core = coreSelection(text, from, to)
  const envelope = formattingEnvelope(text, core.start, core.end)
  const color = findColorWrapper(text, core.start, core.end)?.color || ''
  return {
    bold: !!starFormatActive(text, envelope.start, envelope.end, 2),
    italic: !!starFormatActive(text, envelope.start, envelope.end, 1),
    strike: !!wrapperState(text, envelope.start, envelope.end, '~~', '~~'),
    underline: !!wrapperState(text, envelope.start, envelope.end, '<u>', '</u>'),
    highlight: !!highlightState(text, envelope.start, envelope.end),
    color
  }
}

export function applyKeepTextFormat(value, start, end, command, option) {
  const { text, start: from, end: to } = normalizeSelection(value, start, end)
  if (from !== to && text.slice(from, to).includes('\n')) {
    return unchanged(text, from, to, 'multiline')
  }

  if (command === 'color') return applyColor(text, from, to, option)
  const core = coreSelection(text, from, to)
  const envelope = formattingEnvelope(text, core.start, core.end)
  let result
  if (command === 'bold') result = toggleStarFormat(text, envelope.start, envelope.end, 2)
  else if (command === 'italic') result = toggleStarFormat(text, envelope.start, envelope.end, 1)
  else if (command === 'strike') {
    result = toggleWrapper(text, envelope.start, envelope.end, '~~', '~~')
  } else if (command === 'underline') {
    result = toggleWrapper(text, envelope.start, envelope.end, '<u>', '</u>')
  } else if (command === 'highlight') {
    result = toggleHighlight(text, envelope.start, envelope.end)
  }
  if (result) return retargetOriginalSelection(result, envelope.original)
  return unchanged(text, from, to, 'unknown-command')
}

function makeGlyph(doc, command) {
  const glyph = doc.createElement('span')
  glyph.className = `km-format-glyph km-format-glyph-${command}`
  glyph.setAttribute('aria-hidden', 'true')
  glyph.textContent =
    command === 'bold'
      ? 'B'
      : command === 'italic'
        ? 'I'
        : command === 'strike'
          ? 'S'
          : command === 'underline'
            ? 'U'
            : 'A'
  if (command === 'highlight' || command === 'color') {
    const bar = doc.createElement('span')
    bar.className = 'km-format-glyph-bar'
    glyph.appendChild(bar)
  }
  return glyph
}

export function createKeepFormatToolbar(textarea, { t = (key) => key } = {}) {
  const doc = textarea.ownerDocument
  const toolbar = doc.createElement('div')
  toolbar.className = 'km-format-toolbar'
  toolbar.setAttribute('role', 'toolbar')

  const group = doc.createElement('div')
  group.className = 'km-format-group'
  toolbar.appendChild(group)

  const commandButtons = new Map()
  const commandLabels = {
    bold: 'tb.bold',
    italic: 'tb.italic',
    strike: 'tb.strike',
    underline: 'tb.underline',
    highlight: 'tb.highlight'
  }

  let translate = t
  let savedStart = textarea.selectionStart || 0
  let savedEnd = textarea.selectionEnd || savedStart
  let colorPalette = null
  let colorTrigger = null

  const captureSelection = () => {
    savedStart = textarea.selectionStart ?? savedStart
    savedEnd = textarea.selectionEnd ?? savedStart
  }

  const selectedHasLineBreak = () =>
    savedStart !== savedEnd && textarea.value.slice(savedStart, savedEnd).includes('\n')

  const closePalette = () => {
    if (!colorPalette) return
    colorPalette.hidden = true
    colorTrigger?.setAttribute('aria-expanded', 'false')
  }

  const update = () => {
    const state = detectKeepTextFormat(textarea.value, savedStart, savedEnd)
    const disabled = textarea.readOnly || textarea.disabled || selectedHasLineBreak()
    for (const [command, button] of commandButtons) {
      button.classList.toggle('active', !!state[command])
      button.setAttribute('aria-pressed', state[command] ? 'true' : 'false')
      button.disabled = disabled
    }
    if (colorTrigger) {
      colorTrigger.disabled = disabled
      colorTrigger.classList.toggle('active', !!state.color)
      colorTrigger.setAttribute('aria-pressed', state.color ? 'true' : 'false')
      const color = keepTextColorByValue(state.color)
      colorTrigger.dataset.color = color?.id || 'default'
      if (color) colorTrigger.style.setProperty('--km-format-color', color.value)
      else colorTrigger.style.removeProperty('--km-format-color')
    }
    colorPalette?.querySelectorAll('[data-color-value]').forEach((button) => {
      const active = button.dataset.colorValue === state.color
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', active ? 'true' : 'false')
      button.disabled = textarea.readOnly || textarea.disabled || selectedHasLineBreak()
    })
  }

  const refreshLabels = (nextT) => {
    translate = nextT || translate
    toolbar.setAttribute('aria-label', translate('keep.formatToolbar'))
    const multiline = selectedHasLineBreak() ? ` — ${translate('keep.formatSingleLine')}` : ''
    for (const [command, button] of commandButtons) {
      const label = translate(commandLabels[command])
      button.title = label + multiline
      button.setAttribute('aria-label', label)
    }
    if (colorTrigger) {
      const label = translate('tb.textColor')
      colorTrigger.title = label + multiline
      colorTrigger.setAttribute('aria-label', label)
      colorPalette?.setAttribute('aria-label', label)
    }
    colorPalette?.querySelectorAll('[data-color-label-key]').forEach((button) => {
      const label = translate(button.dataset.colorLabelKey)
      const tone = button.dataset.colorToneKey
        ? ` · ${translate(button.dataset.colorToneKey)}`
        : ''
      const fullLabel = label + tone
      button.title = fullLabel
      button.setAttribute('aria-label', fullLabel)
    })
    colorPalette?.querySelectorAll('[data-group-label-key]').forEach((label) => {
      const text = translate(label.dataset.groupLabelKey)
      label.textContent = text
      label.parentElement?.setAttribute('aria-label', text)
    })
    colorPalette?.querySelectorAll('[data-default-label-key]').forEach((label) => {
      const text = translate(label.dataset.defaultLabelKey)
      label.textContent = text
      const button = label.closest('button')
      if (!button) return
      button.title = text
      button.setAttribute('aria-label', text)
    })
  }

  const apply = (command, option) => {
    if (textarea.readOnly || textarea.disabled) return
    const result = applyKeepTextFormat(
      textarea.value,
      savedStart,
      savedEnd,
      command,
      option
    )
    if (!result.changed) {
      update()
      return
    }
    textarea.value = result.value
    savedStart = result.selectionStart
    savedEnd = result.selectionEnd
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(savedStart, savedEnd)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    closePalette()
    update()
  }

  const addCommand = (command) => {
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = `km-format-btn km-format-${command}`
    button.appendChild(makeGlyph(doc, command))
    button.addEventListener('mousedown', (event) => {
      captureSelection()
      event.preventDefault()
    })
    button.addEventListener('click', () => apply(command))
    group.appendChild(button)
    commandButtons.set(command, button)
  }

  addCommand('bold')
  addCommand('italic')
  addCommand('strike')
  addCommand('underline')

  const separator = doc.createElement('span')
  separator.className = 'km-format-separator'
  separator.setAttribute('aria-hidden', 'true')
  group.appendChild(separator)

  addCommand('highlight')

  const colorWrap = doc.createElement('div')
  colorWrap.className = 'km-format-color-wrap'
  colorTrigger = doc.createElement('button')
  colorTrigger.type = 'button'
  colorTrigger.className = 'km-format-btn km-format-color-trigger'
  colorTrigger.dataset.color = 'default'
  colorTrigger.setAttribute('aria-haspopup', 'true')
  colorTrigger.setAttribute('aria-expanded', 'false')
  colorTrigger.appendChild(makeGlyph(doc, 'color'))
  colorTrigger.addEventListener('mousedown', (event) => {
    captureSelection()
    event.preventDefault()
  })
  colorTrigger.addEventListener('click', () => {
    const opening = colorPalette.hidden
    colorPalette.hidden = !opening
    colorTrigger.setAttribute('aria-expanded', opening ? 'true' : 'false')
  })

  colorPalette = doc.createElement('div')
  colorPalette.className = 'km-format-palette'
  colorPalette.hidden = true
  colorPalette.setAttribute('role', 'dialog')

  const defaultColor = doc.createElement('button')
  defaultColor.type = 'button'
  defaultColor.className = 'km-format-default-color'
  defaultColor.dataset.colorValue = ''
  defaultColor.setAttribute('aria-pressed', 'false')
  defaultColor.addEventListener('mousedown', (event) => event.preventDefault())
  defaultColor.addEventListener('click', () => apply('color', ''))
  const defaultChip = doc.createElement('span')
  defaultChip.className = 'km-format-default-chip'
  defaultChip.setAttribute('aria-hidden', 'true')
  const defaultLabel = doc.createElement('span')
  defaultLabel.dataset.defaultLabelKey = 'tb.textColor.default'
  defaultColor.append(defaultChip, defaultLabel)
  colorPalette.appendChild(defaultColor)

  for (const groupData of KEEP_TEXT_COLOR_GROUPS) {
    const section = doc.createElement('div')
    section.className = `km-format-palette-section km-format-palette-${groupData.id}`
    section.setAttribute('role', 'group')

    const heading = doc.createElement('div')
    heading.className = 'km-format-palette-heading'
    heading.dataset.groupLabelKey = groupData.labelKey

    const grid = doc.createElement('div')
    grid.className = 'km-format-palette-grid'
    grid.style.setProperty('--km-format-columns', String(groupData.columns))

    for (const color of groupData.colors) {
      const swatch = doc.createElement('button')
      swatch.type = 'button'
      swatch.className = `km-format-swatch km-color-${color.id}`
      swatch.style.setProperty('--km-format-color', color.value)
      swatch.dataset.colorValue = color.value
      swatch.dataset.colorLabelKey = color.labelKey
      if (color.toneKey) swatch.dataset.colorToneKey = color.toneKey
      swatch.setAttribute('aria-pressed', 'false')
      swatch.addEventListener('mousedown', (event) => event.preventDefault())
      swatch.addEventListener('click', () => apply('color', color.value))
      grid.appendChild(swatch)
    }

    section.append(heading, grid)
    colorPalette.appendChild(section)
  }

  colorWrap.append(colorTrigger, colorPalette)
  group.appendChild(colorWrap)

  const selectionChanged = () => {
    captureSelection()
    update()
    refreshLabels()
  }
  textarea.addEventListener('select', selectionChanged)
  textarea.addEventListener('keyup', selectionChanged)
  textarea.addEventListener('mouseup', selectionChanged)
  textarea.addEventListener('input', selectionChanged)
  textarea.addEventListener('focus', closePalette)
  textarea.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    const mod = event.ctrlKey || event.metaKey
    const command =
      mod && !event.altKey && key === 'b'
        ? 'bold'
        : mod && !event.altKey && key === 'i'
          ? 'italic'
          : mod && event.altKey && key === 'h'
            ? 'highlight'
            : ''
    if (!command) return
    captureSelection()
    const result = applyKeepTextFormat(
      textarea.value,
      savedStart,
      savedEnd,
      command
    )
    if (!result.changed) return
    event.preventDefault()
    event.stopPropagation()
    apply(command)
  })
  toolbar.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || colorPalette.hidden) return
    event.preventDefault()
    closePalette()
    colorTrigger.focus()
  })

  toolbar.__kmRefreshFormatLabels = refreshLabels
  toolbar.__kmUpdateFormatState = update
  refreshLabels()
  update()
  return toolbar
}

export function refreshKeepFormatToolbar(root, t) {
  const toolbars = root?.classList?.contains('km-format-toolbar')
    ? [root]
    : [...(root?.querySelectorAll?.('.km-format-toolbar') || [])]
  toolbars.forEach((toolbar) => {
    toolbar.__kmRefreshFormatLabels?.(t)
    toolbar.__kmUpdateFormatState?.()
  })
}
