// Live Mermaid rendering for ```mermaid code blocks — via Crepe's built-in
// code-block "preview" mechanism, the same one LaTeX uses. The diagram is the
// block's preview, shown by default with the source hidden; the code block's own
// toolbar gets a Hide/Edit toggle (next to Copy). No custom widget decoration.
//
// Mermaid is loaded lazily (dynamic import) only when a diagram is present.
// Rendered SVGs are cached by theme::code so re-renders are instant and the two
// themes don't clobber each other.

const cache = new Map()
const pending = new Set()
const retried = new Set() // keys whose first render errored and get a one-shot retry
let mermaidMod = null

async function getMermaid() {
  if (mermaidMod) return mermaidMod
  const m = await import('mermaid')
  mermaidMod = m.default || m
  return mermaidMod
}

const curTheme = () => (document.body.classList.contains('dark') ? 'dark' : 'default')
const keyFor = (theme, code) => theme + '::' + code

// Render `code` to an SVG (async, cached), then call `onDone`. The FIRST render
// right after the lazy import can race with Mermaid's init and fail — so on error
// we retry once before caching the error.
async function ensureRender(theme, code, onDone) {
  const k = keyFor(theme, code)
  if (cache.has(k)) {
    onDone?.()
    return
  }
  if (pending.has(k)) return // another render in flight; it'll call onDone via its own finally
  pending.add(k)
  const id = 'hm-mermaid-' + Math.random().toString(36).slice(2, 9)
  let result = null
  try {
    const mermaid = await getMermaid()
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme })
    const { svg } = await mermaid.render(id, code)
    result = { svg }
    retried.delete(k)
  } catch (e) {
    if (!retried.has(k)) {
      retried.add(k)
      pending.delete(k)
      document.getElementById(id)?.remove()
      document.getElementById('d' + id)?.remove()
      setTimeout(() => ensureRender(theme, code, onDone), 300)
      return
    }
    result = { error: (e && e.message) || String(e) }
    retried.delete(k)
  } finally {
    if (result) cache.set(k, result)
    pending.delete(k)
    document.getElementById(id)?.remove()
    document.getElementById('d' + id)?.remove()
    onDone?.()
  }
}

// The HTML string to show as the block's preview for a given mermaid source.
// Kicks off (or reuses) a render; `onUpdate` fires when an async render lands.
function previewHtml(code, t, onUpdate) {
  const trimmed = (code || '').trim()
  if (!trimmed) return ''
  const theme = curTheme()
  const c = cache.get(keyFor(theme, trimmed))
  if (c && c.svg) return c.svg
  if (c && c.error) return `<div class="hm-mermaid-error">${t('mermaid.error')} ${escapeHtml(c.error)}</div>`
  ensureRender(theme, trimmed, onUpdate)
  return `<div class="hm-mermaid-hint">${t('mermaid.rendering')}</div>`
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

// Build the `renderPreview(language, text, setPreview)` for codeBlockConfig.
// Returns null for non-mermaid blocks (no preview, no toggle → normal code
// block). For mermaid, returns the diagram HTML synchronously when cached, or
// kicks the async render and updates via setPreview when it lands.
export function createMermaidPreviewRenderer(getT) {
  const t = (k) => (getT ? getT(k) : k)
  return (language, text, setPreview) => {
    const lang = String(language || '').toLowerCase()
    if (lang !== 'mermaid') return null
    const html = previewHtml(text, t, () => setPreview(previewHtml(text, t, () => {})))
    return html // a string return sets the preview immediately (sync path)
  }
}
