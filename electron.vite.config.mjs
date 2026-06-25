import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Inject the package version into the renderer at build time so the UI can show
// it (matches app.getVersion(), which also reads package.json).
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.js') }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.js') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // Bind the dev server to IPv4 127.0.0.1 explicitly. On Windows, `localhost`
    // often resolves to IPv6 `::1`, so Vite binds ::1 only — but Electron's
    // Chromium maps `localhost` to IPv4 127.0.0.1, so the renderer can't reach
    // the dev server (ERR_CONNECTION_REFUSED → black window). Forcing 127.0.0.1
    // makes the bind address match what Electron dials. No effect on the packaged
    // app (it loads from file://), nor on macOS/Linux (127.0.0.1 always works).
    server: { host: '127.0.0.1' },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
})
