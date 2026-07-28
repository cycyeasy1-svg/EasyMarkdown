import { useEffect, useMemo, useState } from 'react'
import {
  bindingConflict,
  eventToKeybinding,
  KEYBINDING_COMMANDS,
  keybindingToDisplay,
  reservedKeybindingReason
} from '../../../shared/keybindings.js'

const CATEGORY_ORDER = ['file', 'view', 'editor']

const titleFor = (command, t) => {
  const translated = t(command.titleKey)
  return translated === command.titleKey ? command.id : translated
}

export default function KeyboardSettings({
  overrides,
  effective,
  onUpdate,
  onReset,
  onResetAll,
  t
}) {
  const platform = window.api.platform
  const [recording, setRecording] = useState(null)
  const [issue, setIssue] = useState(null)
  const [query, setQuery] = useState('')
  const commands = useMemo(() => {
    const capabilities = window.api.capabilities || {}
    return KEYBINDING_COMMANDS.filter(
      (command) => !command.capability || capabilities[command.capability] !== false
    )
  }, [])

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setRecording(null)
        setIssue(null)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        onUpdate(recording, [])
        setRecording(null)
        setIssue(null)
        return
      }
      const binding = eventToKeybinding(event, platform)
      if (!binding) return
      const reserved = reservedKeybindingReason(binding, platform)
      if (reserved) {
        setIssue({ commandId: recording, binding, type: reserved })
        return
      }
      const conflict = bindingConflict(recording, binding, effective, platform)
      if (conflict) {
        setIssue({ commandId: recording, binding, type: 'conflict', conflict })
        return
      }
      onUpdate(recording, [binding])
      setRecording(null)
      setIssue(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [effective, onUpdate, platform, recording])

  const issueText = issue
    ? issue.type === 'conflict'
      ? t('settings.keyboardConflict', {
          keys: keybindingToDisplay(issue.binding, platform),
          command: titleFor(issue.conflict, t)
        })
      : t('settings.keyboardReserved', {
          keys: keybindingToDisplay(issue.binding, platform),
          reason: t(`settings.keyboardReserved.${issue.type}`)
        })
    : ''
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matches = (command) => {
    if (!normalizedQuery) return true
    const bindings = effective[command.id] || []
    return [
      command.id,
      titleFor(command, t),
      t(`settings.keyboard.category.${command.category}`),
      ...bindings,
      ...bindings.map((binding) => keybindingToDisplay(binding, platform))
    ].join(' ').toLocaleLowerCase().includes(normalizedQuery)
  }

  return (
    <div className="hm-set-section hm-keyboard-settings">
      <div className="hm-keyboard-heading">
        <div>
          <div className="hm-set-section-title">{t('settings.keyboard')}</div>
          <p>{t('settings.keyboardDesc')}</p>
        </div>
        <button type="button" className="hm-set-btn" onClick={onResetAll}>
          {t('settings.keyboardResetAll')}
        </button>
      </div>
      {issue && <div className="hm-keyboard-issue" role="alert">{issueText}</div>}
      <input
        type="search"
        className="hm-keyboard-search"
        value={query}
        spellCheck={false}
        placeholder={t('settings.keyboardSearch')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="hm-keyboard-groups">
        {CATEGORY_ORDER.map((category) => {
          const group = commands.filter((command) => command.category === category && matches(command))
          if (!group.length) return null
          return (
            <section className="hm-keyboard-group" key={category}>
              <h3>{t(`settings.keyboard.category.${category}`)}</h3>
              {group.map((command) => {
                const labels = (effective[command.id] || [])
                  .map((binding) => keybindingToDisplay(binding, platform))
                  .filter(Boolean)
                const customized = Object.prototype.hasOwnProperty.call(overrides, command.id)
                const rowIssue = issue?.commandId === command.id
                return (
                  <div className={`hm-keyboard-row${rowIssue ? ' has-error' : ''}`} key={command.id}>
                    <span>
                      {titleFor(command, t)}
                      {command.editorOwned && (
                        <span className="hm-setting-scope">{t('settings.scope.milkdownOnly')}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className={`hm-keyboard-recorder${recording === command.id ? ' recording' : ''}`}
                      data-keybinding-recording={recording === command.id ? 'true' : undefined}
                      aria-invalid={rowIssue || undefined}
                      onClick={() => {
                        setRecording(command.id)
                        setIssue(null)
                      }}
                    >
                      {recording === command.id
                        ? t('settings.keyboardRecording')
                        : labels.length
                          ? labels.map((label) => <kbd key={label}>{label}</kbd>)
                          : t('settings.keyboardUnassigned')}
                    </button>
                    <button
                      type="button"
                      className="hm-keyboard-action"
                      title={t('settings.keyboardClear')}
                      onClick={() => onUpdate(command.id, [])}
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      className="hm-keyboard-action"
                      title={t('settings.keyboardReset')}
                      disabled={!customized}
                      onClick={() => onReset(command.id)}
                    >
                      ↺
                    </button>
                  </div>
                )
              })}
            </section>
          )
        })}
        {!commands.some(matches) && (
          <div className="hm-keyboard-empty">{t('settings.keyboardNoResults')}</div>
        )}
      </div>
      <p className="hm-keyboard-note">{t('settings.keyboardNote')}</p>
    </div>
  )
}
