import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launchApp } from './helpers.js'

const sourceToggle = (page) => page.locator('button[title^="切换源码模式"]')

async function removeFixture(cleanup, dir) {
  await cleanup()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Electron can briefly retain a file handle on Windows.
  }
}

test('source gutter masks horizontally scrolled text behind fixed line numbers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-source-gutter-'))
  const file = join(dir, 'wide.md')
  writeFileSync(file, `# Wide source\n\n${'wide-column-'.repeat(180)}\n`, 'utf8')

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'wide.md' }).click()
    await sourceToggle(page).click()
    const source = page.locator('textarea.source-editor')
    const mask = page.locator('.source-gutter-mask')
    await expect(source).toBeVisible()
    await expect(mask).toBeVisible()

    await source.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
      element.dispatchEvent(new Event('scroll'))
    })

    const layout = await page.locator('.source-editor-wrap').evaluate((wrap) => {
      const sourceElement = wrap.querySelector('.source-editor')
      const maskElement = wrap.querySelector('.source-gutter-mask')
      const numbersElement = wrap.querySelector('.source-line-numbers')
      const maskRect = maskElement.getBoundingClientRect()
      const numbersRect = numbersElement.getBoundingClientRect()
      return {
        scrollLeft: sourceElement.scrollLeft,
        maskRight: maskRect.right,
        numbersRight: numbersRect.right,
        maskBackground: getComputedStyle(maskElement).backgroundColor,
        wrapBackground: getComputedStyle(wrap).backgroundColor
      }
    })

    expect(layout.scrollLeft).toBeGreaterThan(0)
    expect(layout.maskRight).toBeGreaterThanOrEqual(layout.numbersRight)
    expect(layout.maskBackground).toBe(layout.wrapBackground)
    expect(layout.maskBackground).not.toBe('rgba(0, 0, 0, 0)')
  } finally {
    await removeFixture(cleanup, dir)
  }
})

test('expand all opens only Markdown branches and exposes scan progress', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-sidebar-expand-'))
  const docs = join(dir, 'docs')
  const nested = join(docs, 'nested')
  const assets = join(dir, 'assets-only')
  mkdirSync(nested, { recursive: true })
  mkdirSync(assets, { recursive: true })
  writeFileSync(join(nested, 'guide.md'), '# Guide\n', 'utf8')
  writeFileSync(join(assets, 'logo.txt'), 'not markdown\n', 'utf8')
  let deep = docs
  for (let index = 0; index < 15; index += 1) {
    deep = join(deep, `level-${String(index).padStart(2, '0')}`)
    mkdirSync(deep)
  }
  writeFileSync(join(deep, 'deep-guide.md'), '# Deep guide\n', 'utf8')
  // Make the scan large enough that the progress state is observable instead
  // of flashing between two animation frames.
  for (let index = 0; index < 220; index += 1) {
    mkdirSync(join(dir, `empty-${String(index).padStart(3, '0')}`))
  }

  const { page, cleanup } = await launchApp([dir])
  try {
    const expandButton = page.locator('.sidebar-expand-all')
    await expect(expandButton).toBeVisible()
    await expandButton.click()
    await expect(page.locator('.sidebar-expand-progress')).toBeVisible()
    await expect(page.locator('.sidebar-expand-progress')).toBeHidden({ timeout: 15_000 })

    const folderRow = (name) => page.locator('.tree-row', {
      has: page.locator('.tree-label', { hasText: name })
    }).first()
    await expect(folderRow('docs').locator('.tree-chevron')).toHaveClass(/chevron-expanded/)
    await expect(folderRow('nested').locator('.tree-chevron')).toHaveClass(/chevron-expanded/)
    await expect(folderRow('assets-only').locator('.tree-chevron')).not.toHaveClass(/chevron-expanded/)
    await expect(folderRow('empty-000').locator('.tree-chevron')).not.toHaveClass(/chevron-expanded/)
    await expect(page.locator('.tree-label', { hasText: /^guide\.md$/ })).toBeVisible()
    await expect(folderRow('level-14').locator('.tree-chevron')).toHaveClass(/chevron-expanded/)
    await expect(page.locator('.tree-label', { hasText: /^deep-guide\.md$/ })).toHaveCount(1)
  } finally {
    await removeFixture(cleanup, dir)
  }
})
