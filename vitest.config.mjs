import { defineConfig } from 'vitest/config'

// Unit tests for the project's pure logic (no Electron / no real DOM needed for
// most). Default env is `node`; a test that touches `localStorage`/`document`
// opts in per-file with a `// @vitest-environment happy-dom` comment at its top.
export default defineConfig({
  define: {
    // Renderer modules are built with this Vite `define` (electron.vite.config.mjs).
    // Mirror it here so any module that references __APP_VERSION__ resolves under
    // vitest instead of throwing "__APP_VERSION__ is not defined".
    __APP_VERSION__: JSON.stringify('test')
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,mjs}'],
    globals: false
  }
})
