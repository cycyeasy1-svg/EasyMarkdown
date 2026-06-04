import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { BLOCK_TYPES, labelForBlockId } from '../blocks.js'

function stats(md) {
  const text = (md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_~\-\[\]()!]/g, ' ')
  const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length
  const chars = (md || '').length
  const readMin = Math.max(1, Math.round(words / 220))
  return { words, chars, readMin }
}

function BlockSwitcher({ activeBlock, onPickBlock }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="block-switch" ref={ref}>
      <button
        className="status-btn"
        onClick={() => setOpen((v) => !v)}
        title="Change block type"
      >
        <Icon name="heading" size={14} /> {labelForBlockId(activeBlock)}
        <span className="block-switch-caret">▾</span>
      </button>
      {open && (
        <div className="block-switch-menu">
          {BLOCK_TYPES.map((b) => (
            <button
              key={b.id}
              className={`block-menu-item${b.id === activeBlock ? ' active' : ''}`}
              onClick={() => {
                onPickBlock(b.id)
                setOpen(false)
              }}
            >
              <span className="block-menu-short">{b.short}</span>
              <span className="block-menu-name">{b.label}</span>
              <span className="block-menu-sc">{b.shortcut}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StatusBar({
  tab,
  theme,
  onToggleTheme,
  sourceMode,
  onToggleSource,
  activeBlock,
  onPickBlock
}) {
  const s = useMemo(() => stats(tab?.content), [tab?.content])
  const dirty = tab && tab.content !== tab.savedContent
  return (
    <div className="statusbar">
      <div className="status-left">
        {tab ? (
          <>
            <span className="status-path" title={tab.path || 'Unsaved'}>
              {tab.path || 'Unsaved'}
            </span>
            <span className={`status-dot ${dirty ? 'mod' : 'ok'}`}>{dirty ? '● Modified' : '✓ Saved'}</span>
          </>
        ) : (
          <span className="status-path">Ready</span>
        )}
      </div>
      <div className="status-right">
        {tab && (
          <>
            <span>{s.words} words</span>
            <span>{s.chars} chars</span>
            <span>{s.readMin} min read</span>
          </>
        )}
        {tab && !sourceMode && (
          <BlockSwitcher activeBlock={activeBlock} onPickBlock={onPickBlock} />
        )}
        <button className="status-btn" onClick={onToggleSource} title="Toggle source mode (Ctrl+/)">
          <Icon name="code" size={14} /> {sourceMode ? 'Source' : 'Rich'}
        </button>
        <button className="status-btn" onClick={onToggleTheme} title="Toggle theme (Ctrl+Shift+T)">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
        </button>
      </div>
    </div>
  )
}
