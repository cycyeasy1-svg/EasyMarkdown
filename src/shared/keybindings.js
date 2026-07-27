export const KEYBINDINGS_KEY = 'easymarkdown.keybindings.v1'

export const KEYBINDING_CATEGORIES = Object.freeze({
  file: 'file',
  view: 'view',
  editor: 'editor'
})

export const KEYBINDING_COMMANDS = Object.freeze([
  { id: 'file.new', handler: 'new', titleKey: 'cmd.new', category: 'file', defaultBindings: ['Mod+N'], menu: true },
  { id: 'file.open', handler: 'open', titleKey: 'cmd.open', category: 'file', defaultBindings: ['Mod+O'], menu: true },
  { id: 'workspace.openFolder', handler: 'openFolder', titleKey: 'cmd.openFolder', category: 'file', defaultBindings: ['Mod+Shift+O'], menu: true, capability: 'folderWorkspace' },
  { id: 'file.save', handler: 'save', titleKey: 'cmd.save', category: 'file', defaultBindings: ['Mod+S'], menu: true },
  { id: 'file.saveAs', handler: 'saveAs', titleKey: 'cmd.saveAs', category: 'file', defaultBindings: ['Mod+Shift+S'], menu: true },
  { id: 'file.exportPdf', handler: 'exportPdf', titleKey: 'cmd.exportPdf', category: 'file', defaultBindings: ['Mod+Shift+E'], menu: true, capability: 'pdfExport' },
  { id: 'file.exportHtml', handler: 'exportHtml', titleKey: 'cmd.exportHtml', category: 'file', defaultBindings: ['Mod+Shift+H'], menu: true, capability: 'htmlExport' },
  { id: 'file.print', handler: 'print', titleKey: 'cmd.print', category: 'file', defaultBindings: ['Mod+Alt+P'], menu: true, capability: 'print' },
  { id: 'app.settings', handler: 'settings', titleKey: 'cmd.settings', category: 'file', defaultBindings: ['Mod+Comma'], menu: true },
  { id: 'tab.close', handler: 'closeTab', titleKey: 'cmd.closeTab', category: 'file', defaultBindings: ['Mod+W'], menu: true },
  { id: 'tab.reopen', handler: 'reopenClosedTab', titleKey: 'cmd.reopenClosedTab', category: 'file', defaultBindings: ['Mod+Shift+T'], menu: true, rendererOwned: true },

  { id: 'view.commandPalette', handler: 'palette', titleKey: 'cmd.palette', category: 'view', defaultBindings: ['Mod+P'], menu: true },
  { id: 'workspace.search', handler: 'searchWorkspace', titleKey: 'cmd.searchWorkspace', category: 'view', defaultBindings: ['Mod+Shift+F'], menu: true, capability: 'workspaceSearch' },
  { id: 'view.toggleSidebar', handler: 'toggleSidebar', titleKey: 'cmd.sidebar', category: 'view', defaultBindings: ['Mod+B'], menu: true, rendererOwned: true },
  { id: 'view.showOutline', handler: 'toggleOutline', titleKey: 'cmd.outline', category: 'view', defaultBindings: ['Mod+Shift+L'], menu: true },
  { id: 'view.toggleSource', handler: 'toggleSource', titleKey: 'cmd.source', category: 'view', defaultBindings: ['Mod+Slash'], menu: true },
  { id: 'view.cycleTheme', handler: 'toggleTheme', titleKey: 'cmd.theme', category: 'view', defaultBindings: [], menu: true },
  { id: 'tab.previous', handler: 'previousTab', titleKey: 'cmd.previousTab', category: 'view', defaultBindings: ['Mod+PageUp'], rendererOwned: true },
  { id: 'tab.next', handler: 'nextTab', titleKey: 'cmd.nextTab', category: 'view', defaultBindings: ['Mod+PageDown'], rendererOwned: true },

  { id: 'editor.find', handler: 'find', titleKey: 'cmd.find', category: 'editor', defaultBindings: ['Mod+F'], menu: true },
  { id: 'editor.replace', handler: 'replace', titleKey: 'cmd.replace', category: 'editor', defaultBindings: ['Mod+H'], macDefaultBindings: ['Mod+Alt+F'], menu: true },
  { id: 'editor.block.paragraph', titleKey: 'block.paragraph', category: 'editor', defaultBindings: ['Mod+0'], editorOwned: true },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    id: `editor.block.h${level}`,
    titleKey: `block.h${level}`,
    category: 'editor',
    defaultBindings: [`Mod+${level}`],
    editorOwned: true
  }))
])

export const KEYBINDING_COMMAND_BY_ID = Object.freeze(
  Object.fromEntries(KEYBINDING_COMMANDS.map((command) => [command.id, command]))
)

const MODIFIER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift', 'Meta']
const CODE_KEYS = new Set([
  'Slash', 'Backslash', 'BracketLeft', 'BracketRight', 'Minus', 'Equal',
  'Comma', 'Period', 'Semicolon', 'Quote', 'Backquote', 'Space', 'Tab',
  'Enter', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'
])
const CHARACTER_KEYS = {
  '/': 'Slash',
  '\\': 'Backslash',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '-': 'Minus',
  '=': 'Equal',
  ',': 'Comma',
  '.': 'Period',
  ';': 'Semicolon',
  "'": 'Quote',
  '`': 'Backquote'
}
const ELECTRON_KEYS = {
  Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Comma: ',', Period: '.', Semicolon: ';',
  Quote: "'", Backquote: '`', Escape: 'Esc', ArrowUp: 'Up',
  ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right'
}
const DISPLAY_KEYS = {
  Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Comma: ',', Period: '.', Semicolon: ';',
  Quote: "'", Backquote: '`', Escape: 'Esc', ArrowUp: '↑',
  ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
}

function normalizeKeyName(value) {
  const key = String(value || '').trim()
  if (!key) return null
  if (/^Key[A-Z]$/.test(key)) return key.slice(3)
  if (/^Digit[0-9]$/.test(key)) return key.slice(5)
  if (/^Numpad[0-9]$/.test(key)) return key.slice(6)
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key)) return key
  if (/^[a-z]$/i.test(key)) return key.toUpperCase()
  if (/^[0-9]$/.test(key)) return key
  return CHARACTER_KEYS[key] || (CODE_KEYS.has(key) ? key : null)
}

export function normalizeKeybinding(binding) {
  if (typeof binding !== 'string') return null
  const modifiers = new Set()
  let key = null
  for (const part of binding.split('+').map((value) => value.trim()).filter(Boolean)) {
    const lower = part.toLowerCase()
    if (['mod', 'cmd', 'command', 'cmdorctrl'].includes(lower)) modifiers.add('Mod')
    else if (['ctrl', 'control'].includes(lower)) modifiers.add('Ctrl')
    else if (['alt', 'option'].includes(lower)) modifiers.add('Alt')
    else if (lower === 'shift') modifiers.add('Shift')
    else if (lower === 'meta') modifiers.add('Meta')
    else if (!key) key = normalizeKeyName(part)
    else return null
  }
  if (!key) return null
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+')
}

export const normalizeKeybindings = (bindings) =>
  [...new Set((Array.isArray(bindings) ? bindings : []).map(normalizeKeybinding).filter(Boolean))]

export function defaultBindingsFor(command, platform = 'win32') {
  return normalizeKeybindings(platform === 'darwin' && command.macDefaultBindings
    ? command.macDefaultBindings
    : command.defaultBindings)
}

export function getDefaultKeybindingMap(platform = 'win32') {
  return Object.fromEntries(
    KEYBINDING_COMMANDS.map((command) => [command.id, defaultBindingsFor(command, platform)])
  )
}

export function normalizeKeybindingOverrides(overrides) {
  const normalized = {}
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return normalized
  for (const [id, bindings] of Object.entries(overrides)) {
    if (!KEYBINDING_COMMAND_BY_ID[id] || !Array.isArray(bindings)) continue
    normalized[id] = normalizeKeybindings(bindings)
  }
  return normalized
}

export function getEffectiveKeybindingMap(overrides = {}, platform = 'win32') {
  return { ...getDefaultKeybindingMap(platform), ...normalizeKeybindingOverrides(overrides) }
}

export function eventToKeybinding(event, platform = 'win32') {
  if (!event || event.isComposing) return null
  const key = normalizeKeyName(event.code || event.key)
  if (!key || /^(?:Control|Meta|Shift|Alt)(?:Left|Right)$/.test(event.code || '')) return null
  const parts = []
  if (event.ctrlKey) parts.push(platform === 'darwin' ? 'Ctrl' : 'Mod')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push(platform === 'darwin' ? 'Mod' : 'Meta')
  parts.push(key)
  return normalizeKeybinding(parts.join('+'))
}

export function resolveMod(binding, platform = 'win32') {
  const normalized = normalizeKeybinding(binding)
  if (!normalized) return null
  return normalized.split('+').map((part) =>
    part === 'Mod' ? (platform === 'darwin' ? 'Meta' : 'Ctrl') : part
  ).join('+')
}

export function keybindingMatchesEvent(binding, event, platform = 'win32') {
  const expected = resolveMod(binding, platform)
  const actual = eventToKeybinding(event, platform)
  return !!expected && !!actual && expected === resolveMod(actual, platform)
}

export function keybindingToElectronAccelerator(binding) {
  const parts = normalizeKeybinding(binding)?.split('+')
  if (!parts?.length) return null
  const key = parts.pop()
  return [...parts.map((part) => part === 'Mod' ? 'CmdOrCtrl' : part), ELECTRON_KEYS[key] || key].join('+')
}

export function keybindingToDisplay(binding, platform = 'win32') {
  const parts = normalizeKeybinding(binding)?.split('+')
  if (!parts?.length) return ''
  const key = parts.pop()
  const modifiers = parts.map((part) => {
    if (part === 'Mod') return platform === 'darwin' ? '⌘' : 'Ctrl'
    if (platform === 'darwin' && part === 'Alt') return '⌥'
    if (platform === 'darwin' && part === 'Shift') return '⇧'
    if (platform === 'darwin' && part === 'Ctrl') return '⌃'
    if (platform === 'darwin' && part === 'Meta') return '⌘'
    return part
  })
  modifiers.push(DISPLAY_KEYS[key] || key)
  return platform === 'darwin' ? modifiers.join('') : modifiers.join('+')
}

export function bindingConflict(commandId, candidate, effective, platform = 'win32') {
  const resolved = resolveMod(candidate, platform)
  if (!resolved) return null
  for (const [otherId, bindings] of Object.entries(effective || {})) {
    if (otherId === commandId) continue
    if ((bindings || []).some((binding) => resolveMod(binding, platform) === resolved)) {
      return KEYBINDING_COMMAND_BY_ID[otherId] || { id: otherId, titleKey: otherId }
    }
  }
  return null
}

const SYSTEM_BINDINGS = new Set(['Mod+A', 'Mod+C', 'Mod+V', 'Mod+X', 'Mod+Z', 'Mod+Shift+Z'])
const WINDOW_BINDINGS = new Set(['Mod+Q', 'Mod+M', 'Mod+Alt+I', 'Mod+Shift+I', 'F11', 'F12', 'Alt+F4'])

export function reservedKeybindingReason(binding, platform = 'win32') {
  const normalized = normalizeKeybinding(binding)
  if (!normalized) return 'invalid'
  const parts = normalized.split('+')
  const key = parts.at(-1)
  const modifiers = parts.slice(0, -1)
  if ((!modifiers.length && (key.length === 1 || key === 'Space')) ||
      ['Escape', 'Enter', 'Tab', 'Backspace', 'Delete'].includes(key)) return 'textInput'
  const resolved = resolveMod(normalized, platform)
  if ([...SYSTEM_BINDINGS].some((item) => resolveMod(item, platform) === resolved)) return 'systemEditing'
  if ([...WINDOW_BINDINGS].some((item) => resolveMod(item, platform) === resolved)) return 'appWindow'
  return null
}

export function menuAcceleratorPayload(effective) {
  return Object.fromEntries(KEYBINDING_COMMANDS
    .filter((command) => command.menu)
    .map((command) => [
      command.id,
      effective?.[command.id]?.[0]
        ? keybindingToElectronAccelerator(effective[command.id][0])
        : null
    ]))
}
