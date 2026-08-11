import { useCallback, useEffect, useMemo, useState } from 'react'
import { resolveDefaultFontName } from '../../../src/shared/fonts.js'
import { TypographyGroups } from '../../../src/renderer/src/components/TypographyControls.jsx'
import { Icon } from '../../../src/renderer/src/components/icons.jsx'

const COMMON_FONTS = {
  en: ['Arial', 'Segoe UI', 'Georgia', 'Times New Roman'],
  zh: ['Microsoft YaHei', 'SimSun', 'KaiTi', 'Source Han Sans SC', 'Noto Sans SC'],
  ja: ['Yu Gothic', 'Meiryo', 'BIZ UDPGothic', 'Noto Sans JP'],
  mono: ['Consolas', 'Cascadia Mono', 'JetBrains Mono', 'Courier New']
}

function browserPlatform() {
  const platform = String(
    navigator.userAgentData?.platform || navigator.platform || ''
  ).toLowerCase()
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('win')) return 'win32'
  return 'linux'
}

function FontRow({ id, label, value, defaultValue, fonts, onChange, t }) {
  const options = [...new Set([value, ...COMMON_FONTS[id], ...fonts].filter(Boolean))]
  return (
    <label className="lite-font-row" htmlFor={`lite-font-${id}`}>
      <span>{label}</span>
      <select
        id={`lite-font-${id}`}
        value={value}
        style={value ? { fontFamily: `'${value}'` } : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('fontDefault', { name: defaultValue })}</option>
        {options.map((font) => (
          <option value={font} key={font} style={{ fontFamily: `'${font}'` }}>
            {font}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function TypographyPanel({ settings, onChange, onReset, onClose, t }) {
  const [fontFamilies, setFontFamilies] = useState([])
  const [fontState, setFontState] = useState('idle')
  const platform = useMemo(browserPlatform, [])
  const defaultFonts = useMemo(
    () => ({
      en: resolveDefaultFontName('en', platform, fontFamilies),
      zh: resolveDefaultFontName('zh', platform, fontFamilies),
      ja: resolveDefaultFontName('ja', platform, fontFamilies),
      mono: resolveDefaultFontName('mono', platform, fontFamilies)
    }),
    [fontFamilies, platform]
  )

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const loadFonts = useCallback(async () => {
    if (typeof window.queryLocalFonts !== 'function') {
      setFontState('unsupported')
      return
    }
    setFontState('loading')
    try {
      const fonts = await window.queryLocalFonts()
      setFontFamilies(
        [...new Set(fonts.map((font) => font.family).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b)
        )
      )
      setFontState('loaded')
    } catch {
      setFontState('denied')
    }
  }, [])

  return (
    <aside className="lite-typography-panel" aria-label={t('typographyTitle')}>
      <header className="lite-typography-head">
        <div>
          <span className="lite-panel-eyebrow">EasyMarkdown Lite</span>
          <strong>{t('typographyTitle')}</strong>
        </div>
        <div className="lite-panel-actions">
          <button type="button" onClick={onReset} title={t('resetTypography')}>
            <Icon name="undo" size={14} />
            <span>{t('reset')}</span>
          </button>
          <button type="button" className="lite-icon-btn" onClick={onClose} title={t('close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      <div className="lite-typography-scroll">
        <p className="lite-typography-intro">{t('typographyIntro')}</p>
        <TypographyGroups
          fontSize={settings.fontSize}
          onSetFontSize={(fontSize) => onChange({ fontSize })}
          pageWidth={settings.pageWidth}
          onSetPageWidth={(pageWidth) => onChange({ pageWidth })}
          zoom={settings.zoom}
          onSetZoom={(zoom) => onChange({ zoom })}
          lineHeight={settings.lineHeight}
          onSetLineHeight={(lineHeight) => onChange({ lineHeight })}
          paragraphSpacing={settings.paragraphSpacing}
          onSetParagraphSpacing={(paragraphSpacing) => onChange({ paragraphSpacing })}
          headingSpacing={settings.headingSpacing}
          onSetHeadingSpacing={(headingSpacing) => onChange({ headingSpacing })}
        />

        <section className="lite-font-section">
          <div className="lite-font-section-head">
            <div>
              <strong>{t('fontSection')}</strong>
              <span>{t('fontIntro')}</span>
            </div>
            <button
              type="button"
              className="lite-font-load"
              onClick={loadFonts}
              disabled={fontState === 'loading'}
            >
              {t(fontState === 'loading' ? 'loadingFonts' : 'loadFonts')}
            </button>
          </div>
          <div className="lite-font-list">
            <FontRow
              id="en"
              label={t('fontEnglish')}
              value={settings.fontWriteEn}
              defaultValue={defaultFonts.en}
              fonts={fontFamilies}
              onChange={(fontWriteEn) => onChange({ fontWriteEn })}
              t={t}
            />
            <FontRow
              id="zh"
              label={t('fontChinese')}
              value={settings.fontWriteZh}
              defaultValue={defaultFonts.zh}
              fonts={fontFamilies}
              onChange={(fontWriteZh) => onChange({ fontWriteZh })}
              t={t}
            />
            <FontRow
              id="ja"
              label={t('fontJapanese')}
              value={settings.fontWriteJa}
              defaultValue={defaultFonts.ja}
              fonts={fontFamilies}
              onChange={(fontWriteJa) => onChange({ fontWriteJa })}
              t={t}
            />
            <FontRow
              id="mono"
              label={t('fontMono')}
              value={settings.fontMono}
              defaultValue={defaultFonts.mono}
              fonts={fontFamilies}
              onChange={(fontMono) => onChange({ fontMono })}
              t={t}
            />
          </div>
          {fontState !== 'idle' && fontState !== 'loading' && (
            <p className={`lite-font-state ${fontState}`} role="status">
              {t(
                fontState === 'loaded'
                  ? 'fontsLoaded'
                  : fontState === 'denied'
                    ? 'fontAccessDenied'
                    : 'fontUnsupported',
                { count: fontFamilies.length }
              )}
            </p>
          )}
        </section>
      </div>

      <footer className="lite-typography-foot">
        <Icon name="check" size={13} />
        <span>{t('typographyStored')}</span>
      </footer>
    </aside>
  )
}
