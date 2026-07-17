import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { launchApp } from './helpers.js'

test('internal link hover explains the target and Alt+click opens it in the right pane', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-internal-link-'))
  const sourcePath = join(dir, 'source.md')
  const targetPath = join(dir, 'target.md')
  writeFileSync(sourcePath, '# Source\n\n[Open target](target.md#destination)\n', 'utf8')
  writeFileSync(
    targetPath,
    ['# Top', '', ...Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1}`), '', '## Destination', '', 'Reached'].join('\n'),
    'utf8'
  )

  const { page, cleanup } = await launchApp([sourcePath])
  try {
    await page.locator('.tab', { hasText: 'source.md' }).click()
    const link = page.locator('.km-doc:visible a', { hasText: 'Open target' })
    await expect(link).toBeVisible()
    await link.hover()
    await expect(link).toHaveAttribute('title', /target\.md › #destination/)
    await expect(link).toHaveAttribute('title', /Alt\/Option/)

    await link.click({ modifiers: ['Alt'] })
    await expect(page.locator('.tab', { hasText: 'target.md' })).toBeVisible()
    const right = page.locator('.editor-scroll.km-scroll.hm-pane-right:visible')
    await expect(right).toBeVisible()
    await expect(right.getByRole('heading', { name: 'Destination' })).toBeVisible()
    await expect.poll(() => right.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})
