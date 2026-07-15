import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launchApp } from './helpers.js'

const findShortcut = process.platform === 'darwin' ? 'Meta+F' : 'Control+F'

async function launchFindFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'em-find-live-'))
  const file = join(dir, 'find-live.md')
  writeFileSync(file, '# Live find\n\nneedle first\n\nneedle second\n', 'utf8')
  const app = await launchApp([file])
  await app.page.locator('.tab', { hasText: 'find-live.md' }).click()
  return { ...app, dir }
}

async function removeFixture(cleanup, dir) {
  await cleanup()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best effort: Electron can briefly retain a file handle on Windows.
  }
}

async function openNeedleFind(page) {
  await page.keyboard.press(findShortcut)
  await page.locator('.findbar input').first().fill('needle')
  await expect(page.locator('.findbar-count')).toHaveText(/^[12]\/2$/)
}

test('keep mode refreshes find results after a committed block edit', async () => {
  const { page, cleanup, dir } = await launchFindFixture()
  try {
    await expect(page.locator('.km-doc')).toBeVisible()
    await openNeedleFind(page)

    const block = page.locator('.km-block', { hasText: 'needle first' })
    await block.locator('.km-src-edit').click()
    await page.locator('.km-src-editor').fill('changed first')
    await page.locator('.km-src-actions .ok').click()

    await expect(page.locator('.km-block', { hasText: 'changed first' })).toBeVisible()
    await expect(page.locator('.findbar-count')).toHaveText('1/1')
  } finally {
    await removeFixture(cleanup, dir)
  }
})

test('Milkdown debounces live find refreshes while preserving editor focus', async () => {
  const { page, cleanup, dir } = await launchFindFixture()
  try {
    await page.locator('.mode-switch-wrap > button').click()
    const editor = page.locator('.ProseMirror', { hasText: 'Live find' })
    await expect(editor).toBeVisible()
    await openNeedleFind(page)

    const paragraph = editor.locator('p').first()
    await paragraph.click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.type('changed first')

    await expect(paragraph).toHaveText('changed first')
    await expect(page.locator('.findbar-count')).toHaveText('1/1')

    // A passive refresh must not steal the ProseMirror caret.
    await page.keyboard.type('!')
    await expect(paragraph).toHaveText('changed first!')
  } finally {
    await removeFixture(cleanup, dir)
  }
})
