import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { useI18n, LANGS } from '../i18n.jsx'
import { THEMES } from '../themes.js'
import { fireToast } from '../ui.js'
import { resolveDefaultFontName } from '../../../shared/fonts.js'

// One labeled row with a toggle switch on the right.
function SwitchRow({ label, desc, checked, onChange }) {
  return (
    <div className="hm-set-row">
      <div className="hm-set-text">
        <div className="hm-set-label">{label}</div>
        {desc && <div className="hm-set-desc">{desc}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`hm-switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="hm-switch-knob" />
      </button>
    </div>
  )
}

function FontRow({ id, label, desc, value, defaultValue, fonts, resetLabel, onLoadFonts, onChange, onReset }) {
  const displayValue = value || defaultValue
  const options = [...new Set([displayValue, defaultValue, ...(fonts || [])].filter(Boolean))]
  return (
    <div className="hm-set-row hm-font-row">
      <label className="hm-set-text" htmlFor={`hm-font-${id}`}>
        <span className="hm-set-label">{label}</span>
        {desc && <span className="hm-set-desc">{desc}</span>}
      </label>
      <div className="hm-font-control">
        <select
          id={`hm-font-${id}`}
          value={displayValue}
          style={{ fontFamily: `'${displayValue}'` }}
          onFocus={onLoadFonts}
          onPointerDown={onLoadFonts}
          onChange={(e) => onChange(e.target.value === defaultValue ? '' : e.target.value)}
        >
          {options.map((font) => (
            <option value={font} key={font} style={{ fontFamily: `'${font}'` }}>{font}</option>
          ))}
        </select>
        <button
          type="button"
          className="hm-font-reset"
          onClick={onReset}
          disabled={!value}
          title={resetLabel}
        >
          <Icon name="undo" size={12} />
          <span>{resetLabel}</span>
        </button>
      </div>
    </div>
  )
}

// Unified settings modal for durable preferences. Frequently adjusted layout
// controls live in the status bar; font-family choices stay here because they
// change far less often.
export default function Settings({
  open,
  onClose,
  settings,
  updateSettings,
  theme,
  setTheme,
  customThemes = [],
  customTheme,
  onPickCustom,
  onRefreshThemes,
  onOpenThemesFolder,
  onGetMoreThemes,
  onClearLocalHistory,
  onOpenHelp
}) {
  const { lang, t, setLang } = useI18n()
  const caps = window.api.capabilities || {}
  const isMac = window.api.platform === 'darwin'
  const fontsLoadedRef = useRef(false)
  const [fontFamilies, setFontFamilies] = useState([])

  const ensureFonts = useCallback(async () => {
    if (fontsLoadedRef.current || typeof window.queryLocalFonts !== 'function') return
    fontsLoadedRef.current = true
    try {
      await window.api.allowLocalFonts?.()
      const fonts = await window.queryLocalFonts()
      setFontFamilies(
        [...new Set(fonts.map((font) => font.family).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
      )
    } catch {
      fontsLoadedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (open && caps.nativeMenus) ensureFonts()
  }, [caps.nativeMenus, ensureFonts, open])

  const defaultEnglishFont = useMemo(
    () => resolveDefaultFontName('en', window.api.platform, fontFamilies),
    [fontFamilies]
  )
  const defaultChineseFont = useMemo(
    () => resolveDefaultFontName('zh', window.api.platform, fontFamilies),
    [fontFamilies]
  )
  const defaultJapaneseFont = useMemo(
    () => resolveDefaultFontName('ja', window.api.platform, fontFamilies),
    [fontFamilies]
  )
  const defaultMonoFont = useMemo(
    () => resolveDefaultFontName('mono', window.api.platform, fontFamilies),
    [fontFamilies]
  )

  // "Set as default Markdown app" — Windows pops the system "open with" picker
  // (main registers the exe first); macOS has no API, so the row's description
  // carries the Finder steps and there is no button.
  const onSetDefaultOpener = async () => {
    const res = await window.api.setDefaultOpener?.()
    if (res?.ok) fireToast(t('settings.defaultOpenerHint'), { duration: 7000 })
    else if (!res?.manual) fireToast(t('settings.defaultOpenerFail'), { kind: 'error', duration: 7000 })
  }

  const clearLocalHistory = async () => {
    if (!window.confirm(t('settings.localHistoryClearConfirm'))) return
    const result = await onClearLocalHistory?.()
    fireToast(
      t(result?.ok ? 'settings.localHistoryCleared' : 'settings.localHistoryClearFailed'),
      result?.ok ? { kind: 'success' } : { kind: 'error', sticky: true }
    )
  }

  // Esc closes; re-scan the themes folder on open so new CSS files show up.
  useEffect(() => {
    if (!open) return
    onRefreshThemes?.()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // Refresh only on the open transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div className="hm-settings-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="hm-settings" role="dialog" aria-label={t('settings.title')}>
        <div className="hm-settings-head">
          <span className="hm-settings-title">
            <Icon name="settings" size={16} /> {t('settings.title')}
          </span>
          <button className="hm-settings-close" onClick={onClose} title={t('find.close')}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="hm-settings-body">
          {/* ── Editing ── */}
          <div className="hm-set-section">
            <div className="hm-set-section-title">{t('settings.sectionEditing')}</div>
            <div className="hm-set-row">
              <div className="hm-set-text">
                <div className="hm-set-label">{t('settings.defaultMode')}</div>
                <div className="hm-set-desc">{t('settings.defaultModeDesc')}</div>
              </div>
              <div className="hm-set-seg">
                {['keep', 'rich'].map((m) => (
                  <button
                    key={m}
                    className={`hm-set-seg-item${settings.defaultEditorMode === m ? ' active' : ''}`}
                    onClick={() => updateSettings({ defaultEditorMode: m })}
                  >
                    {t(m === 'keep' ? 'mode.keep' : 'mode.rich')}
                  </button>
                ))}
              </div>
            </div>
            <SwitchRow
              label={t('settings.autosave')}
              desc={t('settings.autosaveDesc')}
              checked={settings.autosave}
              onChange={(v) => updateSettings({ autosave: v })}
            />
            {caps.localHistory && (
              <>
                <SwitchRow
                  label={t('settings.localHistory')}
                  desc={t('settings.localHistoryDesc')}
                  checked={settings.localHistory}
                  onChange={(localHistory) => updateSettings({ localHistory })}
                />
                <div className="hm-set-row">
                  <div className="hm-set-text">
                    <div className="hm-set-label">{t('settings.localHistoryRetention')}</div>
                    <div className="hm-set-desc">{t('settings.localHistoryRetentionDesc')}</div>
                  </div>
                  <button type="button" className="hm-set-btn" onClick={clearLocalHistory}>
                    {t('settings.localHistoryClear')}
                  </button>
                </div>
              </>
            )}
            {caps.spellcheck && (
              <SwitchRow
                label={t('settings.spellcheck')}
                desc={t('settings.spellcheckDesc')}
                checked={settings.spellcheck}
                onChange={(v) => updateSettings({ spellcheck: v })}
              />
            )}
          </div>

          {/* ── Fonts ── */}
          {caps.nativeMenus && (
            <div className="hm-set-section">
              <div className="hm-set-section-title">{t('settings.sectionFonts')}</div>
              <div className="hm-font-pickers">
                <FontRow
                  id="en"
                  label={t('settings.fontEnglish')}
                  desc={t('settings.fontEnglishDesc')}
                  value={settings.fontWriteEn}
                  defaultValue={defaultEnglishFont}
                  fonts={fontFamilies}
                  resetLabel={t('settings.fontReset')}
                  onLoadFonts={ensureFonts}
                  onChange={(fontWriteEn) => updateSettings({ fontWriteEn })}
                  onReset={() => updateSettings({ fontWriteEn: '' })}
                />
                <FontRow
                  id="zh"
                  label={t('settings.fontChinese')}
                  desc={t('settings.fontChineseDesc')}
                  value={settings.fontWriteZh}
                  defaultValue={defaultChineseFont}
                  fonts={fontFamilies}
                  resetLabel={t('settings.fontReset')}
                  onLoadFonts={ensureFonts}
                  onChange={(fontWriteZh) => updateSettings({ fontWriteZh })}
                  onReset={() => updateSettings({ fontWriteZh: '' })}
                />
                <FontRow
                  id="ja"
                  label={t('settings.fontJapanese')}
                  desc={t('settings.fontJapaneseDesc')}
                  value={settings.fontWriteJa}
                  defaultValue={defaultJapaneseFont}
                  fonts={fontFamilies}
                  resetLabel={t('settings.fontReset')}
                  onLoadFonts={ensureFonts}
                  onChange={(fontWriteJa) => updateSettings({ fontWriteJa })}
                  onReset={() => updateSettings({ fontWriteJa: '' })}
                />
                <FontRow
                  id="mono"
                  label={t('settings.fontMono')}
                  desc={t('settings.fontMonoDesc')}
                  value={settings.fontMono}
                  defaultValue={defaultMonoFont}
                  fonts={fontFamilies}
                  resetLabel={t('settings.fontReset')}
                  onLoadFonts={ensureFonts}
                  onChange={(fontMono) => updateSettings({ fontMono })}
                  onReset={() => updateSettings({ fontMono: '' })}
                />
              </div>
            </div>
          )}

          {/* ── Appearance ── */}
          <div className="hm-set-section">
            <div className="hm-set-section-title">{t('settings.sectionAppearance')}</div>
            <div className="hm-set-themes">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  className={`hm-set-theme${!customTheme && th.id === theme ? ' active' : ''}`}
                  onClick={() => setTheme(th.id)}
                >
                  <span className="theme-swatch" style={{ background: th.swatch }} />
                  {lang === 'zh' ? th.zh : th.en}
                </button>
              ))}
              {customThemes.map((c) => (
                <button
                  key={c.file}
                  className={`hm-set-theme${customTheme === c.file ? ' active' : ''}`}
                  title={c.file}
                  onClick={() => onPickCustom?.(c.file)}
                >
                  <span className="theme-swatch theme-swatch-custom" />
                  {c.name}
                </button>
              ))}
            </div>
            <div className="hm-set-theme-actions">
              <button onClick={() => onOpenThemesFolder?.()}>
                <Icon name="folder" size={13} /> {t('theme.openFolder')}
              </button>
              <button onClick={() => onGetMoreThemes?.()}>
                <Icon name="globe" size={13} /> {t('theme.getMore')}
              </button>
            </div>
          </div>

          {/* ── System (default Markdown opener) ── */}
          {(caps.defaultOpener || caps.folderWorkspace) && (
            <div className="hm-set-section">
              <div className="hm-set-section-title">{t('settings.sectionSystem')}</div>
              {caps.folderWorkspace && (
                <SwitchRow
                  label={t('settings.showHiddenFiles')}
                  desc={t('settings.showHiddenFilesDesc')}
                  checked={settings.showHiddenFiles}
                  onChange={(showHiddenFiles) => updateSettings({ showHiddenFiles })}
                />
              )}
              {caps.defaultOpener && (
                <div className="hm-set-row">
                  <div className="hm-set-text">
                    <div className="hm-set-label">{t('settings.defaultOpener')}</div>
                    <div className="hm-set-desc">
                      {t(isMac ? 'settings.defaultOpenerDescMac' : 'settings.defaultOpenerDescWin')}
                    </div>
                  </div>
                  {!isMac && (
                    <button className="hm-set-btn" onClick={onSetDefaultOpener}>
                      {t('settings.defaultOpenerButton')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Language ── */}
          <div className="hm-set-section">
            <div className="hm-set-section-title">{t('settings.sectionLanguage')}</div>
            <div className="hm-set-seg hm-set-langs">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  className={`hm-set-seg-item${l.id === lang ? ' active' : ''}`}
                  onClick={() => setLang(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hm-settings-help">
            <span>
              <strong>{t('help.settingsLabel')}</strong>
              <small>{t('help.settingsDesc')}</small>
            </span>
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenHelp?.('start')
              }}
            >
              <Icon name="help" size={14} /> {t('help.guide')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
