import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { launchApp, selectStatusViewMode } from './helpers.js'

const tempMarkdown = (name, content) => {
  const dir = mkdtempSync(join(tmpdir(), 'em-editor-continuity-'))
  const file = join(dir, name)
  writeFileSync(file, content, 'utf8')
  return { dir, file }
}

test('Milkdown waits for a closing backtick and flushes the completed inline code to source', async () => {
  const { dir, file } = tempMarkdown('inline-code.md', '# Inline\n\nTarget')
  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'inline-code.md' }).click()
    await page.locator('button.hm-engine-mode').click()
    const editor = page.locator('.ProseMirror:visible')
    await expect(editor).toBeVisible()
    const paragraph = editor.locator('p', { hasText: 'Target' })
    await paragraph.click()
    await page.keyboard.press('End')

    await page.keyboard.type('`hello')
    await expect(paragraph.locator('code')).toHaveCount(0)
    await expect(page.locator('.tab.active .tab-close')).toHaveClass(/dirty/)

    await page.keyboard.type('`')
    await expect(paragraph.locator('code')).toHaveText('hello')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('x')
    await expect(paragraph).toContainText('hellox')
    await expect(paragraph.locator('code')).toHaveText('hello')
    await page.keyboard.press('Enter')
    await page.keyboard.type('```')
    await expect(editor.locator('p').last()).toHaveText('```')

    await selectStatusViewMode(page, 'source')
    const source = page.locator('textarea.source-editor:visible')
    await expect(source).toHaveValue(/Target`hello`x/)
    await expect(source).not.toHaveValue(/\\`hello\\`/)
    expect(((await source.inputValue()).match(/`/g) || []).length).toBeGreaterThanOrEqual(5)
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Milkdown full deletion followed by an immediate source switch keeps the latest edit cleanly', async () => {
  const { dir, file } = tempMarkdown(
    'rapid-edit.md',
    '# Old title\n\nOld paragraph\n\n> Old quote\n'
  )
  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'rapid-edit.md' }).click()
    await page.locator('button.hm-engine-mode').click()
    const editor = page.locator('.ProseMirror:visible')
    await expect(editor).toBeVisible()
    await editor.evaluate((element) => {
      const paragraph = [...element.querySelectorAll('p')].find(
        (node) => node.textContent === 'Old paragraph'
      )
      const quote = element.querySelector('blockquote p')
      const range = document.createRange()
      range.setStart(paragraph.firstChild, 4)
      range.setEnd(quote.firstChild, 3)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await page.keyboard.type('JOINED')
    await selectStatusViewMode(page, 'source')
    const partialSource = page.locator('textarea.source-editor:visible')
    await expect(partialSource).toHaveValue(/JOINED/)
    await expect(partialSource).not.toHaveValue(/Old paragraph|Old quote/)
    await selectStatusViewMode(page, 'rich')
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('replacement')
    await selectStatusViewMode(page, 'source')

    const source = page.locator('textarea.source-editor:visible')
    await expect(source).toHaveValue(/replacement/)
    await expect(source).not.toHaveValue(/Old paragraph|Old quote|<br\s*\/?\s*>/)
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Milkdown empty paragraphs and blockquotes never serialize placeholder br elements', async () => {
  const { dir, file } = tempMarkdown(
    'empty-blocks.md',
    '# Empty blocks\n\nParagraph body\n\n> Quoted body\n\nTail\n'
  )
  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'empty-blocks.md' }).click()
    await page.locator('button.hm-engine-mode').click()
    const editor = page.locator('.ProseMirror:visible')
    await expect(editor).toBeVisible()
    const selectContents = async (target) => {
      await target.evaluate((element) => {
        element.focus()
        const range = document.createRange()
        range.selectNodeContents(element)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      })
    }
    const paragraph = editor.locator(':scope > p', { hasText: 'Paragraph body' })
    await selectContents(paragraph)
    await page.keyboard.press('Backspace')
    const quote = editor.locator('blockquote p')
    await selectContents(quote)
    await page.keyboard.press('Backspace')
    await selectStatusViewMode(page, 'source')

    const source = page.locator('textarea.source-editor:visible')
    await expect(source).not.toHaveValue(/Paragraph body|Quoted body|<br\s*\/?\s*>/)
    await expect(source).toHaveValue(/Tail/)
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a source caret and viewport survive an application restart', async () => {
  const content = [
    '# Position',
    '',
    ...Array.from({ length: 180 }, (_, index) => [`Paragraph ${index + 1} content`, '']).flat()
  ].join('\n')
  const { dir, file } = tempMarkdown('position.md', content)
  const first = await launchApp([file])
  const userDataDir = first.userDataDir
  const targetOffset = content.indexOf('Paragraph 140')
  try {
    await first.page.locator('.tab', { hasText: 'position.md' }).click()
    await selectStatusViewMode(first.page, 'source')
    const source = first.page.locator('textarea.source-editor:visible')
    await source.evaluate((element, offset) => {
      element.__hmSourceApi.scrollToOffset(offset, {
        align: 'top',
        placeCaret: true,
        focus: true,
        userNavigation: true
      })
      element.dispatchEvent(new Event('scroll'))
    }, targetOffset)
    await expect
      .poll(() =>
        first.page.evaluate(() => {
          const stored = JSON.parse(
            localStorage.getItem('easymarkdown.document-positions.v1') || '{}'
          )
          return stored.entries?.[0]?.viewport || 0
        })
      )
      .toBeGreaterThan(targetOffset - 50)
  } finally {
    await first.cleanup({ preserveUserData: true })
  }

  const second = await launchApp([file], { userDataDir })
  try {
    await second.page.locator('.tab', { hasText: 'position.md' }).click()
    const scroller = second.page.locator('.editor-scroll.km-scroll:visible')
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(1200)
    const topText = await scroller.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const blocks = [...element.querySelectorAll('.km-block')]
      return (
        blocks.find((block) => block.getBoundingClientRect().bottom >= rect.top + 4)?.textContent ||
        ''
      )
    })
    expect(topText).toMatch(/Paragraph 13\d|Paragraph 14\d/)
  } finally {
    await second.cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Milkdown viewport restores into the source-backed editor after restart', async () => {
  const content = [
    '# Milkdown position',
    '',
    ...Array.from({ length: 150 }, (_, index) => [`Milkdown paragraph ${index + 1}`, '']).flat()
  ].join('\n')
  const { dir, file } = tempMarkdown('milkdown-position.md', content)
  const first = await launchApp([file])
  const userDataDir = first.userDataDir
  const targetOffset = content.indexOf('Milkdown paragraph 120')
  try {
    await first.page.locator('.tab', { hasText: 'milkdown-position.md' }).click()
    await first.page.locator('button.hm-engine-mode').click()
    const target = first.page.locator('.ProseMirror:visible p', {
      hasText: 'Milkdown paragraph 120'
    })
    await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await target.click()
    await expect
      .poll(() =>
        first.page.evaluate(() => {
          const stored = JSON.parse(
            localStorage.getItem('easymarkdown.document-positions.v1') || '{}'
          )
          return stored.entries?.[0]?.viewport || 0
        })
      )
      .toBeGreaterThan(targetOffset - 200)
  } finally {
    await first.cleanup({ preserveUserData: true })
  }

  const second = await launchApp([file], { userDataDir })
  try {
    await second.page.locator('.tab', { hasText: 'milkdown-position.md' }).click()
    const scroller = second.page.locator('.editor-scroll.km-scroll:visible')
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000)
  } finally {
    await second.cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})
