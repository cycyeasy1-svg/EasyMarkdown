// Shared E2E harness: launch the built Electron app under Playwright with an
// isolated user-data dir, and tear it down cleanly.
import { _electron as electron, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

// The built main entry (matches package.json "main"). The renderer is loaded via
// loadFile(out/renderer/index.html) when ELECTRON_RENDERER_URL is absent — which
// is exactly the state we launch in below.
const MAIN = join(repoRoot, 'out', 'main', 'index.js')

export const fixture = (name) => join(__dirname, 'fixtures', name)

export async function selectStatusViewMode(page, targetMode) {
  const button = page.locator('.hm-view-mode-control .hm-view-mode-btn')
  await button.waitFor({ state: 'visible' })
  const keepMode = await page.locator('.hm-engine-mode').evaluate((element) =>
    element.classList.contains('is-keep')
  )
  const modes = keepMode ? ['rich', 'source', 'richSource'] : ['rich', 'source']
  if (!modes.includes(targetMode)) {
    throw new Error(`View mode "${targetMode}" is unavailable for the current editor engine`)
  }
  for (let attempt = 0; attempt < modes.length; attempt += 1) {
    const currentMode = await button.getAttribute('data-mode')
    if (currentMode === targetMode) return
    const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length]
    await button.click()
    await expect(button).toHaveAttribute('data-mode', nextMode)
  }
  throw new Error(`Unable to switch status-bar view mode to "${targetMode}"`)
}

// Launch the app with the given fixture files opened as tabs. Returns the
// ElectronApplication, its first window page, and a cleanup() that force-exits
// (bypassing the unsaved-changes close guard in main) and removes the temp dir.
export async function launchApp(fixtureFiles = [], options = {}) {
  if (!existsSync(MAIN)) {
    throw new Error(`Built main not found at ${MAIN} — run "npm run build" first (the test:e2e script does this).`)
  }
  // A fresh user-data dir per launch isolates session/localStorage AND sidesteps
  // the single-instance lock (it's keyed by user-data dir) so we never get
  // forwarded into a running dev instance.
  const userDataDir = options.userDataDir || mkdtempSync(join(tmpdir(), 'em-e2e-'))

  const env = { ...process.env }
  // Strip ELECTRON_RENDERER_URL so main takes the loadFile(out/...) branch.
  delete env.ELECTRON_RENDERER_URL
  // ELECTRON_RUN_AS_NODE makes the electron binary behave like plain Node (so
  // `import 'electron'` yields no app and the process exits) — some shells/CI
  // images set it. Clear it so we launch a real Electron app.
  delete env.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({
    // --lang pins Chromium's locale (→ navigator.language → DEFAULT_LANG) to
    // Chinese, which the specs' title selectors ("切换编辑模式" etc.) assume.
    // Without it the app follows the OS locale and the suite breaks on ja/en
    // machines. Flag args are ignored by main's extractArgs (leading "-").
    args: [MAIN, `--user-data-dir=${userDataDir}`, '--lang=zh-CN', ...fixtureFiles],
    env
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // The shell mounts into #root; wait for it before any assertion.
  await page.waitForSelector('#root .app', { timeout: 15_000 })

  const cleanup = async ({ preserveUserData = false } = {}) => {
    try {
      // Bypass the deferred-close guard (main waits for the renderer's
      // app:confirm-close, which never comes under automation) by force-exiting.
      await app.evaluate(({ app }) => app.exit(0))
    } catch {
      /* already gone */
    }
    if (!preserveUserData) {
      try {
        rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      } catch {
        /* best effort */
      }
    }
  }
  return { app, page, cleanup, userDataDir }
}
