import { chromium } from '@playwright/test'

const requestedChannel = process.env.EASYMARKDOWN_WEB_LITE_BROWSER || 'msedge'
const browser = await chromium.launch({ channel: requestedChannel, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []

page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})

try {
  await page.goto(new URL('../dist-web-lite/index.html', import.meta.url).href)
  await page.waitForSelector('.lite-welcome')

  const welcomeWide = await page.evaluate(() => {
    const heading = document.querySelector('.lite-welcome-copy h1')
    const actions = [...document.querySelectorAll('.lite-welcome-actions > button')].slice(0, 2)
    const [primary, secondary] = actions.map((button) => button.getBoundingClientRect())
    const headingStyle = getComputedStyle(heading)
    return {
      headingLines: Math.round(
        heading.getBoundingClientRect().height / parseFloat(headingStyle.lineHeight)
      ),
      headingOverflow: heading.scrollWidth - heading.parentElement.clientWidth,
      actionWidthDifference: Math.abs(primary.width - secondary.width),
      actionHeightDifference: Math.abs(primary.height - secondary.height)
    }
  })

  const narrowPage = await browser.newPage({ viewport: { width: 650, height: 780 } })
  await narrowPage.goto(new URL('../dist-web-lite/index.html', import.meta.url).href)
  await narrowPage.waitForSelector('.lite-welcome')
  const welcomeNarrow = await narrowPage.evaluate(() => {
    const actions = [...document.querySelectorAll('.lite-welcome-actions > button')].slice(0, 2)
    const [primary, secondary] = actions.map((button) => button.getBoundingClientRect())
    const editor = document.querySelector('.lite-editor-stack').getBoundingClientRect()
    return {
      actionWidthDifference: Math.abs(primary.width - secondary.width),
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      actionsContained: primary.left >= editor.left && primary.right <= editor.right,
      sidebarClosed: document.querySelector('.lite-app').classList.contains('sidebar-closed')
    }
  })
  await narrowPage.close()

  const fileSystemApi = await page.evaluate(() => ({
    secureContext: window.isSecureContext,
    openFile: typeof window.showOpenFilePicker,
    openFolder: typeof window.showDirectoryPicker
  }))

  await page.locator('.lite-typography-trigger').click()
  await page.waitForSelector('.lite-typography-panel')
  await page
    .locator('.lite-typography-panel .hm-adjust-group')
    .first()
    .locator('.hm-seg-item')
    .nth(2)
    .click()
  await page.locator('#lite-font-en').selectOption('Georgia')
  await page.waitForFunction(
    () =>
      document.documentElement.style.getPropertyValue('--editor-font-size') === '18px' &&
      document.documentElement.style.getPropertyValue('--font-write-en').includes('Georgia')
  )
  await page.locator('.lite-typography-panel .lite-panel-actions .lite-icon-btn').click()

  await page.evaluate(() => {
    const sections = Array.from({ length: 36 }, (_, index) => [
      `## Section ${index + 1}`,
      '',
      `Scroll synchronization paragraph ${index + 1}.`,
      ''
    ]).flat()
    const markdown = [
      '# EasyMarkdown Lite',
      '',
      '\u672c\u5730\u9759\u6001\u7248\u6b63\u5728\u590d\u7528\u6700\u65b0\u7684 **Keep \u6a21\u5f0f**\u3002',
      '',
      '## \u8868\u683c\u7f16\u8f91',
      '',
      '| \u529f\u80fd | \u72b6\u6001 |',
      '| --- | --- |',
      '| \u96f6\u5dee\u5f02\u4fdd\u5b58 | \u2705 |',
      '| Mermaid | \u2705 |',
      '',
      ...sections
    ].join('\n')
    const transfer = new DataTransfer()
    transfer.items.add(new File([markdown], 'web-lite-runtime.md', { type: 'text/markdown' }))
    document
      .querySelector('.lite-app')
      .dispatchEvent(
        new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
      )
  })

  await page.waitForSelector('.km-heading')
  await page.waitForFunction(
    () =>
      document.querySelector('.lite-status-path')?.textContent === 'web-lite-runtime.md' &&
      document.querySelector('.lite-status-state.saved')
  )
  await page.locator('.lite-source-toggle').click()
  await page.waitForSelector('.lite-source-toggle.active[aria-pressed="true"]')
  const previewScroller = page.locator('.lite-editor-scroll')
  await previewScroller.hover()
  await page.mouse.wheel(0, 620)
  await page.waitForFunction(
    () => (document.querySelector('.lite-editor-scroll')?.scrollTop || 0) > 0
  )
  const previewWheelScroll = await previewScroller.evaluate((element) => element.scrollTop)
  await page.mouse.move(10, 10)
  const scrollingScrollbar = await previewScroller.evaluate((element) => ({
    active: element.classList.contains('hm-scroll-active'),
    background: getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor
  }))
  await page.waitForFunction(
    () => !document.querySelector('.lite-editor-scroll')?.classList.contains('hm-scroll-active'),
    { timeout: 2_000 }
  )
  const idleScrollbarBackground = await previewScroller.evaluate(
    (element) => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor
  )
  const source = page.locator('.lite-source-panel textarea')
  await source.waitFor()
  await previewScroller.evaluate((element) => {
    element.scrollTop = 0
  })
  await source.evaluate((element) => {
    element.scrollTop = Math.max(1, (element.scrollHeight - element.clientHeight) * 0.72)
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForFunction(
    () => (document.querySelector('.lite-editor-scroll')?.scrollTop || 0) > 0
  )
  const previewSyncedScroll = await previewScroller.evaluate((element) => element.scrollTop)
  await page.locator('.lite-source-toggle').click()
  await page.waitForFunction(
    () =>
      !document.querySelector('.lite-source-panel') &&
      document.querySelector('.lite-source-toggle')?.getAttribute('aria-pressed') === 'false'
  )
  await page.locator('.lite-source-toggle').click()
  await page.waitForSelector('.lite-source-panel textarea')
  await source.fill(
    `${await source.inputValue()}\n\n## \u6e90\u7801\u8054\u52a8\u5df2\u9a8c\u8bc1\n`
  )
  await page.waitForSelector('.lite-status-state.modified')
  await source.press('Control+Enter')
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.km-heading')].some((node) =>
      node.textContent.includes('\u6e90\u7801\u8054\u52a8')
    )
  )
  await page.waitForSelector('.lite-status-state.modified')

  await page.locator('.km-filter-btn').first().click()
  await page.locator('.km-filter-pop button[data-select="none"]').click()
  await page.locator('.km-filter-pop .km-fp-list input').first().check()
  await page.locator('.km-filter-pop .ok').click()
  const filterText = await page.locator('.lite-status-filter').textContent()
  const filteredRows = await page.locator('.km-table tbody tr.km-filtered').count()
  await page.locator('.lite-status-filter').click()
  await page.waitForFunction(
    () =>
      !document.querySelector('.lite-status-filter') &&
      !document.querySelector('.km-table tbody tr.km-filtered')
  )

  const result = await page.evaluate(() => ({
    tabs: document.querySelectorAll('.lite-tab').length,
    headings: [...document.querySelectorAll('.km-heading')].map((node) => node.textContent.trim()),
    tableRows: document.querySelectorAll('.km-table tbody tr').length,
    sourceClosed: !document.querySelector('.lite-source-panel'),
    statusPath: document.querySelector('.lite-status-path')?.textContent,
    statusModified: !!document.querySelector('.lite-status-state.modified'),
    fontSize: document.documentElement.style.getPropertyValue('--editor-font-size'),
    fontFamily: document.documentElement.style.getPropertyValue('--font-write-en'),
    storedTypography: JSON.parse(
      localStorage.getItem('easymarkdown.web-lite.typography.v1') || '{}'
    )
  }))

  if (!fileSystemApi.secureContext) throw new Error('file:// did not provide a secure context')
  if (fileSystemApi.openFile !== 'function' || fileSystemApi.openFolder !== 'function') {
    throw new Error('File System Access API is unavailable')
  }
  if (
    welcomeWide.headingLines !== 1 ||
    welcomeWide.headingOverflow > 1 ||
    welcomeWide.actionWidthDifference > 1 ||
    welcomeWide.actionHeightDifference > 1 ||
    welcomeNarrow.actionWidthDifference > 1 ||
    welcomeNarrow.horizontalOverflow > 0 ||
    !welcomeNarrow.actionsContained ||
    !welcomeNarrow.sidebarClosed
  ) {
    throw new Error(`Unexpected welcome layout: ${JSON.stringify({ welcomeWide, welcomeNarrow })}`)
  }
  if (
    result.tabs !== 1 ||
    result.tableRows !== 2 ||
    !result.sourceClosed ||
    result.statusPath !== 'web-lite-runtime.md' ||
    !result.statusModified ||
    previewWheelScroll <= 0 ||
    !scrollingScrollbar.active ||
    scrollingScrollbar.background === 'rgba(0, 0, 0, 0)' ||
    idleScrollbarBackground !== 'rgba(0, 0, 0, 0)' ||
    previewSyncedScroll <= 0 ||
    !filterText?.includes('1/2') ||
    filteredRows !== 1 ||
    result.fontSize !== '18px' ||
    !result.fontFamily.includes('Georgia') ||
    result.storedTypography.fontSize !== 18 ||
    result.storedTypography.fontWriteEn !== 'Georgia'
  ) {
    throw new Error(
      `Unexpected runtime state: ${JSON.stringify({ ...result, filterText, filteredRows, previewWheelScroll, scrollingScrollbar, idleScrollbarBackground, previewSyncedScroll })}`
    )
  }

  await page.reload()
  await page.waitForSelector('.lite-welcome')
  const restored = await page.evaluate(() => ({
    fontSize: document.documentElement.style.getPropertyValue('--editor-font-size'),
    fontFamily: document.documentElement.style.getPropertyValue('--font-write-en')
  }))
  if (restored.fontSize !== '18px' || !restored.fontFamily.includes('Georgia')) {
    throw new Error(`Typography preferences were not restored: ${JSON.stringify(restored)}`)
  }
  if (errors.length) throw new Error(errors.join('\n'))

  console.log(`[web-lite-smoke] ${requestedChannel}: OK`)
} finally {
  await browser.close()
}
