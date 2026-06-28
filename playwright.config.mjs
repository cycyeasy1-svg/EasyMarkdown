import { defineConfig } from '@playwright/test'

// E2E config for the Electron app. We don't use Playwright's browser projects —
// each test drives the real Electron app via `_electron.launch()` (see
// test/e2e/helpers.js). The app is launched from the built `out/` bundle, so run
// `npm run build` first (the `test:e2e` npm script does this for you).
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.js',
  // Electron launch + first paint is slow; give each test room.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Each test launches its own Electron process with an isolated user-data dir,
  // so they *can* run in parallel — but keep it modest to avoid thrashing a dev
  // machine. Bump later if needed.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'list' : [['list']]
})
