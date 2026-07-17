import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { launchApp } from './helpers.js'

async function editHeading(page, text) {
  const block = page.locator('.km-block[data-bi="0"]')
  await block.hover()
  await block.locator('.km-src-edit').click()
  const editor = page.locator('.km-src-editor')
  await editor.fill(`# ${text}`)
  await editor.press('Control+Enter')
  await expect(page.getByRole('heading', { name: text })).toBeVisible()
}

async function openHistory(page) {
  await page.locator('button[title^="Command palette"]').click()
  const input = page.locator('.palette-input input')
  await input.fill('>打开本地历史')
  await page.locator('.palette-item[data-kind="cmd"]', { hasText: '打开本地历史' }).click()
  await expect(page.locator('.hm-history-dialog')).toBeVisible()
}

test('local history survives restart, compares snapshots, and restores through Keep undo state', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'em-local-history-doc-'))
  const userDataDir = mkdtempSync(join(tmpdir(), 'em-local-history-profile-'))
  const docPath = join(workspace, 'history.md')
  writeFileSync(docPath, '# Version one\n', 'utf8')
  let first = null
  let second = null

  try {
    first = await launchApp([docPath], { userDataDir })
    await first.page.locator('.tab', { hasText: 'history.md' }).click()
    await first.page.locator('.statusbar button[title="设置"]').click()
    const historySwitch = first.page
      .locator('.hm-set-row', { hasText: '持久化本地历史' })
      .getByRole('switch')
    await historySwitch.click()
    await expect(historySwitch).toHaveAttribute('aria-checked', 'true')
    await first.page.keyboard.press('Escape')

    await editHeading(first.page, 'Version two')
    await first.page.locator('.hm-save-fab').click()
    await expect.poll(() => readFileSync(docPath, 'utf8')).toContain('Version two')

    await editHeading(first.page, 'Version three')
    await first.page.locator('.hm-save-fab').click()
    await expect.poll(() => readFileSync(docPath, 'utf8')).toContain('Version three')

    await first.cleanup({ preserveUserData: true })
    first = null

    second = await launchApp([docPath], { userDataDir })
    await second.page.locator('.tab', { hasText: 'history.md' }).click()
    await openHistory(second.page)
    const items = second.page.locator('.hm-history-item')
    await expect(items).toHaveCount(2)

    await items.first().getByRole('button', { name: '比较' }).click()
    const review = second.page.locator('.hm-review')
    await expect(review.locator('.hm-review-preview.before')).toContainText('Version two')
    await expect(review.locator('.hm-review-preview.after')).toContainText('Version three')
    await second.page.locator('.hm-review-close').click()

    await openHistory(second.page)
    await second.page.locator('.hm-history-item').first().getByRole('button', { name: '恢复' }).click()
    await expect(second.page.getByRole('heading', { name: 'Version two' })).toBeVisible()
    await expect(second.page.locator('.status-history-btn.undo')).toBeEnabled()
  } finally {
    if (first) await first.cleanup()
    if (second) await second.cleanup()
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      /* best effort; Electron can hold Chromium cache files briefly on Windows */
    }
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
