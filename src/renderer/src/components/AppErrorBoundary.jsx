import { Component, useState } from 'react'
import {
  requestRendererSafeMode,
  resetRecoveryState
} from '../recovery.js'

const COPY = {
  en: {
    eyebrow: 'Recovery mode',
    title: 'EasyMarkdown hit an unexpected error',
    message: 'Your document files were not changed. Reload the interface, or use safe mode to skip session restore and custom themes.',
    reload: 'Reload interface',
    safeMode: 'Open in safe mode',
    export: 'Export diagnostics',
    exporting: 'Exporting…',
    exported: 'Diagnostic report exported.',
    exportFailed: 'Could not export diagnostics.',
    resetSession: 'Reset session only',
    resetSettings: 'Reset settings only',
    sessionConfirm: 'Reset the saved tab/session state? Unsaved scratch tabs stored only in the session will be removed. Document files are not deleted.',
    settingsConfirm: 'Reset EasyMarkdown preferences to their defaults? Document files and the saved tab/session state are not changed.',
    details: 'Technical details'
  },
  zh: {
    eyebrow: '恢复模式',
    title: 'EasyMarkdown 遇到了意外错误',
    message: '磁盘中的文档没有被修改。你可以重新加载界面，或使用安全模式暂时跳过会话恢复和自定义主题。',
    reload: '重新加载界面',
    safeMode: '使用安全模式打开',
    export: '导出诊断信息',
    exporting: '正在导出…',
    exported: '诊断报告已导出。',
    exportFailed: '诊断信息导出失败。',
    resetSession: '仅重置会话',
    resetSettings: '仅重置设置',
    sessionConfirm: '确定重置已保存的标签页和会话状态吗？仅保存在会话中的未保存草稿会被移除，但不会删除磁盘文档。',
    settingsConfirm: '确定将 EasyMarkdown 设置恢复为默认值吗？磁盘文档及标签页会话不会被修改。',
    details: '技术详情'
  },
  ja: {
    eyebrow: 'リカバリーモード',
    title: 'EasyMarkdown で予期しないエラーが発生しました',
    message: 'ディスク上の文書は変更されていません。画面を再読み込みするか、session 復元と custom theme を一時的に無効化する safe mode を利用できます。',
    reload: '画面を再読み込み',
    safeMode: 'safe mode で開く',
    export: '診断情報を export',
    exporting: 'export 中…',
    exported: '診断 report を export しました。',
    exportFailed: '診断情報を export できませんでした。',
    resetSession: 'session のみ reset',
    resetSettings: '設定のみ reset',
    sessionConfirm: '保存済みの tab／session 状態を reset しますか？session のみに保存された未保存 scratch tab は失われますが、ディスク上の文書は削除されません。',
    settingsConfirm: 'EasyMarkdown の設定を既定値へ reset しますか？文書ファイルと tab／session 状態は変更されません。',
    details: '技術詳細'
  }
}

function recoveryLanguage() {
  const language = String(globalThis.navigator?.language || '')
  if (/^ja/i.test(language)) return 'ja'
  if (/^en/i.test(language)) return 'en'
  return 'zh'
}

export function removeBootSplash() {
  document.getElementById('hm-boot-splash')?.remove()
}

const reload = () => globalThis.location?.reload()

export function AppRecoveryScreen({ error }) {
  const copy = COPY[recoveryLanguage()]
  const [exportState, setExportState] = useState('idle')

  const exportDiagnostics = async () => {
    if (!window.api?.exportDiagnostics || exportState === 'working') return
    setExportState('working')
    try {
      const result = await window.api.exportDiagnostics()
      setExportState(result?.ok ? 'done' : result?.canceled ? 'idle' : 'failed')
    } catch {
      setExportState('failed')
    }
  }

  const enterSafeMode = () => {
    requestRendererSafeMode()
    reload()
  }

  const reset = (kind) => {
    const confirmation = kind === 'session' ? copy.sessionConfirm : copy.settingsConfirm
    if (!window.confirm(confirmation)) return
    resetRecoveryState(kind)
    reload()
  }

  return (
    <main className="hm-recovery" role="alert">
      <section className="hm-recovery-card">
        <div className="hm-recovery-mark" aria-hidden="true">!</div>
        <div className="hm-recovery-eyebrow">{copy.eyebrow}</div>
        <h1>{copy.title}</h1>
        <p>{copy.message}</p>
        <div className="hm-recovery-primary-actions">
          <button type="button" className="primary" onClick={reload}>{copy.reload}</button>
          <button type="button" onClick={enterSafeMode}>{copy.safeMode}</button>
          {window.api?.exportDiagnostics && (
            <button type="button" onClick={exportDiagnostics} disabled={exportState === 'working'}>
              {exportState === 'working' ? copy.exporting : copy.export}
            </button>
          )}
        </div>
        {exportState !== 'idle' && exportState !== 'working' && (
          <div className={`hm-recovery-status ${exportState}`} role="status">
            {exportState === 'done' ? copy.exported : copy.exportFailed}
          </div>
        )}
        <div className="hm-recovery-reset-actions">
          <button type="button" onClick={() => reset('session')}>{copy.resetSession}</button>
          <button type="button" onClick={() => reset('settings')}>{copy.resetSettings}</button>
        </div>
        {error && (
          <details>
            <summary>{copy.details}</summary>
            <pre>{error.name || 'Error'}: {error.message || String(error)}</pre>
          </details>
        )}
      </section>
    </main>
  )
}

export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    removeBootSplash()
    Promise.resolve(window.api?.logDiagnostic?.('error', 'render-failure', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack
    })).catch(() => {})
  }

  render() {
    if (this.state.error) return <AppRecoveryScreen error={this.state.error} />
    return this.props.children
  }
}
