import { KEYBINDING_COMMANDS } from '../shared/keybindings.js'

export const MENU_KEYBINDING_IDS = new Set(
  KEYBINDING_COMMANDS.filter((command) => command.menu).map((command) => command.id)
)

const VALID_ACCELERATOR = /^[A-Za-z0-9+\-/\\[\]=,.;'` ]+$/

export function normalizeMenuKeybindings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result = {}
  for (const [id, accelerator] of Object.entries(value)) {
    if (!MENU_KEYBINDING_IDS.has(id)) continue
    if (accelerator !== null && (
      typeof accelerator !== 'string' ||
      accelerator.length > 80 ||
      !VALID_ACCELERATOR.test(accelerator)
    )) return null
    result[id] = accelerator
  }
  return result
}

export function menuAccelerator(overrides, id, fallback) {
  return Object.prototype.hasOwnProperty.call(overrides || {}, id)
    ? overrides[id] || undefined
    : fallback
}
