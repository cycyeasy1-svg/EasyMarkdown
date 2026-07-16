// Production Electron performance benchmark for the APP's expensive paths:
// progressive opening of a large single-table keep document, its core table
// interactions, and source-mode find while scrolling.
//
// Default: build via `npm run perf:app`, run three isolated samples, and fail if
// a timing budget or deterministic no-op guard regresses. Use --no-check to only
// collect measurements, --runs=N to override repetitions, and
// EASYMARKDOWN_PERF_SCALE=1.5 on a deliberately slower benchmark machine. A
// short CPU calibration also normalizes timing budgets when the host is busy;
// deterministic DOM-operation guards are never scaled.
import { _electron as electron } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const mainEntry = join(repoRoot, 'out', 'main', 'index.js')
const baselinePath = join(here, 'perf-app-baseline.json')
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const noCheck = process.argv.includes('--no-check')
const runsArg = process.argv.find((arg) => arg.startsWith('--runs='))
const runs = runsArg ? Number(runsArg.slice('--runs='.length)) : baseline.runs
const budgetScale = Number(process.env.EASYMARKDOWN_PERF_SCALE || 1)

if (process.argv.includes('--help')) {
  process.stdout.write([
    'EasyMarkdown APP performance benchmark',
    '',
    '  npm run perf:app                         build, measure, and enforce budgets',
    '  npm run perf:app:measure -- --runs=1     measure without failing budgets',
    '  EASYMARKDOWN_PERF_SCALE=1.5 npm run perf:app',
    '',
    'Timing budgets are CPU-normalized. Exact DOM-operation guards are not scaled.',
    'Budgets and the recorded reference live in scripts/perf-app-baseline.json.'
  ].join('\n') + '\n')
  process.exit(0)
}
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error(`Invalid --runs value: ${runs}`)
if (!Number.isFinite(budgetScale) || budgetScale <= 0) {
  throw new Error(`Invalid EASYMARKDOWN_PERF_SCALE value: ${budgetScale}`)
}
if (!existsSync(mainEntry)) throw new Error(`Built APP not found: ${mainEntry}`)

const round = (value, digits = 1) => Number(Number(value || 0).toFixed(digits))
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const metricMap = async (cdp) => {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]))
}
const metricDeltaMs = (before, after, key) => round((after[key] - before[key]) * 1000)

async function measureCpuCalibration(page) {
  const samples = await page.evaluate(() => {
    const durations = []
    let sink = 0
    for (let run = 0; run < 4; run++) {
      const start = performance.now()
      for (let i = 0; i < 20_000_000; i++) sink = (Math.imul(sink ^ i, 1664525) + 1013904223) | 0
      durations.push(performance.now() - start)
    }
    window.__hmPerfCalibrationSink = sink
    return durations.slice(1)
  })
  return round(median(samples))
}

function createFixtures(root) {
  const smallPath = join(root, 'performance-small.md')
  const tablePath = join(root, 'performance-table.md')
  const { rows, columns } = baseline.fixture
  writeFileSync(smallPath, '# Performance calibration\n\nReady.\n', 'utf8')
  const header = `| ${Array.from({ length: columns }, (_, ci) => `column-${ci}`).join(' | ')} |`
  const separator = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`
  const body = Array.from(
    { length: rows },
    (_, ri) => `| ${Array.from({ length: columns }, (_, ci) => `row-${ri}-column-${ci}`).join(' | ')} |`
  )
  writeFileSync(tablePath, `${header}\n${separator}\n${body.join('\n')}\n`, 'utf8')
  return { smallPath, tablePath }
}

async function installTableInstrumentation(page) {
  await page.evaluate(() => {
    const originalToggle = DOMTokenList.prototype.toggle
    const originalGetComputedStyle = window.getComputedStyle
    const originalInsertAdjacentHTML = Element.prototype.insertAdjacentHTML
    const state = {
      columnClassToggles: 0,
      keepHostStyleReads: 0,
      progressiveRowBatches: 0,
      largestProgressiveRowBatch: 0,
      longTasks: [],
      observer: null,
      restore() {
        DOMTokenList.prototype.toggle = originalToggle
        window.getComputedStyle = originalGetComputedStyle
        Element.prototype.insertAdjacentHTML = originalInsertAdjacentHTML
        this.observer?.disconnect()
      }
    }
    DOMTokenList.prototype.toggle = function (token, ...args) {
      if (token === 'km-col-hidden') state.columnClassToggles++
      return originalToggle.call(this, token, ...args)
    }
    window.getComputedStyle = function (element, ...args) {
      if (element?.classList?.contains('km-doc')) state.keepHostStyleReads++
      return originalGetComputedStyle.call(window, element, ...args)
    }
    Element.prototype.insertAdjacentHTML = function (position, html) {
      if (position === 'beforeend' && this.matches?.('tbody[data-km-total-rows]')) {
        const rows = String(html).match(/<tr\b/g)?.length || 0
        state.progressiveRowBatches++
        state.largestProgressiveRowBatch = Math.max(state.largestProgressiveRowBatch, rows)
      }
      return originalInsertAdjacentHTML.call(this, position, html)
    }
    try {
      state.observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => state.longTasks.push(entry.duration))
      })
      state.observer.observe({ type: 'longtask', buffered: true })
    } catch {
      // PerformanceObserver longtask is optional; CDP metrics remain available.
    }
    window.__hmPerfTable = state
  })
}

async function collectTableInstrumentation(page) {
  return page.evaluate(() => {
    const state = window.__hmPerfTable
    const result = {
      initialColumnClassToggles: state?.columnClassToggles || 0,
      tableOnlyHostStyleReads: state?.keepHostStyleReads || 0,
      progressiveRowBatches: state?.progressiveRowBatches || 0,
      largestProgressiveRowBatch: state?.largestProgressiveRowBatch || 0,
      maxLongTaskMs: Math.max(0, ...(state?.longTasks || [])),
      totalBlockingTimeMs: (state?.longTasks || []).reduce((sum, duration) => sum + Math.max(0, duration - 50), 0)
    }
    state?.restore()
    delete window.__hmPerfTable
    return result
  })
}

async function measureAction(page, cdp, action) {
  await page.evaluate(() => {
    const state = { longTasks: [], observer: null }
    try {
      state.observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => state.longTasks.push(entry.duration))
      })
      state.observer.observe({ type: 'longtask' })
    } catch {
      // CDP task metrics remain available when longtask observation is absent.
    }
    window.__hmPerfAction = state
  })
  const before = await metricMap(cdp)
  const started = performance.now()
  await action()
  await page.waitForTimeout(60)
  const wallMs = performance.now() - started
  const after = await metricMap(cdp)
  const longTasks = await page.evaluate(() => {
    const state = window.__hmPerfAction
    state?.observer?.takeRecords().forEach((entry) => state.longTasks.push(entry.duration))
    state?.observer?.disconnect()
    delete window.__hmPerfAction
    return state?.longTasks || []
  })
  return {
    wallMs: round(wallMs),
    taskMs: metricDeltaMs(before, after, 'TaskDuration'),
    layoutMs: metricDeltaMs(before, after, 'LayoutDuration'),
    styleMs: metricDeltaMs(before, after, 'RecalcStyleDuration'),
    maxLongTaskMs: round(Math.max(0, ...longTasks)),
    totalBlockingTimeMs: round(longTasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0))
  }
}

async function installMirrorInstrumentation(page) {
  await page.evaluate(() => {
    const originalAppendChild = Node.prototype.appendChild
    const state = {
      measurements: 0,
      restore() {
        Node.prototype.appendChild = originalAppendChild
      }
    }
    Node.prototype.appendChild = function (node) {
      if (this === document.body && node?.tagName === 'DIV' && node.style?.visibility === 'hidden') {
        state.measurements++
      }
      return originalAppendChild.call(this, node)
    }
    window.__hmPerfMirror = state
  })
}

async function scrollSource(page, cdp) {
  const before = await metricMap(cdp)
  const wallMs = await page.evaluate(async ({ steps, delayMs }) => {
    const textarea = document.querySelector('textarea.source-editor')
    const max = Math.max(0, textarea.scrollHeight - textarea.clientHeight)
    const points = [0.08, 0.24, 0.4, 0.56, 0.72, 0.88, 0.32, 0.68].slice(0, steps)
    const start = performance.now()
    for (const point of points) {
      textarea.scrollTop = max * point
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    return performance.now() - start
  }, { steps: baseline.fixture.scrollSteps, delayMs: baseline.fixture.scrollDelayMs })
  const after = await metricMap(cdp)
  return {
    wallMs: round(wallMs),
    taskMs: metricDeltaMs(before, after, 'TaskDuration'),
    layoutMs: metricDeltaMs(before, after, 'LayoutDuration'),
    styleMs: metricDeltaMs(before, after, 'RecalcStyleDuration')
  }
}

async function runSample(sampleNumber, fixtures) {
  const userDataDir = mkdtempSync(join(tmpdir(), `easymarkdown-perf-${sampleNumber}-`))
  const env = { ...process.env }
  delete env.ELECTRON_RENDERER_URL
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    args: [mainEntry, `--user-data-dir=${userDataDir}`, '--lang=zh-CN', fixtures.smallPath],
    env
  })

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#root .app', { timeout: 20_000 })
    await page.locator('.tab', { hasText: basename(fixtures.smallPath) }).click()
    await page.locator('.km-doc', { hasText: 'Performance calibration' }).waitFor({ state: 'visible' })
    await page.waitForTimeout(100)
    const cpuCalibrationBeforeMs = await measureCpuCalibration(page)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await installTableInstrumentation(page)
    const beforeTable = await metricMap(cdp)
    const tableStart = performance.now()
    await app.evaluate(({ BrowserWindow }, tablePath) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('open-paths', [tablePath])
    }, fixtures.tablePath)
    await page.locator('.tab', { hasText: basename(fixtures.tablePath) }).waitFor({ state: 'visible' })
    const tableBody = page.locator('.km-table tbody').first()
    await tableBody.locator('tr').first().waitFor({ state: 'attached', timeout: 30_000 })
    const tableFirstRowsMs = performance.now() - tableStart
    const initialRenderedRows = await tableBody.evaluate((tbody) =>
      Number(tbody.dataset.kmInitialRows || tbody.querySelectorAll('tr').length)
    )
    await page.locator('.km-table tbody tr').nth(baseline.fixture.rows - 1).waitFor({ state: 'attached', timeout: 30_000 })
    await page.locator('.km-table-frame').waitFor({ state: 'attached' })
    await page.waitForTimeout(100)
    const tableOpenMs = performance.now() - tableStart
    const afterTable = await metricMap(cdp)
    const tableInstrumentation = await collectTableInstrumentation(page)
    const tableCells = await page.locator('table.km-table[data-ti]').evaluate((table) => table.querySelectorAll('th, td').length)
    // Measure again after the expensive phase. Taking the slower value catches
    // host contention that starts after launch without polluting long-task data.
    const cpuCalibrationAfterMs = await measureCpuCalibration(page)

    const findLastRow = await measureAction(page, cdp, async () => {
      await page.keyboard.press(platform() === 'darwin' ? 'Meta+F' : 'Control+F')
      await page.locator('.findbar input').fill(`row-${baseline.fixture.rows - 1}-column-${baseline.fixture.columns - 1}`)
      await page.waitForFunction(() => document.querySelector('.findbar-count')?.textContent === '1/1')
    })
    await page.keyboard.press('Escape')
    await page.locator('.findbar').waitFor({ state: 'hidden' })

    const filterButton = page.locator('table.km-table .km-filter-btn[data-ci="0"]').first()
    const filterOpen = await measureAction(page, cdp, async () => {
      await filterButton.click()
      await page.locator('.km-filter-pop').waitFor({ state: 'visible' })
    })
    const filterApply = await measureAction(page, cdp, async () => {
      await page.locator('.km-filter-pop .km-fp-search').fill(`row-${baseline.fixture.rows - 1}-column-0`)
      await page.locator('.km-filter-pop .ok').click()
      await page.waitForFunction(
        (rows) => document.querySelectorAll('table.km-table tbody tr.km-filtered').length === rows - 1,
        baseline.fixture.rows
      )
    })
    await filterButton.click()
    await page.locator('.km-filter-pop').waitFor({ state: 'visible' })
    await page.locator('.km-filter-pop [data-all="1"]').click()
    await page.locator('.km-filter-pop .ok').click()
    await page.waitForFunction(() => document.querySelectorAll('table.km-table tbody tr.km-filtered').length === 0)

    const columnHide = await measureAction(page, cdp, async () => {
      await page.locator('table.km-table .km-col-hide-btn[data-ci="0"]').first().click()
      await page.waitForFunction(() => document.querySelector('table.km-table td[data-ci="0"]')?.classList.contains('km-col-hidden'))
    })
    const columnShow = await measureAction(page, cdp, async () => {
      await page.locator('.km-table-hidden-columns').first().click()
      await page.locator('.km-column-pop-item[data-ci="0"]').click()
      await page.waitForFunction(() => !document.querySelector('table.km-table td[data-ci="0"]')?.classList.contains('km-col-hidden'))
    })
    const resizeHandle = page.locator('table.km-table .km-col-resize[data-ci="0"]').first()
    const widthBefore = await page.locator('table.km-table col').first().evaluate((col) => col.style.width)
    const columnResize = await measureAction(page, cdp, async () => {
      await resizeHandle.focus()
      await page.keyboard.press('ArrowRight')
      await page.waitForFunction(
        (before) => document.querySelector('table.km-table col')?.style.width !== before,
        widthBefore
      )
    })

    await page.evaluate(() => { window.__hmPerfTableIdentity = document.querySelector('table.km-table') })
    const cellEditOpen = await measureAction(page, cdp, async () => {
      await page.locator('table.km-table tbody td[data-ci="0"]').first().dblclick()
      await page.locator('.km-cell-pop .km-cp-input').waitFor({ state: 'visible' })
    })
    const cellEditCancel = await measureAction(page, cdp, async () => {
      await page.keyboard.press('Escape')
      await page.locator('.km-cell-pop').waitFor({ state: 'hidden' })
    })
    const cellCancelPreservedTable = await page.evaluate(() => {
      const preserved = window.__hmPerfTableIdentity === document.querySelector('table.km-table')
      delete window.__hmPerfTableIdentity
      return preserved
    })

    await page.locator('.status-btn[title*="Ctrl+/"]').click()
    const source = page.locator('textarea.source-editor')
    await source.waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(150)
    const noFind = await scrollSource(page, cdp)

    const query = await source.evaluate((textarea) => {
      const lines = textarea.value.split('\n')
      for (let i = lines.length - 1; i >= 0; i--) {
        const text = lines[i].trim()
        if (text.length >= 48) return text.slice(0, 96)
      }
      return textarea.value.slice(-64)
    })
    await installMirrorInstrumentation(page)
    await page.keyboard.press(platform() === 'darwin' ? 'Meta+F' : 'Control+F')
    await page.locator('.findbar input').fill(query)
    await page.waitForFunction(() => document.querySelector('.findbar-count')?.textContent === '1/1')
    await page.waitForTimeout(250)
    const mirrorsBeforeScroll = await page.evaluate(() => window.__hmPerfMirror.measurements)
    const withFind = await scrollSource(page, cdp)
    const mirrorsAfterScroll = await page.evaluate(() => {
      const state = window.__hmPerfMirror
      const count = state.measurements
      state.restore()
      delete window.__hmPerfMirror
      return count
    })

    return {
      cpuCalibrationMs: Math.max(cpuCalibrationBeforeMs, cpuCalibrationAfterMs),
      table: {
        firstRowsMs: round(tableFirstRowsMs),
        openMs: round(tableOpenMs),
        taskMs: metricDeltaMs(beforeTable, afterTable, 'TaskDuration'),
        layoutMs: metricDeltaMs(beforeTable, afterTable, 'LayoutDuration'),
        styleMs: metricDeltaMs(beforeTable, afterTable, 'RecalcStyleDuration'),
        cells: tableCells,
        maxLongTaskMs: round(tableInstrumentation.maxLongTaskMs),
        totalBlockingTimeMs: round(tableInstrumentation.totalBlockingTimeMs),
        initialColumnClassToggles: tableInstrumentation.initialColumnClassToggles,
        tableOnlyHostStyleReads: tableInstrumentation.tableOnlyHostStyleReads,
        initialRenderedRows,
        progressiveRowBatches: tableInstrumentation.progressiveRowBatches,
        largestProgressiveRowBatch: tableInstrumentation.largestProgressiveRowBatch
      },
      interactions: {
        findLastRow,
        filterOpen,
        filterApply,
        columnHide,
        columnShow,
        columnResize,
        cellEditOpen,
        cellEditCancel,
        cellCancelPreservedTable
      },
      sourceFind: {
        noFind,
        withFind,
        scrollOverheadMs: round(withFind.wallMs - noFind.wallMs),
        mirrorRemeasuresOnScroll: mirrorsAfterScroll - mirrorsBeforeScroll
      }
    }
  } finally {
    try { await app.evaluate(({ app }) => app.exit(0)) } catch {}
    try { await app.close() } catch {}
    try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch {}
  }
}

function summarize(samples) {
  const value = (getter) => median(samples.map(getter))
  const action = (name) => ({
    wallMs: round(value((sample) => sample.interactions[name].wallMs)),
    taskMs: round(value((sample) => sample.interactions[name].taskMs)),
    layoutMs: round(value((sample) => sample.interactions[name].layoutMs)),
    styleMs: round(value((sample) => sample.interactions[name].styleMs)),
    maxLongTaskMs: round(value((sample) => sample.interactions[name].maxLongTaskMs)),
    totalBlockingTimeMs: round(value((sample) => sample.interactions[name].totalBlockingTimeMs))
  })
  return {
    cpuCalibrationMs: round(value((sample) => sample.cpuCalibrationMs)),
    table: {
      firstRowsMs: round(value((sample) => sample.table.firstRowsMs)),
      openMs: round(value((sample) => sample.table.openMs)),
      taskMs: round(value((sample) => sample.table.taskMs)),
      layoutMs: round(value((sample) => sample.table.layoutMs)),
      styleMs: round(value((sample) => sample.table.styleMs)),
      cells: value((sample) => sample.table.cells),
      maxLongTaskMs: round(value((sample) => sample.table.maxLongTaskMs)),
      totalBlockingTimeMs: round(value((sample) => sample.table.totalBlockingTimeMs)),
      initialColumnClassToggles: Math.max(...samples.map((sample) => sample.table.initialColumnClassToggles)),
      tableOnlyHostStyleReads: Math.max(...samples.map((sample) => sample.table.tableOnlyHostStyleReads)),
      initialRenderedRows: value((sample) => sample.table.initialRenderedRows),
      progressiveRowBatches: value((sample) => sample.table.progressiveRowBatches),
      largestProgressiveRowBatch: Math.max(...samples.map((sample) => sample.table.largestProgressiveRowBatch))
    },
    interactions: {
      findLastRow: action('findLastRow'),
      filterOpen: action('filterOpen'),
      filterApply: action('filterApply'),
      columnHide: action('columnHide'),
      columnShow: action('columnShow'),
      columnResize: action('columnResize'),
      cellEditOpen: action('cellEditOpen'),
      cellEditCancel: action('cellEditCancel'),
      cellCancelPreservedTable: samples.every((sample) => sample.interactions.cellCancelPreservedTable)
    },
    sourceFind: {
      noFindWallMs: round(value((sample) => sample.sourceFind.noFind.wallMs)),
      withFindWallMs: round(value((sample) => sample.sourceFind.withFind.wallMs)),
      scrollOverheadMs: round(value((sample) => sample.sourceFind.scrollOverheadMs)),
      taskOverheadMs: round(value((sample) => sample.sourceFind.withFind.taskMs - sample.sourceFind.noFind.taskMs)),
      mirrorRemeasuresOnScroll: Math.max(...samples.map((sample) => sample.sourceFind.mirrorRemeasuresOnScroll))
    }
  }
}

function checkLimits(summary) {
  const limits = baseline.limits
  const calibrationReference = baseline.reference.cpuCalibrationMs
  const contentionScale = calibrationReference > 0
    ? Math.max(1, summary.cpuCalibrationMs / calibrationReference)
    : 1
  const timingScale = round(Math.min(contentionScale, 3) * budgetScale, 3)
  const checks = [
    ['table.firstRowsMs', summary.table.firstRowsMs, limits.tableFirstRowsMs, true],
    ['table.openMs', summary.table.openMs, limits.tableOpenMs, true],
    ['table.taskMs', summary.table.taskMs, limits.tableTaskMs, true],
    ['table.layoutMs', summary.table.layoutMs, limits.tableLayoutMs, true],
    ['table.styleMs', summary.table.styleMs, limits.tableStyleMs, true],
    ['table.maxLongTaskMs', summary.table.maxLongTaskMs, limits.tableMaxLongTaskMs, true],
    ['table.totalBlockingTimeMs', summary.table.totalBlockingTimeMs, limits.tableTotalBlockingTimeMs, true],
    ['sourceFind.scrollOverheadMs', summary.sourceFind.scrollOverheadMs, limits.sourceFindScrollOverheadMs, true],
    ['sourceFind.taskOverheadMs', summary.sourceFind.taskOverheadMs, limits.sourceFindTaskOverheadMs, true],
    ['interactions.findLastRow.taskMs', summary.interactions.findLastRow.taskMs, limits.findLastRowTaskMs, true],
    ['interactions.filterOpen.taskMs', summary.interactions.filterOpen.taskMs, limits.filterOpenTaskMs, true],
    ['interactions.filterApply.taskMs', summary.interactions.filterApply.taskMs, limits.filterApplyTaskMs, true],
    ['interactions.columnHide.taskMs', summary.interactions.columnHide.taskMs, limits.columnHideTaskMs, true],
    ['interactions.columnShow.taskMs', summary.interactions.columnShow.taskMs, limits.columnShowTaskMs, true],
    ['interactions.columnResize.taskMs', summary.interactions.columnResize.taskMs, limits.columnResizeTaskMs, true],
    ['interactions.cellEditOpen.taskMs', summary.interactions.cellEditOpen.taskMs, limits.cellEditOpenTaskMs, true],
    ['interactions.cellEditCancel.taskMs', summary.interactions.cellEditCancel.taskMs, limits.cellEditCancelTaskMs, true],
    ['interactions.findLastRow.maxLongTaskMs', summary.interactions.findLastRow.maxLongTaskMs, limits.interactionMaxLongTaskMs, true],
    ['interactions.filterOpen.maxLongTaskMs', summary.interactions.filterOpen.maxLongTaskMs, limits.interactionMaxLongTaskMs, true],
    ['interactions.filterApply.maxLongTaskMs', summary.interactions.filterApply.maxLongTaskMs, limits.interactionMaxLongTaskMs, true],
    ['interactions.columnHide.maxLongTaskMs', summary.interactions.columnHide.maxLongTaskMs, limits.interactionMaxLongTaskMs, true],
    ['interactions.columnShow.maxLongTaskMs', summary.interactions.columnShow.maxLongTaskMs, limits.interactionMaxLongTaskMs, true],
    ['interactions.columnResize.maxLongTaskMs', summary.interactions.columnResize.maxLongTaskMs, limits.interactionMaxLongTaskMs, true],
    ['table.initialColumnClassToggles', summary.table.initialColumnClassToggles, limits.initialColumnClassToggles, false],
    ['table.tableOnlyHostStyleReads', summary.table.tableOnlyHostStyleReads, limits.tableOnlyHostStyleReads, false],
    ['sourceFind.mirrorRemeasuresOnScroll', summary.sourceFind.mirrorRemeasuresOnScroll, limits.sourceMirrorRemeasuresOnScroll, false],
    ['table.cells', summary.table.cells, limits.tableCells, false, 'equal'],
    ['table.initialRenderedRows', summary.table.initialRenderedRows, limits.initialRenderedRows, false, 'equal'],
    ['table.progressiveRowBatches', summary.table.progressiveRowBatches, limits.minimumProgressiveRowBatches, false, 'minimum'],
    ['table.largestProgressiveRowBatch', summary.table.largestProgressiveRowBatch, limits.largestProgressiveRowBatch, false],
    ['interactions.cellCancelPreservedTable', summary.interactions.cellCancelPreservedTable, limits.cellCancelPreservedTable, false, 'equal']
  ]
  return {
    contentionScale: round(contentionScale, 3),
    timingScale,
    checks: checks.map(([name, actual, limit, scalable, comparison = 'maximum']) => {
      const effectiveLimit = scalable ? round(limit * timingScale) : limit
      const pass = comparison === 'equal'
        ? actual === effectiveLimit
        : comparison === 'minimum'
          ? actual >= effectiveLimit
          : actual <= effectiveLimit
      return { name, actual, limit: effectiveLimit, comparison, pass }
    })
  }
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'easymarkdown-perf-fixtures-'))
try {
  const fixtures = createFixtures(fixtureRoot)
  const samples = []
  for (let index = 0; index < runs; index++) {
    const sample = await runSample(index + 1, fixtures)
    samples.push(sample)
    process.stdout.write(`sample ${index + 1}/${runs}: ${JSON.stringify(sample)}\n`)
  }
  const summary = summarize(samples)
  const { checks, contentionScale, timingScale } = checkLimits(summary)
  const report = {
    benchmarkVersion: baseline.version,
    environment: {
      platform: `${platform()} ${release()}`,
      cpu: cpus()[0]?.model || 'unknown',
      node: process.version,
      budgetScale,
      contentionScale,
      timingScale
    },
    fixture: baseline.fixture,
    reference: baseline.reference,
    samples,
    summary,
    checks
  }
  process.stdout.write(`summary: ${JSON.stringify(summary, null, 2)}\n`)
  if (!noCheck) {
    checks.forEach((check) => {
      const operator = check.comparison === 'equal' ? '===' : check.comparison === 'minimum' ? '>=' : '<='
      process.stdout.write(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.actual} ${operator} ${check.limit}\n`)
    })
    if (checks.some((check) => !check.pass)) process.exitCode = 1
  }
  process.stdout.write(`report: ${JSON.stringify(report)}\n`)
} finally {
  try { rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch {}
}
