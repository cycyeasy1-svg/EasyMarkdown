import { test, expect } from '@playwright/test'
import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { createElectronEnv, fixture, launchApp, MAIN } from './helpers.js'

function waitForExit(child) {
  if (child.exitCode != null) return Promise.resolve(child.exitCode)
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
}

test('a second file-association launch presents its document before restoring the existing window', async () => {
  const firstPath = fixture('chinese.md')
  const secondPath = fixture('japanese.md')
  const { app, page, cleanup, userDataDir } = await launchApp([firstPath])
  let secondary = null

  try {
    await page.locator('.tab', { hasText: 'chinese.md' }).click()
    await expect(page.locator('.tab.active .tab-title')).toHaveText('chinese.md')

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
    await expect.poll(
      () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())
    ).toBe(true)

    secondary = spawn(
      electronPath,
      [MAIN, `--user-data-dir=${userDataDir}`, '--lang=zh-CN', secondPath],
      { env: createElectronEnv(), windowsHide: true }
    )

    await expect.poll(
      () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())
    ).toBe(false)
    await expect(page.locator('.tab.active .tab-title')).toHaveText('japanese.md')
    await expect(page.getByRole('heading', { name: '日本語のフィクスチャ' })).toBeVisible()
    expect(await waitForExit(secondary)).toBe(0)
  } finally {
    if (secondary?.exitCode == null) {
      await Promise.race([waitForExit(secondary), new Promise((resolve) => setTimeout(resolve, 5000))])
      if (secondary.exitCode == null) secondary.kill()
    }
    await cleanup()
  }
})
