import { Icon } from './icons.jsx'
import { useI18n } from '../i18n.jsx'

export default function TabSwitcher({
  tabs,
  selectedId,
  onSelect,
  onCommit,
  onCancel
}) {
  const { t } = useI18n()
  if (!tabs?.length) return null

  return (
    <div
      className="hm-tab-switcher-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="hm-tab-switcher"
        role="dialog"
        aria-modal="true"
        aria-label={t('tab.switcherTitle')}
      >
        <div className="hm-tab-switcher-head">
          <span>{t('tab.switcherTitle')}</span>
          <span>{t('tab.switcherHint')}</span>
        </div>
        <div className="hm-tab-switcher-list" role="listbox">
          {tabs.map((tab) => {
            const selected = tab.id === selectedId
            return (
              <button
                type="button"
                key={tab.id}
                role="option"
                aria-selected={selected}
                className={`hm-tab-switcher-item${selected ? ' selected' : ''}`}
                onMouseMove={(event) => {
                  if (event.movementX || event.movementY) onSelect(tab.id)
                }}
                onClick={() => onCommit(tab.id)}
              >
                <span className="hm-tab-switcher-icon">
                  <Icon name={tab.pinned ? 'pin' : 'file'} size={15} />
                </span>
                <span className="hm-tab-switcher-copy">
                  <span className="hm-tab-switcher-title">{tab.title}</span>
                  <span className="hm-tab-switcher-path">{tab.path || t('tab.unsaved')}</span>
                </span>
                {tab.dirty && <span className="hm-tab-switcher-dirty" aria-label={t('status.unsaved')} />}
              </button>
            )
          })}
        </div>
        <div className="hm-tab-switcher-foot">{t('tab.switcherFoot')}</div>
      </div>
    </div>
  )
}
