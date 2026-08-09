import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')

describe('main-process module boundaries', () => {
  it('keeps unit-testable IPC feature modules independent from Electron', async () => {
    const sources = await Promise.all([
      readSource('src/main/window-ipc.js'),
      readSource('src/main/update-ipc.js')
    ])
    for (const source of sources) expect(source).not.toMatch(/from\s+['"]electron['"]/)
})
  it('keeps window and update channel ownership out of the composition root', async () => {
    const source = await readSource('src/main/index.js')
    expect(source).not.toMatch(/ipcMain\.handle\(['"]window:/)
    expect(source).not.toMatch(/ipcMain\.on\(['"]app:(?:confirm|cancel)-close/)
    expect(source).not.toMatch(/ipcMain\.handle\(['"]update:check/)
    expect(source).toContain('registerWindowIpc({')
    expect(source).toContain('registerUpdateIpc({')
  })
})
