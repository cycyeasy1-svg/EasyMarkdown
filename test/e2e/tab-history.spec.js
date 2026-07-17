import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, fixture } from './helpers.js'

function createDocs(prefix = 'em-tab-history-') {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  const names = ['alpha.md', 'bravo.md', 'charlie.md']
  const paths = names.map((name) => {
    const path = join(dir, name)
    writeFileSync(path, `# ${name}\n\n${name} body\n`, 'utf8')
    return path
  })
  return { dir, names, paths }
}

test('Ctrl+Tab previews MRU tabs and release, Enter and Esc are predictable', async () => {
  const docs = createDocs()
  const { page, cleanup } = await launchApp(docs.paths)
  try {
    const tab = (name) => page.locator('.tab', { hasText: name })
    await expect(tab('alpha.md')).toBeVisible()
    await expect(tab('bravo.md')).toBeVisible()
    await expect(tab('charlie.md')).toBeVisible()

    // Establish a deterministic MRU order: alpha, bravo, charlie.
    await tab('alpha.md').click()
    await tab('bravo.md').click()
    await tab('alpha.md').click()

    await page.keyboard.down('Control')
    await page.keyboard.press('Tab')
    const switcher = page.locator('.hm-tab-switcher')
    await expect(switcher).toBeVisible()
    await expect(switcher.locator('.hm-tab-switcher-item.selected')).toContainText('bravo.md')
    await page.keyboard.press('Tab')
    await expect(switcher.locator('.hm-tab-switcher-item.selected')).toContainText('charlie.md')
    await page.keyboard.press('Escape')
    await expect(switcher).toHaveCount(0)
    await page.keyboard.up('Control')
    await expect(page.locator('.tab.active')).toContainText('alpha.md')

    await page.keyboard.down('Control')
    await page.keyboard.press('Tab')
    await expect(switcher.locator('.hm-tab-switcher-item.selected')).toContainText('bravo.md')
    await page.keyboard.up('Control')
    await expect(page.locator('.tab.active')).toContainText('bravo.md')

    await page.keyboard.down('Control')
    await page.keyboard.press('Tab')
    await expect(switcher.locator('.hm-tab-switcher-item.selected')).toContainText('alpha.md')
    await page.keyboard.press('Enter')
    await expect(switcher).toHaveCount(0)
    await page.keyboard.up('Control')
    await expect(page.locator('.tab.active')).toContainText('alpha.md')

    // Strip-order navigation remains available separately.
    await page.keyboard.press('Control+PageDown')
    await expect(page.locator('.tab.active')).toContainText('bravo.md')
    await page.keyboard.press('Control+PageUp')
    await expect(page.locator('.tab.active')).toContainText('alpha.md')
  } finally {
    await cleanup()
    rmSync(docs.dir, { recursive: true, force: true })
  }
})

test('Ctrl+Shift+T restores a saved tab at its old position and reports missing files', async () => {
  const docs = createDocs('em-tab-restore-')
  const { page, cleanup } = await launchApp(docs.paths)
  try {
    const tab = (name) => page.locator('.tab', { hasText: name })
    await expect(tab('bravo.md')).toBeVisible()

    await tab('bravo.md').locator('.tab-close').click()
    await expect(tab('bravo.md')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+T')
    await expect(tab('bravo.md')).toBeVisible()

    const fileTabs = (await page.locator('.tab-title').allTextContents())
      .filter((title) => docs.names.includes(title))
    expect(fileTabs).toEqual(docs.names)

    await tab('charlie.md').locator('.tab-close').click()
    await expect(tab('charlie.md')).toHaveCount(0)
    unlinkSync(docs.paths[2])
    await page.keyboard.press('Control+Shift+T')
    await expect(page.locator('.hm-toast')).toContainText('文件可能已被移动或删除')
    await expect(tab('charlie.md')).toHaveCount(0)
  } finally {
    await cleanup()
    rmSync(docs.dir, { recursive: true, force: true })
  }
})

test('discarded untitled drafts are not added to closed-tab history', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    await page.locator('button[title="新建文件 (Ctrl+N)"]').click()
    const editor = page.locator('.ProseMirror:visible')
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type('temporary draft')
    await expect(page.locator('.tab.active .tab-close')).toHaveClass(/dirty/)

    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.tab.active .tab-close').click()
    await expect(page.locator('.hm-toast')).toContainText('只有已保存到磁盘的标签')

    await page.keyboard.press('Control+Shift+T')
    await expect(page.locator('.hm-toast')).toContainText('没有可恢复的已关闭文件标签')
  } finally {
    await cleanup()
  }
})
