import { Component, useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../../../src/renderer/src/i18n.jsx'
import { setMermaidThemeResolver } from '../../../src/renderer/src/components/editor-mermaid-core.js'
import '../../../src/renderer/src/styles/app.css'
import './web-lite.css'
import WebLiteApp from './WebLiteApp.jsx'
import { detectLiteLanguage, liteTranslate } from './strings.js'

const LANG_KEY = 'easymarkdown.web-lite.lang'

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.href)
    return /^(?:https?:|mailto:)$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// KeepEditor delegates external links to the host. The lightweight build has no
// preload bridge, so expose only the one narrow browser implementation it needs.
window.api = {
  openExternal(value) {
    const url = safeExternalUrl(value)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }
}

setMermaidThemeResolver(() => (document.body.classList.contains('dark') ? 'dark' : 'default'))

class LiteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="lite-fatal">
        <strong>EasyMarkdown Lite</strong>
        <h1>页面无法继续运行</h1>
        <p>{this.state.error?.message || String(this.state.error)}</p>
        <button type="button" onClick={() => window.location.reload()}>
          重新载入
        </button>
      </main>
    )
  }
}

function Root() {
  const [lang, setLangState] = useState(
    () => localStorage.getItem(LANG_KEY) || detectLiteLanguage()
  )
  const setLang = useCallback((next) => {
    localStorage.setItem(LANG_KEY, next)
    setLangState(next)
  }, [])
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang
  document.title = `${liteTranslate(lang, 'appName')} — ${liteTranslate(lang, 'lite')}`
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <WebLiteApp lang={lang} setLang={setLang} />
    </I18nProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <LiteErrorBoundary>
    <Root />
  </LiteErrorBoundary>
)
