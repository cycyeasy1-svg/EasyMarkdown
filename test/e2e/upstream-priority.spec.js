import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, selectStatusViewMode } from './helpers.js'

const triggerSave = (app) => app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.webContents.send('menu', 'save')
})

const withTempMarkdown = async (name, content, run) => {
  const dir = mkdtempSync(join(tmpdir(), 'em-upstream-priority-'))
  const file = join(dir, name)
  writeFileSync(file, content, 'utf8')
  const session = await launchApp([file])
  try {
    await session.page.locator('.tab', { hasText: name }).click()
    await run({ ...session, file })
  } finally {
    await session.cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
}

test('source editing preserves BOM, CRLF, and untouched mixed line endings', async () => {
  const original = '\ufeff# Heading\r\n\r\nalpha\nkeep-crlf\r\n'
  await withTempMarkdown('source-fidelity.md', original, async ({ app, page, file }) => {
    await expect(page.locator('.km-doc')).toBeVisible()
    await selectStatusViewMode(page, 'source')
    const source = page.locator('textarea.source-editor:visible')
    await source.fill('\ufeff# Heading\n\nALPHA\nkeep-crlf\n')
    await triggerSave(app)
    await expect.poll(() => readFileSync(file, 'utf8')).toBe(
      '\ufeff# Heading\r\n\r\nALPHA\nkeep-crlf\r\n'
    )
  })
})

test('Milkdown task click followed by immediate save persists the checked state', async () => {
  await withTempMarkdown('task-save.md', '# Tasks\n\n- [ ] persist me\n', async ({ app, page, file }) => {
    await page.locator('button.hm-engine-mode').click()
    await expect(page.locator('.ProseMirror:visible')).toBeVisible()
    const checkbox = page.locator('.ProseMirror:visible .label-wrapper .label.unchecked').first()
    await expect(checkbox).toBeVisible()
    await checkbox.click()
    await triggerSave(app)
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('[x] persist me')
  })
})

test('Milkdown code Copy reads the complete ProseMirror node beyond CodeMirror virtualization', async () => {
  const code = Array.from({ length: 300 }, (_, index) => `const line${index + 1} = ${index + 1};`).join('\n')
  await withTempMarkdown(
    'long-code.md',
    `# Long code\n\n\`\`\`javascript\n${code}\n\`\`\`\n`,
    async ({ app, page }) => {
      await page.locator('button.hm-engine-mode').click()
      await expect(page.locator('.ProseMirror:visible')).toBeVisible()
      await page.locator('.ProseMirror:visible .milkdown-code-block .copy-button').click()
      await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(code)
    }
  )
})
