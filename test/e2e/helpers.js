// Shared E2E harness: launch the built Electron app under Playwright with an
// isolated user-data dir, and tear it down cleanly.
import { _electron as electron } from '@playwright/test'
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

// Launch the app with the given fixture files opened as tabs. Returns the
// ElectronApplication, its first window page, and a cleanup() that force-exits
// (bypassing the unsaved-changes close guard in main) and removes the temp dir.
export async function launchApp(fixtureFiles = []) {
  if (!existsSync(MAIN)) {
    throw new Error(`Built main not found at ${MAIN} — run "npm run build" first (the test:e2e script does this).`)
  }
  // A fresh user-data dir per launch isolates session/localStorage AND sidesteps
  // the single-instance lock (it's keyed by user-data dir) so we never get
  // forwarded into a running dev instance.
  const userDataDir = mkdtempSync(join(tmpdir(), 'em-e2e-'))

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

  const cleanup = async () => {
    try {
      // Bypass the deferred-close guard (main waits for the renderer's
      // app:confirm-close, which never comes under automation) by force-exiting.
      await app.evaluate(({ app }) => app.exit(0))
    } catch {
      /* already gone */
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
  return { app, page, cleanup }
}
