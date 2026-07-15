import { describe, expect, it } from 'vitest'
import { getAllowedExternalUrl } from '../src/main/helpers.js'

describe('shared VS Code external-link host gate', () => {
  it('allows only http, https, and mailto targets', () => {
    expect(getAllowedExternalUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(getAllowedExternalUrl('http://example.com')).toBe('http://example.com/')
    expect(getAllowedExternalUrl('mailto:user@example.com')).toBe('mailto:user@example.com')
  })

  it('rejects webview attempts to invoke privileged or executable schemes', () => {
    for (const url of [
      'file:///etc/passwd',
      'command:workbench.action.openSettings',
      'vscode://settings/editor.fontSize',
      'javascript:alert(1)',
      'data:text/html,unsafe',
      '../relative.md',
      ''
    ]) {
      expect(getAllowedExternalUrl(url)).toBe(null)
    }
  })
})
