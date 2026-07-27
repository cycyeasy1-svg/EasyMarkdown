import { useEffect, useMemo, useState } from 'react'
import { Icon } from './icons.jsx'

const CSS_TEMPLATE = `.milkdown .ProseMirror {
  /* Rich editor */
}

.km-doc {
  /* Keep editor */
}
`

function nextSnippetId() {
  return `css-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export default function UserCssSnippets({ snippets = [], onChange, t }) {
  const items = useMemo(
    () => snippets.length ? snippets : [{ id: 'default', name: '', enabled: true, css: '' }],
    [snippets]
  )
  const [activeId, setActiveId] = useState(items[0]?.id)

  useEffect(() => {
    if (!items.some((item) => item.id === activeId)) setActiveId(items[0]?.id)
  }, [activeId, items])

  const active = items.find((item) => item.id === activeId) || items[0]
  const update = (id, patch) => {
    onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }
  const move = (index, delta) => {
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= items.length) return
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    onChange(next)
  }
  const add = () => {
    const item = { id: nextSnippetId(), name: '', enabled: true, css: '' }
    onChange([...items, item])
    setActiveId(item.id)
  }
  const remove = (id) => {
    if (items.length === 1) {
      onChange([{ id: 'default', name: '', enabled: true, css: '' }])
      setActiveId('default')
      return
    }
    const index = items.findIndex((item) => item.id === id)
    const next = items.filter((item) => item.id !== id)
    onChange(next)
    setActiveId(next[Math.min(index, next.length - 1)]?.id)
  }

  return (
    <div className="hm-css-snippets">
      <div className="hm-css-snippet-list" role="list">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`hm-css-snippet-row${item.id === active?.id ? ' active' : ''}`}
            role="listitem"
          >
            <input
              type="checkbox"
              checked={item.enabled !== false}
              aria-label={t('settings.customCssEnabled')}
              onChange={(event) => update(item.id, { enabled: event.target.checked })}
            />
            <button
              type="button"
              className="hm-css-snippet-select"
              onClick={() => setActiveId(item.id)}
              title={item.name || t('settings.customCssUntitled')}
            >
              {item.name || t('settings.customCssUntitled')}
            </button>
            <button
              type="button"
              className="hm-css-snippet-icon"
              disabled={index === 0}
              title={t('settings.customCssMoveUp')}
              onClick={() => move(index, -1)}
            >
              <Icon name="chevron-up" size={12} />
            </button>
            <button
              type="button"
              className="hm-css-snippet-icon"
              disabled={index === items.length - 1}
              title={t('settings.customCssMoveDown')}
              onClick={() => move(index, 1)}
            >
              <Icon name="chevron-down" size={12} />
            </button>
            <button
              type="button"
              className="hm-css-snippet-icon danger"
              title={t('settings.customCssRemove')}
              onClick={() => remove(item.id)}
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="hm-css-snippet-actions">
        <button type="button" className="hm-set-btn" onClick={add}>
          <Icon name="plus" size={12} /> {t('settings.customCssAdd')}
        </button>
        <button
          type="button"
          className="hm-set-btn"
          onClick={() => update(active.id, { css: active.css ? `${active.css}\n\n${CSS_TEMPLATE}` : CSS_TEMPLATE })}
        >
          {t('settings.customCssTemplate')}
        </button>
      </div>
      <label className="hm-css-snippet-editor">
        <span>{t('settings.customCssName')}</span>
        <input
          value={active.name}
          maxLength={80}
          placeholder={t('settings.customCssUntitled')}
          onChange={(event) => update(active.id, { name: event.target.value })}
        />
      </label>
      <textarea
        className="hm-css-snippet-code"
        value={active.css}
        spellCheck={false}
        aria-label={t('settings.customCssCode')}
        placeholder={t('settings.customCssPlaceholder')}
        onChange={(event) => update(active.id, { css: event.target.value })}
      />
    </div>
  )
}
