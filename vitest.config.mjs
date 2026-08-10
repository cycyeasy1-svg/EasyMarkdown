import { defineConfig } from 'vitest/config'

// Unit tests for the project's pure logic (no Electron / no real DOM needed for
// most). Default env is `node`; a test that touches `localStorage`/`document`
// opts in per-file with a `// @vitest-environment happy-dom` comment at its top.
export default defineConfig({
  esbuild: {
    // Match Vite's React plugin runtime when a unit test imports a .jsx
    // component directly (e.g. the top-level Error Boundary).
    jsx: 'automatic'
  },
  define: {
    // Renderer modules are built with this Vite `define` (electron.vite.config.mjs).
    // Mirror it here so any module that references __APP_VERSION__ resolves under
    // vitest instead of throwing "__APP_VERSION__ is not defined".
    __APP_VERSION__: JSON.stringify('test')
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,mjs}'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: [
        'src/main/*.js',
        'src/shared/*.js',
        'src/renderer/src/*.js',
        'src/renderer/src/components/*.js'
      ],
      exclude: [
        'src/main/index.js',
        'src/renderer/src/i18n-strings.js',
        'src/renderer/src/platform/**'
      ],
      // P2-4 baseline (2026-08-09). Raising these values is encouraged; lowering
      // them requires an explicit dossier/roadmap decision and review evidence.
      thresholds: {
        statements: 73,
        branches: 76,
        functions: 74,
        lines: 73
      }
    }
  }
})
