// Repeatable residency/resume benchmark for the built Electron app.
// It visits 12 medium Keep documents, minimizes the window briefly, measures
// two-frame recovery, then reopens a hibernated reader and verifies its position.
import { _electron as electron } from '@playwright/test'
import { performance } from 'node:perf_hooks'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const checkBudgets = !process.argv.includes('--no-check')
const runsArg = process.argv.find((arg) => arg.startsWith('--runs='))
const runs = Math.max(1, Math.floor(Number(runsArg?.split('=')[1]) || 1))
const DOC_COUNT = 12
const SECTION_COUNT = 120
const MINIMIZE_MS = 5_000

function electronEnv() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  return env
}

async function processSnapshot(app) {
  return app.evaluate(({ app }) => app.getAppMetrics().map((metric) => ({
    type: metric.type,
    workingSetMB: +(metric.memory.workingSetSize / 1024).toFixed(1),
    privateMB: +(metric.memory.privateBytes / 1024).toFixed(1)
  })))
}

async function rendererSnapshot(page) {
  return page.evaluate(() => ({
    editors: document.querySelectorAll('.km-doc, .ProseMirror').length,
    keepEditors: document.querySelectorAll('.km-doc').length,
    nodes: document.getElementsByTagName('*').length,
    heapUsedMB: performance.memory
      ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)
      : null
  }))
}

async function activate(page, name) {
  await page.locator('.tab', { hasText: name }).click()
  await page.waitForFunction(
    (target) => document.querySelector('.tab.active')?.textContent?.includes(target),
    name,
    { timeout: 15_000 }
  )
  await page.locator('.editor-scroll.km-scroll:visible .km-doc').waitFor({ timeout: 15_000 })
}

async function measureRun(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hm-resume-perf-'))
  const profile = path.join(root, 'profile')
  await fs.mkdir(profile, { recursive: true })
  const files = []
  for (let index = 0; index < DOC_COUNT; index += 1) {
    const name = `residency-${String(index + 1).padStart(2, '0')}.md`
    const file = path.join(root, name)
    const parts = [`# ${name}`]
    for (let section = 0; section < SECTION_COUNT; section += 1) {
      parts.push(
        `\n## Section ${section + 1}\n\n` +
        `Paragraph ${section + 1} with **bold**, [link](https://example.com), ` +
        'and repeated text for layout.\n\n- first item\n- second item\n- third item'
      )
    }
    await fs.writeFile(file, parts.join('\n'), 'utf8')
    files.push(file)
  }

  const app = await electron.launch({
    args: [
      path.resolve('out/main/index.js'),
      `--user-data-dir=${profile}`,
      '--lang=zh-CN',
      ...files
    ],
    env: electronEnv()
  })
  const page = await app.firstWindow()
  try {
    await page.waitForSelector('#root .app', { timeout: 15_000 })
    await page.waitForFunction(
      (count) => document.querySelectorAll('.tab').length >= count,
      DOC_COUNT,
      { timeout: 30_000 }
    )
    await page.waitForTimeout(500)

    await activate(page, path.basename(files[0]))
    const firstPane = page.locator('.editor-scroll.km-scroll:visible')
    await firstPane.evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight * 0.68
      pane.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await page.waitForTimeout(100)
    for (const file of files.slice(1)) await activate(page, path.basename(file))
    await page.waitForTimeout(300)

    const beforeMinimize = {
      renderer: await rendererSnapshot(page),
      processes: await processSnapshot(app)
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize())
    await page.waitForTimeout(MINIMIZE_MS)
    const minimized = { processes: await processSnapshot(app) }

    const resumeStarted = performance.now()
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.restore()
      win?.focus()
    })
    await page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    ))
    const twoRafMs = +(performance.now() - resumeStarted).toFixed(1)
    const restored = { processes: await processSnapshot(app) }

    const reopenStarted = performance.now()
    await activate(page, path.basename(files[0]))
    const reopenMs = +(performance.now() - reopenStarted).toFixed(1)
    await page.waitForTimeout(50)
    const restoredScrollRatio = await firstPane.evaluate((pane) =>
      +(pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight)).toFixed(3)
    )
    const electronVersion = await app.evaluate(() => process.versions.electron)

    return {
      run,
      environment: {
        platform: `${process.platform} ${os.release()}`,
        electron: electronVersion,
        node: process.version
      },
      fixture: { documents: DOC_COUNT, sectionsPerDocument: SECTION_COUNT },
      beforeMinimize,
      minimized,
      resume: { twoRafMs },
      restored,
      hibernatedReader: { reopenMs, restoredScrollRatio }
    }
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 400))
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200
    }).catch(() => {})
  }
}

const samples = []
for (let run = 1; run <= runs; run += 1) {
  const sample = await measureRun(run)
  samples.push(sample)
  console.log(`sample ${run}/${runs}: ${JSON.stringify(sample)}`)
}

const checks = samples.flatMap((sample) => [
  {
    run: sample.run,
    name: 'resident Keep editors',
    actual: sample.beforeMinimize.renderer.keepEditors,
    limit: 4,
    pass: sample.beforeMinimize.renderer.keepEditors <= 4
  },
  {
    run: sample.run,
    name: 'DOM nodes',
    actual: sample.beforeMinimize.renderer.nodes,
    limit: 20_000,
    pass: sample.beforeMinimize.renderer.nodes <= 20_000
  },
  {
    run: sample.run,
    name: 'resume two rAF',
    actual: sample.resume.twoRafMs,
    limit: 300,
    pass: sample.resume.twoRafMs <= 300
  },
  {
    run: sample.run,
    name: 'hibernated reader reopen',
    actual: sample.hibernatedReader.reopenMs,
    limit: 800,
    pass: sample.hibernatedReader.reopenMs <= 800
  },
  {
    run: sample.run,
    name: 'restored scroll ratio',
    actual: sample.hibernatedReader.restoredScrollRatio,
    limit: 0.4,
    comparison: 'minimum',
    pass: sample.hibernatedReader.restoredScrollRatio >= 0.4
  }
])
console.log(`report: ${JSON.stringify({ benchmarkVersion: 1, samples, checks })}`)

if (checkBudgets && checks.some((check) => !check.pass)) process.exitCode = 1
