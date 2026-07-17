import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { useI18n } from '../i18n.jsx'

const EMPTY_ITEMS = []
const PALETTE_MRU_KEY = 'easymarkdown.palette.mru.v1'
const PREFIXES = new Set(['>', '@', '#', ':', '?'])
const MODE_BY_PREFIX = {
  '>': 'commands',
  '@': 'headings',
  '#': 'workspaceHeadings',
  ':': 'line',
  '?': 'help'
}
const PALETTE_MODES = ['files', 'commands', 'headings', 'workspaceHeadings', 'line', 'help']
const MODE_ICONS = {
  files: 'file',
  commands: 'command',
  headings: 'outline',
  workspaceHeadings: 'hash',
  line: 'hash',
  help: 'info'
}

export function paletteQueryMode(query) {
  const prefix = PREFIXES.has(String(query || '')[0]) ? query[0] : ''
  return {
    prefix,
    mode: MODE_BY_PREFIX[prefix] || 'files',
    term: prefix ? String(query).slice(1).trim() : String(query || '').trim()
  }
}

function score(query, text) {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = String(text || '').toLowerCase()
  const idx = t.indexOf(q)
  if (idx === 0) return 3
  if (idx > 0) return 2
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  return qi === q.length ? 1 : 0
}

function rank(items, query, recentOrder = new Map()) {
  return items
    .map((item, index) => {
      const textScore = Math.max(
        score(query, item.title),
        score(query, item.hint || '') * 0.6
      )
      const recent = recentOrder.has(item.id) ? Math.max(0, 100 - recentOrder.get(item.id)) : 0
      return { item, index, textScore, recent }
    })
    .filter((entry) => entry.textScore > 0)
    .sort((a, b) =>
      b.textScore - a.textScore ||
      b.recent - a.recent ||
      a.index - b.index
    )
    .slice(0, 50)
    .map((entry) => entry.item)
}

function readMru() {
  try {
    const value = JSON.parse(localStorage.getItem(PALETTE_MRU_KEY) || '[]')
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 30) : []
  } catch {
    return []
  }
}

function writeMru(ids) {
  try {
    localStorage.setItem(PALETTE_MRU_KEY, JSON.stringify(ids.slice(0, 30)))
  } catch {
    /* storage is best effort */
  }
}

function CommandPalette({
  open,
  onClose,
  commands,
  files,
  headings = EMPTY_ITEMS,
  recentFiles = EMPTY_ITEMS,
  loadWorkspaceHeadings,
  onOpenFile,
  onOpenHeading,
  onOpenWorkspaceHeading,
  onOpenLine,
  lineCount = 1
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('files')
  const deferredQuery = useDeferredValue(query)
  const [sel, setSel] = useState(0)
  const [mru, setMru] = useState(EMPTY_ITEMS)
  const [workspaceIndex, setWorkspaceIndex] = useState(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceError, setWorkspaceError] = useState(false)
  const workspaceRequestRef = useRef(0)
  const inputRef = useRef(null)
  const parsed = { mode, term: deferredQuery.trim() }

  useEffect(() => {
    if (!open) return
    setQuery('')
    setMode('files')
    setSel(0)
    setMru(readMru())
    setWorkspaceIndex(null)
    setWorkspaceLoading(false)
    setWorkspaceError(false)
    workspaceRequestRef.current += 1
    const isMobile = window.api?.platform === 'ios' || window.api?.platform === 'android'
    if (!isMobile) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (
      !open ||
      parsed.mode !== 'workspaceHeadings' ||
      workspaceIndex ||
      workspaceLoading ||
      workspaceError
    ) return
    const request = ++workspaceRequestRef.current
    setWorkspaceLoading(true)
    setWorkspaceError(false)
    Promise.resolve(loadWorkspaceHeadings?.())
      .then((result) => {
        if (request !== workspaceRequestRef.current) return
        setWorkspaceIndex(result || { items: [], filesScanned: 0, truncated: false })
      })
      .catch(() => {
        if (request === workspaceRequestRef.current) setWorkspaceError(true)
      })
      .finally(() => {
        if (request === workspaceRequestRef.current) setWorkspaceLoading(false)
      })
  }, [
    loadWorkspaceHeadings,
    open,
    parsed.mode,
    workspaceError,
    workspaceIndex,
    workspaceLoading
  ])

  const recentOrder = useMemo(() => {
    const order = new Map()
    mru.forEach((id, index) => order.set(id, index))
    recentFiles.forEach((file, index) => {
      const id = `file:${file.path}`
      if (!order.has(id)) order.set(id, mru.length + index)
    })
    return order
  }, [mru, recentFiles])

  const items = useMemo(() => {
    if (!open) return EMPTY_ITEMS
    const term = parsed.term
    if (parsed.mode === 'commands') {
      return rank(
        commands.map((command) => ({ kind: 'cmd', ...command })),
        term,
        recentOrder
      )
    }
    if (parsed.mode === 'headings') {
      return rank(
        headings.map((heading, index) => ({
          kind: 'heading',
          id: `heading:${index}:${heading.line ?? heading.charOffset ?? ''}`,
          title: heading.text,
          hint: `H${heading.level} · ${Number(heading.line ?? 0) + 1}`,
          icon: 'outline',
          run: () => onOpenHeading?.(index, heading)
        })),
        term
      )
    }
    if (parsed.mode === 'workspaceHeadings') {
      return rank(
        (workspaceIndex?.items || []).map((heading) => ({
          kind: 'workspace-heading',
          id: `workspace-heading:${heading.path}:${heading.line}:${heading.text}`,
          title: heading.text,
          hint: `${heading.rel} · H${heading.level} · ${heading.line}`,
          icon: 'hash',
          run: () => onOpenWorkspaceHeading?.(heading)
        })),
        term
      )
    }
    if (parsed.mode === 'line') {
      const requested = Number.parseInt(term, 10)
      if (!Number.isFinite(requested) || requested < 1 || requested > lineCount) return EMPTY_ITEMS
      return [{
        kind: 'line',
        id: `line:${requested}`,
        title: t('palette.goLine', { n: requested }),
        hint: t('palette.lineRange', { n: lineCount }),
        icon: 'hash',
        run: () => onOpenLine?.(requested)
      }]
    }
    if (parsed.mode === 'help') {
      return [
        ['files', '', 'palette.modeFiles', 'palette.modeFilesHint'],
        ['commands', '>', 'palette.modeCommands', 'palette.modeCommandsHint'],
        ['headings', '@', 'palette.modeHeadings', 'palette.modeHeadingsHint'],
        ['workspaceHeadings', '#', 'palette.modeWorkspaceHeadings', 'palette.modeWorkspaceHeadingsHint'],
        ['line', ':', 'palette.modeLine', 'palette.modeLineHint']
      ].map(([mode, prefix, titleKey, hintKey]) => ({
        kind: 'help',
        id: `help:${mode}`,
        title: `${prefix || '·'}  ${t(titleKey)}`,
        hint: t(hintKey),
        icon: mode === 'files' ? 'file' : mode.includes('Heading') || mode === 'headings' ? 'outline' : 'command',
        fill: mode
      }))
    }
    const candidates = new Map()
    for (const file of [...recentFiles, ...files]) {
      if (!file?.path || candidates.has(file.path)) continue
      candidates.set(file.path, {
        kind: 'file',
        id: `file:${file.path}`,
        title: file.name || file.path.split(/[\\/]/).at(-1),
        hint: file.rel || file.dir || file.path,
        run: () => onOpenFile(file.path)
      })
    }
    return rank(
      [...candidates.values()],
      term,
      recentOrder
    )
  }, [
    commands,
    files,
    headings,
    lineCount,
    onOpenFile,
    onOpenHeading,
    onOpenLine,
    onOpenWorkspaceHeading,
    open,
    parsed.mode,
    parsed.term,
    recentFiles,
    recentOrder,
    t,
    workspaceIndex
  ])

  useEffect(() => {
    if (sel >= items.length) setSel(Math.max(0, items.length - 1))
  }, [items, sel])

  if (!open) return null

  const switchMode = (nextMode) => {
    if (!PALETTE_MODES.includes(nextMode)) return
    setMode(nextMode)
    setQuery('')
    setSel(0)
    setWorkspaceError(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const choose = (item) => {
    if (!item) return
    if (Object.hasOwn(item, 'fill')) {
      switchMode(item.fill)
      return
    }
    const nextMru = [item.id, ...mru.filter((id) => id !== item.id)].slice(0, 30)
    setMru(nextMru)
    writeMru(nextMru)
    onClose()
    item.run?.()
  }

  const emptyMessage =
    parsed.mode === 'workspaceHeadings' && workspaceLoading
      ? t('palette.indexing')
      : parsed.mode === 'workspaceHeadings' && workspaceError
        ? t('palette.indexFailed')
        : t('palette.emptyMode')
  const inputPlaceholder =
    mode === 'line'
      ? t('palette.placeholder.line', { n: lineCount })
      : t(`palette.placeholder.${mode}`)

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input">
          <div className="palette-mode-control">
            <Icon name={MODE_ICONS[mode]} size={15} className="palette-mode-icon" />
            <select
              value={mode}
              aria-label={t('palette.searchScope')}
              title={t('palette.searchScope')}
              onChange={(event) => switchMode(event.target.value)}
            >
              {PALETTE_MODES.map((itemMode) => (
                <option key={itemMode} value={itemMode}>
                  {t(`palette.mode.${itemMode}`)}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={12} className="palette-mode-chevron" />
          </div>
          <input
            ref={inputRef}
            value={query}
            placeholder={inputPlaceholder}
            onChange={(event) => {
              const value = event.target.value
              const shortcut = paletteQueryMode(value)
              if (shortcut.prefix) {
                setMode(shortcut.mode)
                setQuery(shortcut.term)
              } else {
                setQuery(value)
              }
              setSel(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSel((value) => Math.min(items.length - 1, value + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSel((value) => Math.max(0, value - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                choose(items[sel])
              } else if (event.key === 'Escape') {
                onClose()
              }
            }}
          />
        </div>
        <div className="palette-list">
          {items.length === 0 && (
            <div className="palette-empty">
              <span>{emptyMessage}</span>
              {!workspaceLoading && (
                <button type="button" onClick={() => switchMode('help')}>
                  {t('palette.showModes')}
                </button>
              )}
            </div>
          )}
          {items.map((item, index) => (
            <div
              key={item.id}
              data-kind={item.kind}
              className={`palette-item${index === sel ? ' sel' : ''}`}
              onMouseEnter={() => setSel(index)}
              onClick={() => choose(item)}
            >
              <Icon
                name={
                  item.kind === 'file'
                    ? 'file'
                    : item.kind === 'workspace-heading'
                      ? 'hash'
                      : item.icon || 'command'
                }
                size={16}
                className="palette-item-icon"
              />
              <span className="pi-title">{item.title}</span>
              {item.hint && <span className="pi-hint">{item.hint}</span>}
              {item.shortcut && <kbd className="pi-shortcut">{item.shortcut}</kbd>}
            </div>
          ))}
          {parsed.mode === 'workspaceHeadings' && workspaceIndex?.truncated && (
            <div className="palette-note">{t('palette.indexTruncated')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(CommandPalette)
