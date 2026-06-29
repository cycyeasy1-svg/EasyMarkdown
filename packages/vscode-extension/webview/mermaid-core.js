// Pure Mermaid render helpers — copied from the app's editor-mermaid.js
// (getMermaidSvg / peekMermaidSvg + the theme-keyed LRU cache), WITHOUT the
// ProseMirror plugin (createMermaidPlugin) which depends on @milkdown/* and is
// unused by keep mode. Kept local to the extension to avoid bundling Milkdown.
// Theme detection reads VSCode's body class instead of the app's `dark` class.
// If the app's render logic changes, re-sync this file.

const CACHE_MAX = 120
const cache = new Map()
const cacheGet = (k) => {
  const v = cache.get(k)
  if (v !== undefined) {
    cache.delete(k)
    cache.set(k, v)
  }
  return v
}
const cacheSet = (k, v) => {
  cache.set(k, v)
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
}
let seq = 0
let mermaidMod = null
const inflight = new Map()

async function getMermaid() {
  if (mermaidMod) return mermaidMod
  const m = await import('mermaid')
  mermaidMod = m.default || m
  return mermaidMod
}

// VSCode adds `vscode-dark` / `vscode-high-contrast` to <body> for dark themes.
const curTheme = () => {
  const c = document.body.classList
  return c.contains('vscode-dark') || c.contains('vscode-high-contrast') ? 'dark' : 'default'
}
const keyFor = (theme, code) => theme + '::' + code

export function peekMermaidSvg(code, theme = curTheme()) {
  return cacheGet(keyFor(theme, (code || '').trim())) || null
}

export async function getMermaidSvg(code, theme = curTheme()) {
  const trimmed = (code || '').trim()
  if (!trimmed) return { error: '' }
  const k = keyFor(theme, trimmed)
  const hit = cacheGet(k)
  if (hit) return hit
  if (inflight.has(k)) return inflight.get(k)
  const p = (async () => {
    const id = 'hm-mermaid-k' + ++seq
    try {
      const mermaid = await getMermaid()
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme })
      const { svg } = await mermaid.render(id, trimmed)
      const r = { svg }
      cacheSet(k, r)
      return r
    } catch (e) {
      const r = { error: (e && e.message) || String(e) }
      cacheSet(k, r)
      return r
    } finally {
      document.getElementById(id)?.remove()
      document.getElementById('d' + id)?.remove()
      inflight.delete(k)
    }
  })()
  inflight.set(k, p)
  return p
}
