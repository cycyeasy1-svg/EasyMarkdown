// Per-document CJK font routing: kana wins as Japanese, while Han without kana
// is Chinese. Latin-only documents stay unmarked and use the English stack.
import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

test('a Japanese document marks its keep-mode container lang="ja"', async () => {
  const { page, cleanup } = await launchApp([fixture('japanese.md')])
  try {
    await page.locator('.tab', { hasText: 'japanese.md' }).click()
    const doc = page.locator('.km-doc[lang="ja"]')
    await expect(doc).toBeVisible()
    // :lang(ja) actually resolves to the Japanese stack (Noto Sans JP leads it),
    // not the default --font-write (whose CJK fonts are all Chinese — SC/PingFang,
    // never a JP face), so "Noto Sans JP" is a clean discriminator.
    const family = await doc.evaluate((el) => getComputedStyle(el).fontFamily)
    expect(family).toMatch(/Noto Sans JP/)
  } finally {
    await cleanup()
  }
})

test('a Chinese document marks its keep-mode container lang="zh"', async () => {
  const { page, cleanup } = await launchApp([fixture('chinese.md')])
  try {
    await page.locator('.tab', { hasText: 'chinese.md' }).click()
    const doc = page.locator('.km-doc[lang="zh"]')
    await expect(doc).toBeVisible()
    const family = await doc.evaluate((el) => getComputedStyle(el).fontFamily)
    expect(family).toMatch(/PingFang SC|Microsoft YaHei|Noto Sans SC/)
  } finally {
    await cleanup()
  }
})

test('a Latin-only document keeps the English writing font (no lang attr)', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    expect(await page.locator('.km-doc').getAttribute('lang')).toBeNull()
  } finally {
    await cleanup()
  }
})
