import { describe, expect, it } from 'vitest'
import openMode from '../packages/vscode-extension/src/openMode.js'

const { navigationTargetFromSelection, isRecentNavigationTarget } = openMode
const commandKind = 3

function selection(startLine, startCharacter, endLine, endCharacter) {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
    isEmpty: startLine === endLine && startCharacter === endCharacter
  }
}

describe('VSCode Markdown open-mode navigation signals', () => {
  it('treats an empty command cursor target as navigation', () => {
    expect(
      navigationTargetFromSelection({
        kind: commandKind,
        commandKind,
        selection: selection(10, 2, 10, 2),
        at: 100
      })
    ).toEqual({ line: 10, character: 2, text: '', at: 100 })
  })

  it('carries a short single-line Search selection for the late Keep fallback', () => {
    expect(
      navigationTargetFromSelection({
        kind: commandKind,
        commandKind,
        selection: selection(5, 0, 5, 11),
        selectedText: 'SearchMatch',
        at: 100
      })
    ).toEqual({ line: 5, character: 0, text: 'SearchMatch', at: 100 })
  })

  it('does not treat restored, keyboard, or mouse selections as navigation', () => {
    const restored = selection(3, 1, 3, 1)
    expect(
      navigationTargetFromSelection({ kind: undefined, commandKind, selection: restored })
    ).toBeNull()
    expect(navigationTargetFromSelection({ kind: 1, commandKind, selection: restored })).toBeNull()
    expect(navigationTargetFromSelection({ kind: 2, commandKind, selection: restored })).toBeNull()
  })

  it('expires navigation signals outside the open handoff window', () => {
    const target = { at: 100 }
    expect(isRecentNavigationTarget(target, 1600)).toBe(true)
    expect(isRecentNavigationTarget(target, 1601)).toBe(false)
    expect(isRecentNavigationTarget(target, 99)).toBe(false)
  })
})
