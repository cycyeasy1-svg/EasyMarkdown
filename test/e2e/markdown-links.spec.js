import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { launchApp, selectStatusViewMode } from './helpers.js'

test('link problems, F8 navigation, references, heading rename, and file rename use previewed minimal changes', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'em-links-'))
  const indexPath = join(workspace, 'index.md')
  const guidePath = join(workspace, 'guide.md')
  mkdirSync(join(workspace, 'assets'))
  writeFileSync(indexPath, [
    '# Home',
    '',
    '[Guide](guide.md#install)',
    '[Missing heading](guide.md#absent)',
    '[Missing document](missing.md)',
    '![Missing image](assets/no.png)',
    '[Bad URL](javascript:alert(1))',
    ''
  ].join('\n'))
  writeFileSync(guidePath, [
    '# Guide',
    '',
    '## Install',
    '',
    '[Back](index.md#home)',
    ''
  ].join('\n'))

  const { page, cleanup } = await launchApp([indexPath])
  try {
    await expect(page.locator('.km-doc:visible')).toContainText('Missing document')
    await page.locator('button[title^="Markdown 链接"]').click()
    await expect(page.locator('.hm-link-kind')).toHaveCount(4)
    await expect(page.locator('.hm-link-kind')).toContainText([
      '标题不存在',
      '文档不存在',
      '图片不存在',
      'URL 不允许'
    ])

    await selectStatusViewMode(page, 'source')
    const source = page.locator('textarea.source-editor')
    await expect(source).toBeVisible()
    await page.keyboard.press('F8')
    await expect.poll(() =>
      source.evaluate((element) =>
        element.value.slice(element.selectionStart, element.selectionEnd)
      )
    ).toContain('Missing heading')

    await selectStatusViewMode(page, 'rich')
    await page.locator('.km-doc:visible a', { hasText: 'Guide' }).click()
    await expect(page.locator('.tab', { hasText: 'guide.md' })).toBeVisible()
    const installHeading = page.locator('.km-heading', { hasText: 'Install' })
    await installHeading.click({ button: 'right' })
    await page.locator('.km-table-menu button', { hasText: '查找所有引用' }).click()
    await expect(page.locator('.hm-link-tabs button[aria-selected="true"]')).toContainText('引用')
    await expect(page.locator('.hm-search-item')).toHaveCount(1)
    await expect(page.locator('.hm-search-item')).toContainText('Guide')

    await installHeading.click({ button: 'right' })
    await page.locator('.km-table-menu button', { hasText: '重命名标题' }).click()
    const headingInput = page.locator('.hm-rename-input')
    await headingInput.fill('Setup')
    await headingInput.press('Enter')
    await expect(page.locator('.hm-link-update')).toBeVisible()
    await expect(page.locator('.hm-link-update')).toContainText('2 个文件中有 2 行将被修改')
    await page.locator('.hm-link-update-actions .primary').click()
    await expect(page.locator('.hm-link-update')).toHaveCount(0)
    await expect.poll(() => readFileSync(guidePath, 'utf8')).toContain('## Setup')
    await expect.poll(() => readFileSync(indexPath, 'utf8')).toContain('guide.md#setup')

    const guideTab = page.locator('.tab', { hasText: 'guide.md' })
    await guideTab.click({ button: 'right' })
    await page.locator('.tab-menu-item', { hasText: '重命名' }).click()
    const fileInput = page.locator('.hm-rename-input')
    await fileInput.fill('handbook.md')
    await fileInput.press('Enter')
    await expect(page.locator('.hm-link-update')).toContainText('重命名后更新链接吗')
    await page.locator('.hm-link-update-actions button', { hasText: '取消' }).click()
    expect(existsSync(guidePath)).toBe(true)

    await guideTab.click({ button: 'right' })
    await page.locator('.tab-menu-item', { hasText: '重命名' }).click()
    await page.locator('.hm-rename-input').fill('handbook.md')
    await page.locator('.hm-rename-input').press('Enter')
    await page.locator('.hm-link-update-actions .primary').click()
    const handbookPath = join(workspace, 'handbook.md')
    await expect.poll(() => existsSync(handbookPath)).toBe(true)
    expect(existsSync(guidePath)).toBe(false)
    await expect.poll(() => readFileSync(indexPath, 'utf8')).toContain('handbook.md#setup')
  } finally {
    await cleanup()
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('reference lookup stays inside the target workspace and links remain last in the activity tools', async () => {
  const root = mkdtempSync(join(tmpdir(), 'em-links-scope-'))
  const projectA = join(root, 'project-a')
  const projectB = join(root, 'project-b')
  mkdirSync(projectA)
  mkdirSync(projectB)

  const targetPath = join(projectA, 'guide.md')
  const localReferencePath = join(projectA, 'index.md')
  const crossProjectReferencePath = join(projectB, 'index.md')
  const crossProjectTarget = relative(dirname(crossProjectReferencePath), targetPath).replace(/\\/g, '/')
  writeFileSync(targetPath, '# Guide\n\n## Install\n')
  writeFileSync(localReferencePath, '[Local guide](guide.md#install)\n')
  writeFileSync(crossProjectReferencePath, `[Cross-project guide](${encodeURI(crossProjectTarget)}#install)\n`)

  const { app, page, cleanup } = await launchApp([targetPath])
  try {
    await app.evaluate(({ BrowserWindow }, roots) => {
      const win = BrowserWindow.getAllWindows()[0]
      for (const workspaceRoot of roots) win.webContents.send('open-folder', workspaceRoot)
    }, [projectA, projectB])
    await expect(page.locator('.tree-root')).toHaveCount(2)

    const outlineButton = page.locator('button[title="大纲"]')
    const linksButton = page.locator('button[title^="Markdown 链接"]')
    const linksHandle = await linksButton.elementHandle()
    expect(await outlineButton.evaluate((element, links) =>
      !!(element.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING), linksHandle
    )).toBe(true)

    const installHeading = page.locator('.km-heading', { hasText: 'Install' })
    await installHeading.click({ button: 'right' })
    await page.locator('.km-table-menu button', { hasText: '查找所有引用' }).click()
    await expect(page.locator('.hm-search-item')).toHaveCount(1)
    await expect(page.locator('.hm-search-item')).toContainText('Local guide')
    await expect(page.locator('.hm-search-item')).not.toContainText('Cross-project guide')
  } finally {
    await cleanup()
    rmSync(root, { recursive: true, force: true })
  }
})
