// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppErrorBoundary from '../src/renderer/src/components/AppErrorBoundary.jsx'

let root

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('AppErrorBoundary', () => {
  it('replaces a renderer crash with recovery actions and reports metadata', async () => {
    document.body.innerHTML = '<div id="hm-boot-splash"></div><div id="root"></div>'
    const logDiagnostic = vi.fn().mockResolvedValue({ ok: true })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { logDiagnostic, exportDiagnostics: vi.fn() }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const Broken = () => {
      throw new Error('intentional renderer failure')
    }
    root = createRoot(document.getElementById('root'))
    await act(async () => {
      root.render(createElement(
        AppErrorBoundary,
        null,
        createElement(Broken)
      ))
    })

    expect(document.querySelector('.hm-recovery')).not.toBeNull()
    expect(document.body.textContent).toMatch(/Reload interface|重新加载界面|画面を再読み込み/)
    expect(document.getElementById('hm-boot-splash')).toBeNull()
    expect(logDiagnostic).toHaveBeenCalledWith(
      'error',
      'render-failure',
      expect.objectContaining({ message: 'intentional renderer failure' })
    )
  })
})
