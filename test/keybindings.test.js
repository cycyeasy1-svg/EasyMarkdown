import { describe, expect, it } from 'vitest'
import {
  bindingConflict,
  eventToKeybinding,
  getEffectiveKeybindingMap,
  keybindingMatchesEvent,
  keybindingToDisplay,
  keybindingToElectronAccelerator,
  menuAcceleratorPayload,
  normalizeKeybinding,
  normalizeKeybindingOverrides,
  reservedKeybindingReason
} from '../src/shared/keybindings.js'
import {
  menuAccelerator,
  normalizeMenuKeybindings
} from '../src/main/menu-keybindings.js'

describe('custom keybindings', () => {
  it('normalizes aliases, physical key codes and platform display', () => {
    expect(normalizeKeybinding('cmd + shift + /')).toBe('Mod+Shift+Slash')
    expect(eventToKeybinding({
      code: 'KeyK',
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
      metaKey: false
    }, 'win32')).toBe('Mod+Shift+K')
    expect(keybindingToDisplay('Mod+Alt+F', 'darwin')).toBe('⌘⌥F')
    expect(keybindingToElectronAccelerator('Mod+Slash')).toBe('CmdOrCtrl+/')
  })

  it('applies explicit empty overrides and drops unknown command ids', () => {
    const overrides = normalizeKeybindingOverrides({
      'file.open': [],
      'view.toggleSidebar': ['Mod+Shift+B'],
      unknown: ['Mod+U']
    })
    const effective = getEffectiveKeybindingMap(overrides, 'win32')
    expect(effective['file.open']).toEqual([])
    expect(effective['view.toggleSidebar']).toEqual(['Mod+Shift+B'])
    expect(effective.unknown).toBeUndefined()
  })

  it('matches events and rejects conflicts or reserved editing shortcuts', () => {
    const effective = getEffectiveKeybindingMap({}, 'win32')
    expect(keybindingMatchesEvent('Mod+N', {
      code: 'KeyN',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false
    }, 'win32')).toBe(true)
    expect(bindingConflict('file.open', 'Mod+N', effective, 'win32')?.id).toBe('file.new')
    expect(reservedKeybindingReason('Mod+C', 'win32')).toBe('systemEditing')
    expect(reservedKeybindingReason('K', 'win32')).toBe('textInput')
  })

  it('sends only validated menu accelerators to the main process', () => {
    const effective = getEffectiveKeybindingMap({
      'file.open': ['Mod+Shift+P'],
      'view.cycleTheme': []
    }, 'win32')
    const payload = menuAcceleratorPayload(effective)
    expect(payload['file.open']).toBe('CmdOrCtrl+Shift+P')
    expect(payload['view.cycleTheme']).toBeNull()
    expect(normalizeMenuKeybindings(payload)).toEqual(payload)
    expect(normalizeMenuKeybindings({ 'file.open': 'CmdOrCtrl+P<script>' })).toBeNull()
    expect(menuAccelerator({ 'file.open': null }, 'file.open', 'CmdOrCtrl+O')).toBeUndefined()
  })
})
