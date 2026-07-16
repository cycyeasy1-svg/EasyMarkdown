import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launchApp, fixture } from './helpers.js'

const sendMenu = (app, command) => app.evaluate(({ BrowserWindow }, cmd) => {
  BrowserWindow.getAllWindows()[0]?.webContents.send('menu', cmd)
}, command)

test('remaining upstream: attachments insert in Keep, source, and Milkdown without clobbering assets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'em-attachments-'))
  const doc = join(root, 'attachments.md')
  const sources = ['keep file.pdf', 'source[1].txt', 'rich.zip'].map((name, index) => {
    const path = join(root, `picked-${index}`, name)
    mkdirSync(join(root, `picked-${index}`), { recursive: true })
    writeFileSync(path, `attachment-${index}`)
    return path
  })
  writeFileSync(doc, '# Attachment modes\n\nStart here.\n')
  const { app, page, cleanup } = await launchApp([doc])
  try {
    await page.locator('.tab', { hasText: 'attachments.md' }).click()
    await expect(page.locator('.km-doc:visible')).toBeVisible()
    await app.evaluate(({ dialog }, paths) => {
      let index = 0
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[index++]] })
    }, sources)

    await sendMenu(app, 'attach')
    await expect(page.locator('.km-doc a', { hasText: 'keep file.pdf' })).toBeVisible()
    await expect.poll(() => readFileSync(join(root, 'assets', 'keep file.pdf'), 'utf8')).toBe('attachment-0')
    await sendMenu(app, 'save')
    await expect.poll(() => readFileSync(doc, 'utf8')).toContain('[keep file.pdf](<assets/keep file.pdf>)')

    await sendMenu(app, 'toggleSource')
    const source = page.locator('.source-editor:visible')
    await expect(source).toBeVisible()
    await source.click()
    await page.keyboard.press('End')
    await sendMenu(app, 'attach')
    await expect(source).toHaveValue(/\[source\\\[1\\\]\.txt\]\(<assets\/source\[1\]\.txt>\)/)
    await sendMenu(app, 'save')
    await expect.poll(() => readFileSync(doc, 'utf8')).toContain('[source\\[1\\].txt](<assets/source[1].txt>)')

    await sendMenu(app, 'toggleSource')
    await expect(page.locator('.km-doc')).toBeVisible()
    await sendMenu(app, 'toggleEditorMode')
    await expect(page.locator('.ProseMirror:visible')).toBeVisible()
    await sendMenu(app, 'attach')
    await expect(page.locator('.ProseMirror:visible a', { hasText: 'rich.zip' })).toBeVisible()
    await expect.poll(() => readFileSync(join(root, 'assets', 'rich.zip'), 'utf8')).toBe('attachment-2')
  } finally {
    await cleanup()
    rmSync(root, { recursive: true, force: true })
  }
})

test('remaining upstream: hidden-file setting updates tree and workspace search but never exposes hard exclusions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'em-hidden-'))
  writeFileSync(join(root, 'visible.md'), '# visible\npublic-marker')
  writeFileSync(join(root, '.hidden.md'), '# hidden\nhidden-marker')
  mkdirSync(join(root, '.secret'), { recursive: true })
  writeFileSync(join(root, '.secret', 'nested.md'), '# nested\nhidden-marker')
  mkdirSync(join(root, '.git'), { recursive: true })
  writeFileSync(join(root, '.git', 'ignored.md'), '# ignored\nhidden-marker')
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'ignored.md'), '# ignored\nhidden-marker')
  const { app, page, cleanup } = await launchApp([root])
  try {
    await expect(page.locator('.tree-label', { hasText: 'visible.md' })).toBeVisible()
    await expect(page.getByText('.hidden.md', { exact: true })).toHaveCount(0)

    await sendMenu(app, 'settings')
    const hiddenRow = page.locator('.hm-set-row', { hasText: '显示隐藏文件' })
    await hiddenRow.getByRole('switch').click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('.hidden.md', { exact: true })).toBeVisible()
    await expect(page.getByText('.secret', { exact: true })).toBeVisible()
    await expect(page.getByText('.git', { exact: true })).toHaveCount(0)
    await expect(page.getByText('node_modules', { exact: true })).toHaveCount(0)

    await sendMenu(app, 'searchWorkspace')
    const query = page.locator('.hm-search-box input')
    await query.fill('hidden-marker')
    await expect(page.locator('.hm-search-filename', { hasText: '.hidden.md' })).toBeVisible()
    await expect(page.locator('.hm-search-filename', { hasText: 'nested.md' })).toBeVisible()
    await expect(page.locator('.hm-search-filename', { hasText: 'ignored.md' })).toHaveCount(0)

    await sendMenu(app, 'settings')
    await page.locator('.hm-set-row', { hasText: '显示隐藏文件' }).getByRole('switch').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.hm-search-empty')).toHaveText('没有找到结果')
  } finally {
    await cleanup()
    rmSync(root, { recursive: true, force: true })
  }
})

test('remaining upstream: language fonts apply live and unclosed inline math previews only in Milkdown', async () => {
  const { app, page, cleanup } = await launchApp([
    fixture('welcome.md'),
    fixture('chinese.md'),
    fixture('japanese.md')
  ])
  try {
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(page.locator('.km-doc:visible')).toBeVisible()
    await sendMenu(app, 'settings')
    const enSelect = page.locator('#hm-font-en')
    const zhSelect = page.locator('#hm-font-zh')
    const jaSelect = page.locator('#hm-font-ja')
    const monoSelect = page.locator('#hm-font-mono')
    await expect(page.locator('.hm-font-control input')).toHaveCount(0)
    await expect.poll(() => enSelect.locator('option').count()).toBeGreaterThan(4)
    const defaultEn = await enSelect.inputValue()
    const defaultZh = await zhSelect.inputValue()
    const defaultJa = await jaSelect.inputValue()
    const defaultMono = await monoSelect.inputValue()
    const pickAlternative = (select, current, excluded = []) => select.locator('option').evaluateAll(
      (options, state) => options
        .map((option) => option.value)
        .find((value) => value && value !== state.current && !state.excluded.includes(value)),
      { current, excluded }
    )
    const enFont = await pickAlternative(enSelect, defaultEn)
    const zhFont = await pickAlternative(zhSelect, defaultZh, [enFont])
    const jaFont = await pickAlternative(jaSelect, defaultJa, [enFont, zhFont])
    const monoFont = await pickAlternative(monoSelect, defaultMono, [enFont, zhFont, jaFont])
    await enSelect.selectOption(enFont)
    await zhSelect.selectOption(zhFont)
    await jaSelect.selectOption(jaFont)
    await monoSelect.selectOption(monoFont)
    await page.keyboard.press('Escape')
    await expect.poll(() => page.locator('.km-doc:visible').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(enFont)

    await page.locator('.tab', { hasText: 'chinese.md' }).click()
    const zhFamily = await page.locator('.km-doc[lang="zh"]:visible').evaluate((el) => getComputedStyle(el).fontFamily)
    expect(zhFamily).toContain(enFont)
    expect(zhFamily).toContain(zhFont)
    expect(zhFamily.indexOf(enFont)).toBeLessThan(zhFamily.indexOf(zhFont))

    await page.locator('.tab', { hasText: 'japanese.md' }).click()
    const jaFamily = await page.locator('.km-doc[lang="ja"]:visible').evaluate((el) => getComputedStyle(el).fontFamily)
    expect(jaFamily).toContain(enFont)
    expect(jaFamily).toContain(jaFont)
    expect(jaFamily.indexOf(enFont)).toBeLessThan(jaFamily.indexOf(jaFont))

    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await sendMenu(app, 'toggleSource')
    await expect.poll(() => page.locator('.source-editor:visible').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(monoFont)
    await sendMenu(app, 'toggleSource')
    await sendMenu(app, 'toggleEditorMode')
    const pm = page.locator('.ProseMirror:visible')
    await expect(pm).toBeVisible()
    const paragraph = pm.locator('p').first()
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' $x^2')
    await expect(page.locator('.hm-math-preview')).toBeVisible()
    await page.keyboard.type('$')
    await expect(page.locator('.hm-math-preview')).toBeHidden()

    await sendMenu(app, 'settings')
    for (const id of ['en', 'zh', 'ja', 'mono']) {
      await page.locator(`#hm-font-${id}`).locator('..').getByRole('button').click()
    }
    await expect(page.locator('#hm-font-en')).toHaveValue(defaultEn)
    await expect(page.locator('#hm-font-zh')).toHaveValue(defaultZh)
    await expect(page.locator('#hm-font-ja')).toHaveValue(defaultJa)
    await expect(page.locator('#hm-font-mono')).toHaveValue(defaultMono)
    await expect(page.locator('#hm-font-en').locator('..').getByRole('button')).toBeDisabled()
  } finally {
    await cleanup()
  }
})
