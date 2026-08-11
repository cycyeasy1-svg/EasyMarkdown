import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import KeepEditor from '../../../src/renderer/src/components/KeepEditor.jsx'
import Outline from '../../../src/renderer/src/components/Outline.jsx'
import { Icon } from '../../../src/renderer/src/components/icons.jsx'
import { useScrollActivity } from '../../../src/renderer/src/hooks/useScrollActivity.js'
import { ZOOM_STEP } from '../../../src/renderer/src/settings.js'
import logoUrl from '../../../src/renderer/src/assets/logo.png'
import TypographyPanel from './TypographyPanel.jsx'
import { sourceLineForOffset, sourceLineForScroll, sourceOffsetForLine } from './source-sync.js'
import { buildLiteStatusPath, isLiteDocumentDirty } from './status.js'
import {
  downloadMarkdown,
  flattenWorkspaceFiles,
  getFileHandleAtPath,
  handlesFromDrop,
  isDirectoryHandle,
  isFileHandle,
  isMarkdownFileName,
  pickMarkdownHandles,
  pickSaveHandle,
  pickWorkspaceHandle,
  readMarkdownSource,
  requestHandlePermission,
  resolveWorkspacePath,
  scanMarkdownWorkspace,
  supportsFileSystemAccess,
  writeMarkdownHandle
} from './browser-files.js'
import { loadLastWorkspaceHandle, saveLastWorkspaceHandle } from './storage.js'
import { liteTranslate } from './strings.js'
import {
  DEFAULT_LITE_TYPOGRAPHY,
  applyLiteTypography,
  loadLiteTypography,
  normalizeLiteTypography,
  saveLiteTypography
} from './typography.js'

const HEADING_SELECTOR = '.km-doc h1,.km-doc h2,.km-doc h3,.km-doc h4,.km-doc h5,.km-doc h6'
const newId = () => globalThis.crypto?.randomUUID?.() || `lite-${Date.now()}-${Math.random()}`
const sameOutline = (a = [], b = []) =>
  a.length === b.length &&
  a.every((item, index) => item.level === b[index]?.level && item.text === b[index]?.text)

function slugifyAnchor(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
}

function filterTree(nodes, query) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return nodes
  return flattenWorkspaceFiles(nodes).filter((node) =>
    node.path.toLocaleLowerCase().includes(normalized)
  )
}

function FileTree({ nodes, query, activePath, onOpen }) {
  const visible = useMemo(() => filterTree(nodes, query), [nodes, query])
  if (!visible.length) return null
  if (query.trim()) {
    return (
      <div className="lite-file-list lite-file-results">
        {visible.map((node) => (
          <button
            type="button"
            className={`lite-file-row${node.path === activePath ? ' active' : ''}`}
            key={node.path}
            onClick={() => onOpen(node)}
            title={node.path}
          >
            <Icon name="file" size={15} />
            <span className="lite-file-result-text">
              <strong>{node.name}</strong>
              <small>{node.path}</small>
            </span>
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className="lite-file-list" role="tree">
      {visible.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          activePath={activePath}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function FileTreeNode({ node, depth, activePath, onOpen }) {
  const [expanded, setExpanded] = useState(depth < 1)
  if (node.type === 'file') {
    return (
      <button
        type="button"
        role="treeitem"
        className={`lite-file-row${node.path === activePath ? ' active' : ''}`}
        style={{ '--tree-depth': depth }}
        onClick={() => onOpen(node)}
        title={node.path}
      >
        <span className="lite-tree-spacer" />
        <Icon name="file" size={15} />
        <span className="lite-file-name">{node.name}</span>
      </button>
    )
  }
  return (
    <div className="lite-tree-directory" role="treeitem" aria-expanded={expanded}>
      <button
        type="button"
        className="lite-file-row lite-directory-row"
        style={{ '--tree-depth': depth }}
        onClick={() => setExpanded((value) => !value)}
        title={node.path}
      >
        <span className={`lite-tree-chevron${expanded ? ' expanded' : ''}`}>›</span>
        <Icon name="folder" size={15} />
        <span className="lite-file-name">{node.name}</span>
      </button>
      {expanded && (
        <div role="group">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function useRelativeWorkspaceImages(containerRef, tab) {
  useEffect(() => {
    const container = containerRef.current
    if (!container || !tab.workspaceHandle || !tab.relativePath) return
    let disposed = false
    const urls = new Map()
    const pending = new WeakSet()

    const resolveImage = async (image) => {
      if (pending.has(image)) return
      const source = image.dataset.liteSource || image.getAttribute('src') || ''
      if (!source || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(source)) return
      const path = resolveWorkspacePath(tab.relativePath, source)
      if (!path) return
      pending.add(image)
      try {
        let url = urls.get(path)
        if (!url) {
          const handle = await getFileHandleAtPath(tab.workspaceHandle, path)
          if (!handle) throw new Error('missing image')
          url = URL.createObjectURL(await handle.getFile())
          urls.set(path, url)
        }
        if (disposed || !image.isConnected) return
        image.dataset.liteSource = source
        image.src = url
        image.classList.remove('lite-image-missing')
      } catch {
        if (!disposed && image.isConnected) image.classList.add('lite-image-missing')
      } finally {
        pending.delete(image)
      }
    }

    const resolveIn = (root) => {
      if (root instanceof HTMLImageElement) void resolveImage(root)
      root.querySelectorAll?.('img').forEach((image) => void resolveImage(image))
    }
    resolveIn(container)
    const observer = new MutationObserver((records) => {
      records.forEach((record) =>
        record.addedNodes.forEach((node) => node.nodeType === 1 && resolveIn(node))
      )
    })
    observer.observe(container, { childList: true, subtree: true })
    return () => {
      disposed = true
      observer.disconnect()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [containerRef, tab.id, tab.relativePath, tab.reloadNonce, tab.workspaceHandle])
}

const LiteEditorPane = memo(function LiteEditorPane({
  tab,
  active,
  readOnly,
  lang,
  onChange,
  onReady,
  onOutline,
  onHistory,
  onDraft,
  onFilter,
  onOpenSource,
  onOpenLink
}) {
  const paneRef = useRef(null)
  useRelativeWorkspaceImages(paneRef, tab)
  useEffect(() => () => onReady(tab.id, null), [onReady, tab.id])

  return (
    <div
      ref={paneRef}
      className={`lite-editor-pane${active ? ' active' : ''}${readOnly ? ' is-readonly' : ''}`}
      aria-hidden={!active}
      aria-disabled={readOnly || undefined}
    >
      <div className="editor-scroll km-scroll lite-editor-scroll">
        <KeepEditor
          key={tab.reloadNonce}
          inView={active}
          initialContent={tab.content}
          docPath=""
          readOnly={false}
          onChange={(content) => onChange(tab.id, content)}
          onReady={(api) => onReady(tab.id, api)}
          onOutline={(outline) => onOutline(tab.id, outline)}
          onHistoryChange={(history) => onHistory(tab.id, history)}
          onDraftChange={(draft) => onDraft(tab.id, draft)}
          onFilterChange={(filter) => onFilter(tab.id, filter)}
          onOpenSource={(line) => onOpenSource(tab.id, line)}
          onLocateSource={(line) => onOpenSource(tab.id, line)}
          onOpenDocLink={(path, anchor) => onOpenLink(tab.id, path, anchor)}
        />
      </div>
    </div>
  )
})

function SourcePanel({ panel, t, onChange, onApply, onClose, onScroll }) {
  const textareaRef = useRef(null)
  const initialDraftRef = useRef(panel.draft)
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const offset = sourceOffsetForLine(initialDraftRef.current, panel.line)
    textarea.focus()
    textarea.setSelectionRange(offset, offset)
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 22
    textarea.scrollTop = Math.max(0, panel.line * lineHeight - textarea.clientHeight * 0.3)
  }, [panel.tabId, panel.line])
  return (
    <aside id="lite-source-panel" className="lite-source-panel" aria-label={t('sourceTitle')}>
      <header>
        <div>
          <strong>{t('sourceTitle')}</strong>
          <span>{panel.name}</span>
        </div>
        <button type="button" className="lite-icon-btn" onClick={onClose} title={t('close')}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <textarea
        ref={textareaRef}
        value={panel.draft}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => onScroll(event.currentTarget, panel)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            onApply()
          }
        }}
        spellCheck="false"
        aria-label={t('sourceTitle')}
      />
      <footer>
        <span>{t('sourceHint')}</span>
        <button type="button" className="lite-primary-btn" onClick={onApply}>
          {t('applySource')}
        </button>
      </footer>
    </aside>
  )
}

export default function WebLiteApp({ lang, setLang }) {
  useScrollActivity()
  const t = useCallback((key, vars) => liteTranslate(lang, key, vars), [lang])
  const [theme, setTheme] = useState(
    () => localStorage.getItem('easymarkdown.web-lite.theme') || 'light'
  )
  const [typography, setTypography] = useState(loadLiteTypography)
  const [typographyOpen, setTypographyOpen] = useState(false)
  const [tabs, setTabs] = useState([])
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const [activeId, setActiveId] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [recentWorkspace, setRecentWorkspace] = useState(null)
  const [scanState, setScanState] = useState('idle')
  const [sidebarMode, setSidebarMode] = useState('files')
  const [sidebarOpen, setSidebarOpen] = useState(
    () => globalThis.matchMedia?.('(min-width: 761px)').matches ?? true
  )
  const [fileQuery, setFileQuery] = useState('')
  const [toast, setToast] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [sourcePanel, setSourcePanel] = useState(null)
  const sourcePanelRef = useRef(sourcePanel)
  sourcePanelRef.current = sourcePanel
  const editorApisRef = useRef(new Map())
  const sourceScrollSyncFrameRef = useRef(0)
  const activeTab = tabs.find((tab) => tab.id === activeId) || null
  const fileSystemSupported = supportsFileSystemAccess()

  const showToast = useCallback((message) => {
    setToast(message)
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => setToast(''), 2600)
  }, [])

  useEffect(() => {
    document.body.classList.remove('light', 'dark')
    document.body.classList.add(theme)
    localStorage.setItem('easymarkdown.web-lite.theme', theme)
  }, [theme])

  useEffect(() => {
    applyLiteTypography(typography)
    saveLiteTypography(typography)
  }, [typography])

  useEffect(() => {
    void loadLastWorkspaceHandle().then(setRecentWorkspace)
  }, [])

  useEffect(() => () => window.cancelAnimationFrame(sourceScrollSyncFrameRef.current), [])

  const updateTab = useCallback((id, updater) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== id) return tab
        return typeof updater === 'function' ? updater(tab) : { ...tab, ...updater }
      })
    )
  }, [])

  const updateTypography = useCallback((partial) => {
    setTypography((current) => normalizeLiteTypography({ ...current, ...partial }))
  }, [])

  const bumpTypographyZoom = useCallback((delta) => {
    setTypography((current) => normalizeLiteTypography({ ...current, zoom: current.zoom + delta }))
  }, [])

  const canLeaveSourcePanel = useCallback(() => {
    const panel = sourcePanelRef.current
    if (!panel) return true
    if (panel.draft !== panel.original && !window.confirm(t('sourceDirtyClose'))) return false
    setSourcePanel(null)
    return true
  }, [t])

  const activateTab = useCallback(
    (id) => {
      if (id === activeId) return
      if (!canLeaveSourcePanel()) return
      setActiveId(id)
    },
    [activeId, canLeaveSourcePanel]
  )

  const openMarkdownSource = useCallback(
    async (source, context = {}) => {
      if (!canLeaveSourcePanel()) return null
      try {
        const entryKey =
          context.workspaceId && context.relativePath
            ? `${context.workspaceId}:${context.relativePath}`
            : null
        if (entryKey) {
          const existing = tabsRef.current.find((tab) => tab.entryKey === entryKey)
          if (existing) {
            setActiveId(existing.id)
            return existing.id
          }
        } else if (isFileHandle(source) && typeof source.isSameEntry === 'function') {
          for (const tab of tabsRef.current) {
            if (tab.handle && (await source.isSameEntry(tab.handle))) {
              setActiveId(tab.id)
              return tab.id
            }
          }
        }
        const file = await readMarkdownSource(source)
        if (!isMarkdownFileName(file.name)) return null
        const id = newId()
        const tab = {
          id,
          name: file.name,
          handle: isFileHandle(source) ? source : null,
          content: file.content,
          savedContent: file.content,
          bom: file.bom,
          lastModified: file.lastModified,
          relativePath: context.relativePath || null,
          workspaceHandle: context.workspaceHandle || null,
          workspaceId: context.workspaceId || null,
          entryKey,
          reloadNonce: 0,
          outline: [],
          canUndo: false,
          canRedo: false,
          hasDraft: false,
          filterInfo: null,
          externalChanged: false
        }
        setTabs((current) => [...current, tab])
        setActiveId(id)
        return id
      } catch (error) {
        if (error?.name !== 'AbortError') showToast(t('readFailed'))
        return null
      }
    },
    [canLeaveSourcePanel, showToast, t]
  )

  const openWorkspaceHandle = useCallback(
    async (handle) => {
      if (!handle || !canLeaveSourcePanel()) return
      setScanState('scanning')
      try {
        if (!(await requestHandlePermission(handle, 'readwrite'))) {
          showToast(t('permissionCancelled'))
          setScanState('idle')
          return
        }
        const scanned = await scanMarkdownWorkspace(handle)
        const next = {
          id: newId(),
          name: handle.name || 'Workspace',
          handle,
          ...scanned
        }
        setWorkspace(next)
        setRecentWorkspace(handle)
        setSidebarMode('files')
        setSidebarOpen(true)
        setFileQuery('')
        setScanState('ready')
        await saveLastWorkspaceHandle(handle)
        if (scanned.truncated) showToast(t('scanTruncated'))
      } catch (error) {
        if (error?.name !== 'AbortError') showToast(t('folderFailed'))
        setScanState('idle')
      }
    },
    [canLeaveSourcePanel, showToast, t]
  )

  const chooseWorkspace = useCallback(async () => {
    try {
      const handle = await pickWorkspaceHandle()
      if (!handle) {
        showToast(t('browserLimited'))
        return
      }
      await openWorkspaceHandle(handle)
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(t('folderFailed'))
    }
  }, [openWorkspaceHandle, showToast, t])

  const chooseFiles = useCallback(async () => {
    try {
      const sources = await pickMarkdownHandles()
      for (const source of sources || []) await openMarkdownSource(source)
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(t('readFailed'))
    }
  }, [openMarkdownSource, showToast, t])

  const openWorkspaceFile = useCallback(
    (node) =>
      openMarkdownSource(node.handle, {
        relativePath: node.path,
        workspaceHandle: workspace.handle,
        workspaceId: workspace.id
      }),
    [openMarkdownSource, workspace]
  )

  const applySourceDraft = useCallback(
    ({ close = true } = {}) => {
      const panel = sourcePanelRef.current
      if (!panel) return null
      const api = editorApisRef.current.get(panel.tabId)
      if (!api) return null
      if (api.hasDraft?.()) {
        api.focusDraft?.()
        showToast(t('draftActive'))
        return null
      }
      const changed = api.replaceMarkdownTransaction?.(panel.draft, {
        kind: 'source-edit',
        summaryKey: 'keep.changeSource'
      })
      if (changed === false && panel.draft !== panel.original) return null
      if (close) setSourcePanel(null)
      else setSourcePanel((current) => current && { ...current, original: current.draft })
      showToast(t('sourceApplied'))
      return panel.draft
    },
    [showToast, t]
  )

  const openSourcePanel = useCallback(
    (tabId, line = 0) => {
      const tab = tabsRef.current.find((item) => item.id === tabId)
      const api = editorApisRef.current.get(tabId)
      if (!tab) return
      if (api?.hasDraft?.()) {
        api.focusDraft?.()
        showToast(t('draftActive'))
        return
      }
      setTypographyOpen(false)
      setActiveId(tabId)
      setSourcePanel({
        tabId,
        name: tab.name,
        draft: api?.getMarkdown?.() ?? tab.content,
        original: api?.getMarkdown?.() ?? tab.content,
        line: Math.max(0, Number(line) || 0)
      })
    },
    [showToast, t]
  )

  const toggleSourcePanel = useCallback(() => {
    if (!activeId) return
    if (sourcePanelRef.current?.tabId === activeId) {
      canLeaveSourcePanel()
      return
    }
    const tab = tabsRef.current.find((item) => item.id === activeId)
    const api = editorApisRef.current.get(activeId)
    if (!tab) return
    const markdown = api?.getMarkdown?.() ?? tab.content
    const rawOffset = api?.navigationOffsetFromViewportTop?.()
    openSourcePanel(
      activeId,
      sourceLineForOffset(markdown, Number.isFinite(rawOffset) ? rawOffset : 0)
    )
  }, [activeId, canLeaveSourcePanel, openSourcePanel])

  const syncPreviewFromSource = useCallback((textarea, panel) => {
    const style = window.getComputedStyle(textarea)
    const original = String(panel.original || '')
    const sourceLine = sourceLineForScroll({
      scrollTop: textarea.scrollTop,
      lineHeight: Number.parseFloat(style.lineHeight) || 22,
      paddingTop: Number.parseFloat(style.paddingTop) || 0,
      lineCount: original.split('\n').length
    })
    const rawOffset = sourceOffsetForLine(original, sourceLine)
    window.cancelAnimationFrame(sourceScrollSyncFrameRef.current)
    sourceScrollSyncFrameRef.current = window.requestAnimationFrame(() => {
      if (sourcePanelRef.current?.tabId !== panel.tabId) return
      editorApisRef.current.get(panel.tabId)?.restoreMarkdownOffset?.(rawOffset, false)
    })
  }, [])

  const saveTab = useCallback(
    async (id, { forceSaveAs = false, contentOverride = null } = {}) => {
      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab) return false
      const api = editorApisRef.current.get(id)
      if (contentOverride == null && api?.hasDraft?.()) {
        api.focusDraft?.()
        showToast(t('draftActive'))
        return false
      }
      const content = contentOverride ?? api?.getMarkdown?.() ?? tab.content
      let handle = forceSaveAs ? null : tab.handle
      try {
        if (handle && tab.lastModified) {
          const current = await handle.getFile()
          if (
            Number(current.lastModified) !== Number(tab.lastModified) &&
            !window.confirm(t('externalOverwrite'))
          ) {
            return false
          }
        }
        if (!handle) handle = await pickSaveHandle(tab.name)
        if (!handle) {
          downloadMarkdown(tab.name, content, { bom: tab.bom })
          updateTab(id, {
            content,
            savedContent: content,
            externalChanged: false
          })
          showToast(t('downloaded'))
          return true
        }
        const result = await writeMarkdownHandle(handle, content, { bom: tab.bom })
        updateTab(id, (current) => ({
          ...current,
          name: handle.name || current.name,
          handle,
          content,
          savedContent: content,
          lastModified: result.lastModified,
          externalChanged: false,
          ...(forceSaveAs
            ? { relativePath: null, workspaceHandle: null, workspaceId: null, entryKey: null }
            : null)
        }))
        showToast(t('saved'))
        return true
      } catch (error) {
        showToast(error?.code === 'permission-denied' ? t('writeDenied') : t('saveFailed'))
        return false
      }
    },
    [showToast, t, updateTab]
  )

  const saveActive = useCallback(async () => {
    if (!activeId) return
    const panel = sourcePanelRef.current
    let override = null
    if (panel?.tabId === activeId && panel.draft !== panel.original) {
      override = applySourceDraft()
      if (override == null) return
    }
    await saveTab(activeId, { contentOverride: override })
  }, [activeId, applySourceDraft, saveTab])

  const reloadTab = useCallback(
    async (id) => {
      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab?.handle) return
      if (!canLeaveSourcePanel()) return
      if (tab.content !== tab.savedContent && !window.confirm(t('dirtyReload'))) return
      try {
        const next = await readMarkdownSource(tab.handle)
        updateTab(id, (current) => ({
          ...current,
          content: next.content,
          savedContent: next.content,
          bom: next.bom,
          lastModified: next.lastModified,
          reloadNonce: current.reloadNonce + 1,
          externalChanged: false,
          outline: [],
          canUndo: false,
          canRedo: false
        }))
      } catch {
        showToast(t('readFailed'))
      }
    },
    [canLeaveSourcePanel, showToast, t, updateTab]
  )

  const closeTab = useCallback(
    (id) => {
      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab) return
      if (sourcePanelRef.current?.tabId === id && !canLeaveSourcePanel()) return
      if (tab.content !== tab.savedContent && !window.confirm(t('dirtyClose'))) return
      setTabs((current) => {
        const index = current.findIndex((item) => item.id === id)
        const next = current.filter((item) => item.id !== id)
        if (activeId === id) setActiveId(next[Math.min(index, next.length - 1)]?.id || null)
        return next
      })
      editorApisRef.current.delete(id)
    },
    [activeId, canLeaveSourcePanel, t]
  )

  const scrollToHeadingIndex = useCallback((id, index) => {
    const api = editorApisRef.current.get(id)
    api?.ensureRendered?.()
    const scroller = api?.getScroller?.()
    const headings = scroller?.querySelectorAll(HEADING_SELECTOR)
    const heading = headings?.[index]
    if (!heading) return
    api?.revealHeading?.(heading)
    heading.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])

  const scrollToAnchor = useCallback((id, anchor, attempt = 0) => {
    if (!anchor) return
    const api = editorApisRef.current.get(id)
    if (!api && attempt < 8) {
      window.setTimeout(() => scrollToAnchor(id, anchor, attempt + 1), 60)
      return
    }
    api?.ensureRendered?.()
    const scroller = api?.getScroller?.()
    const wanted = slugifyAnchor(anchor)
    const heading = Array.from(scroller?.querySelectorAll(HEADING_SELECTOR) || []).find(
      (element) => slugifyAnchor(element.textContent) === wanted || element.id === anchor
    )
    if (heading) {
      api?.revealHeading?.(heading)
      heading.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [])

  const openDocumentLink = useCallback(
    async (tabId, rawPath, anchor) => {
      const tab = tabsRef.current.find((item) => item.id === tabId)
      if (!tab) return
      if (!rawPath) {
        scrollToAnchor(tabId, anchor)
        return
      }
      if (!tab.workspaceHandle || !tab.relativePath) {
        showToast(t('linkMissing'))
        return
      }
      let target = resolveWorkspacePath(tab.relativePath, rawPath)
      if (!target) {
        showToast(t('linkMissing'))
        return
      }
      const candidates = /\.[a-z0-9]+$/i.test(target)
        ? [target]
        : [`${target}.md`, `${target}.markdown`, `${target}.mdx`]
      for (const path of candidates) {
        const handle = await getFileHandleAtPath(tab.workspaceHandle, path)
        if (!handle) continue
        const openedId = await openMarkdownSource(handle, {
          relativePath: path,
          workspaceHandle: tab.workspaceHandle,
          workspaceId: tab.workspaceId
        })
        if (openedId && anchor) window.setTimeout(() => scrollToAnchor(openedId, anchor), 80)
        return
      }
      showToast(t('linkMissing'))
    },
    [openMarkdownSource, scrollToAnchor, showToast, t]
  )

  const onEditorReady = useCallback((id, api) => {
    if (api) editorApisRef.current.set(id, api)
    else editorApisRef.current.delete(id)
  }, [])
  const onEditorChange = useCallback(
    (id, content) => updateTab(id, (tab) => ({ ...tab, content })),
    [updateTab]
  )
  const onEditorOutline = useCallback(
    (id, outline) =>
      updateTab(id, (tab) => (sameOutline(tab.outline, outline) ? tab : { ...tab, outline })),
    [updateTab]
  )
  const onEditorHistory = useCallback(
    (id, history) => updateTab(id, { canUndo: !!history?.canUndo, canRedo: !!history?.canRedo }),
    [updateTab]
  )
  const onEditorDraft = useCallback((id, hasDraft) => updateTab(id, { hasDraft }), [updateTab])
  const onEditorFilter = useCallback(
    (id, filterInfo) => updateTab(id, { filterInfo: filterInfo || null }),
    [updateTab]
  )

  const clearActiveFilters = useCallback(() => {
    if (!activeId) return
    editorApisRef.current.get(activeId)?.clearAllFilters?.()
  }, [activeId])

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (
        tabsRef.current.some((tab) => tab.content !== tab.savedContent) ||
        (sourcePanelRef.current && sourcePanelRef.current.draft !== sourcePanelRef.current.original)
      ) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    const checkFiles = async () => {
      for (const tab of tabsRef.current) {
        if (!tab.handle || !tab.lastModified) continue
        try {
          const file = await tab.handle.getFile()
          if (Number(file.lastModified) !== Number(tab.lastModified)) {
            updateTab(tab.id, { externalChanged: true })
          }
        } catch {
          // A revoked handle is surfaced when the user explicitly reloads or saves.
        }
      }
    }
    window.addEventListener('focus', checkFiles)
    return () => window.removeEventListener('focus', checkFiles)
  }, [updateTab])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        void saveActive()
        return
      }
      if (key === 'o' && event.shiftKey) {
        event.preventDefault()
        void chooseWorkspace()
        return
      }
      if (key === 'o') {
        event.preventDefault()
        void chooseFiles()
        return
      }
      if (key === '0') {
        event.preventDefault()
        updateTypography({ zoom: DEFAULT_LITE_TYPOGRAPHY.zoom })
        return
      }
      if (key === '+' || key === '=') {
        event.preventDefault()
        bumpTypographyZoom(ZOOM_STEP)
        return
      }
      if (key === '-' || key === '_') {
        event.preventDefault()
        bumpTypographyZoom(-ZOOM_STEP)
        return
      }
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      )
        return
      const api = editorApisRef.current.get(activeId)
      if (key === 'z' && !event.shiftKey && api?.undo) {
        event.preventDefault()
        api.undo()
      } else if ((key === 'y' || (key === 'z' && event.shiftKey)) && api?.redo) {
        event.preventDefault()
        api.redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeId, bumpTypographyZoom, chooseFiles, chooseWorkspace, saveActive, updateTypography])

  useEffect(() => {
    const onWheel = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.target.closest?.('.lite-editor-area')) return
      event.preventDefault()
      bumpTypographyZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [bumpTypographyZoom])

  const onDrop = useCallback(
    async (event) => {
      event.preventDefault()
      setDropActive(false)
      const handles = await handlesFromDrop(event.dataTransfer)
      const directory = handles.find(isDirectoryHandle)
      if (directory) {
        await openWorkspaceHandle(directory)
        return
      }
      for (const handle of handles) await openMarkdownSource(handle)
    },
    [openMarkdownSource, openWorkspaceHandle]
  )

  const activeApi = activeId ? editorApisRef.current.get(activeId) : null
  const activePath =
    activeTab && activeTab.workspaceId === workspace?.id ? activeTab.relativePath : null
  const sourceOpen = sourcePanel?.tabId === activeId
  const statusPath = buildLiteStatusPath(activeTab, workspace)
  const activeDirty = isLiteDocumentDirty(activeTab, sourcePanel)
  const filterTitle = activeTab?.filterInfo
    ? [
        ...(activeTab.filterInfo.tables?.length > 1
          ? activeTab.filterInfo.tables.map((table) =>
              t('filteredTable', {
                index: table.ti + 1,
                shown: table.shown,
                total: table.total
              })
            )
          : []),
        t('clearFilters')
      ].join('\n')
    : ''

  return (
    <div
      className={`lite-app${sidebarOpen ? '' : ' sidebar-closed'}`}
      onDragEnter={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) setDropActive(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false)
      }}
      onDrop={onDrop}
    >
      <header className="lite-titlebar">
        <button
          type="button"
          className="lite-icon-btn lite-sidebar-toggle"
          onClick={() => setSidebarOpen((value) => !value)}
          title={t(sidebarOpen ? 'closeSidebar' : 'showSidebar')}
        >
          <Icon name="sidebar" size={17} />
        </button>
        <div className="lite-brand">
          <img src={logoUrl} alt="" />
          <strong>{t('appName')}</strong>
          <span>{t('lite')}</span>
        </div>
        <div className="lite-title-file" title={activeTab?.relativePath || activeTab?.name || ''}>
          {activeTab
            ? `${activeTab.name}${activeTab.content !== activeTab.savedContent ? ' •' : ''}`
            : ''}
        </div>
        <nav className="lite-title-actions" aria-label="Document actions">
          <button type="button" className="lite-toolbar-btn" onClick={chooseFiles}>
            <Icon name="file" size={15} />
            <span>{t('openFile')}</span>
          </button>
          <button type="button" className="lite-toolbar-btn" onClick={chooseWorkspace}>
            <Icon name="folder" size={15} />
            <span>{t('openFolder')}</span>
          </button>
          <span className="lite-toolbar-separator" />
          <button
            type="button"
            className="lite-icon-btn lite-history-action"
            disabled={!activeTab?.canUndo || sourceOpen}
            onClick={() => activeApi?.undo?.()}
            title={t('undo')}
          >
            <Icon name="undo" size={16} />
          </button>
          <button
            type="button"
            className="lite-icon-btn lite-history-action"
            disabled={!activeTab?.canRedo || sourceOpen}
            onClick={() => activeApi?.redo?.()}
            title={t('redo')}
          >
            <Icon name="redo" size={16} />
          </button>
          <button
            type="button"
            className={`lite-icon-btn lite-source-toggle${sourceOpen ? ' active' : ''}`}
            disabled={!activeTab}
            onClick={toggleSourcePanel}
            title={t(sourceOpen ? 'closeSource' : 'source')}
            aria-label={t(sourceOpen ? 'closeSource' : 'source')}
            aria-pressed={sourceOpen}
            aria-controls="lite-source-panel"
          >
            <Icon name="code" size={16} />
          </button>
          <button
            type="button"
            className={`lite-toolbar-btn lite-typography-trigger${typographyOpen ? ' active' : ''}`}
            onClick={() => setTypographyOpen((value) => !value)}
            title={t('typography')}
            aria-expanded={typographyOpen}
          >
            <Icon name="text-size" size={15} />
            <span>{t('typography')}</span>
          </button>
          <button
            type="button"
            className={`lite-save-btn${activeTab && activeTab.content !== activeTab.savedContent ? ' dirty' : ''}`}
            disabled={!activeTab}
            onClick={saveActive}
          >
            <Icon name="save" size={15} />
            <span>{t('save')}</span>
          </button>
          <button
            type="button"
            className="lite-icon-btn"
            onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
            title={t('theme')}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} />
          </button>
        </nav>
      </header>

      <div className="lite-workbench">
        <nav className="lite-activity" aria-label="Sidebar views">
          <button
            type="button"
            className={sidebarMode === 'files' && sidebarOpen ? 'active' : ''}
            onClick={() => {
              setSidebarMode('files')
              setSidebarOpen(true)
            }}
            title={t('files')}
          >
            <Icon name="file" size={20} />
          </button>
          <button
            type="button"
            className={sidebarMode === 'outline' && sidebarOpen ? 'active' : ''}
            onClick={() => {
              setSidebarMode('outline')
              setSidebarOpen(true)
            }}
            title={t('outline')}
          >
            <Icon name="outline" size={20} />
          </button>
        </nav>

        <aside className="lite-sidebar" aria-hidden={!sidebarOpen}>
          {sidebarMode === 'files' ? (
            <>
              <div className="lite-panel-header">
                <span>{workspace?.name || t('files')}</span>
                <button
                  type="button"
                  className="lite-icon-btn"
                  onClick={chooseWorkspace}
                  title={t('openFolder')}
                >
                  <Icon name="folder" size={15} />
                </button>
              </div>
              {workspace && (
                <label className="lite-file-search">
                  <Icon name="search" size={14} />
                  <input
                    value={fileQuery}
                    onChange={(event) => setFileQuery(event.target.value)}
                    placeholder={t('searchFiles')}
                  />
                </label>
              )}
              <div className="lite-sidebar-body">
                {scanState === 'scanning' ? (
                  <div className="lite-sidebar-empty">
                    <span className="lite-spinner" />
                    {t('scanning')}
                  </div>
                ) : workspace ? (
                  <>
                    <div className="lite-workspace-meta">
                      {t('workspaceCount', { count: workspace.count })}
                    </div>
                    <FileTree
                      nodes={workspace.tree}
                      query={fileQuery}
                      activePath={activePath}
                      onOpen={openWorkspaceFile}
                    />
                    {!filterTree(workspace.tree, fileQuery).length && (
                      <div className="lite-sidebar-empty">{t('noFiles')}</div>
                    )}
                  </>
                ) : (
                  <div className="lite-sidebar-empty">
                    <Icon name="folder" size={22} />
                    <span>{t('noWorkspace')}</span>
                    <button type="button" onClick={chooseWorkspace}>
                      {t('openFolder')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : activeTab ? (
            <Outline
              content={activeTab.content}
              onJump={(index) => scrollToHeadingIndex(activeTab.id, index)}
            />
          ) : (
            <div className="lite-sidebar-empty">{t('noOutline')}</div>
          )}
        </aside>

        <main className="lite-main">
          <div className="lite-tabs" role="tablist" aria-label="Open documents">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`lite-tab${tab.id === activeId ? ' active' : ''}`}
                role="tab"
                aria-selected={tab.id === activeId}
              >
                <button
                  type="button"
                  className="lite-tab-main"
                  onClick={() => activateTab(tab.id)}
                  title={tab.relativePath || tab.name}
                >
                  <Icon name="file" size={14} />
                  <span>{tab.name}</span>
                  {tab.externalChanged && <i title={t('externalChanged')}>↻</i>}
                  {tab.content !== tab.savedContent && <b aria-label="Unsaved">●</b>}
                </button>
                <button
                  type="button"
                  className="lite-tab-close"
                  onClick={() => closeTab(tab.id)}
                  title={t('close')}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className={`lite-editor-area${sourceOpen ? ' has-source' : ''}`}>
            <div className="lite-editor-stack">
              {tabs.length ? (
                tabs.map((tab) => (
                  <LiteEditorPane
                    key={tab.id}
                    tab={tab}
                    active={tab.id === activeId}
                    readOnly={sourceOpen && tab.id === activeId}
                    lang={lang}
                    onChange={onEditorChange}
                    onReady={onEditorReady}
                    onOutline={onEditorOutline}
                    onHistory={onEditorHistory}
                    onDraft={onEditorDraft}
                    onFilter={onEditorFilter}
                    onOpenSource={openSourcePanel}
                    onOpenLink={openDocumentLink}
                  />
                ))
              ) : (
                <section className="lite-welcome">
                  <div className="lite-welcome-mark">
                    <img src={logoUrl} alt="" />
                  </div>
                  <div className="lite-welcome-copy">
                    <span>{t('lite')}</span>
                    <h1>{t('welcomeTitle')}</h1>
                    <p>{t('welcomeBody')}</p>
                  </div>
                  <div className="lite-welcome-actions">
                    <button
                      type="button"
                      className="lite-welcome-primary"
                      onClick={chooseWorkspace}
                    >
                      <Icon name="folder" size={20} />
                      <span>
                        <strong>{t('openFolder')}</strong>
                        <small>{t('welcomeHint')}</small>
                      </span>
                    </button>
                    <button type="button" className="lite-welcome-secondary" onClick={chooseFiles}>
                      <Icon name="file" size={19} />
                      <span>
                        <strong>{t('openFile')}</strong>
                        <small>{t('welcomeFileHint')}</small>
                      </span>
                    </button>
                    {recentWorkspace && (
                      <button
                        type="button"
                        className="lite-recent"
                        onClick={() => openWorkspaceHandle(recentWorkspace)}
                      >
                        <Icon name="history" size={18} />
                        <span>
                          <strong>{t('continueFolder')}</strong>
                          <small>{recentWorkspace.name}</small>
                        </span>
                      </button>
                    )}
                  </div>
                  {!fileSystemSupported && (
                    <p className="lite-browser-note">{t('browserLimited')}</p>
                  )}
                </section>
              )}
            </div>
            {sourceOpen && (
              <SourcePanel
                panel={sourcePanel}
                t={t}
                onChange={(draft) => setSourcePanel((current) => current && { ...current, draft })}
                onApply={() => applySourceDraft()}
                onClose={canLeaveSourcePanel}
                onScroll={syncPreviewFromSource}
              />
            )}
          </div>
        </main>
      </div>

      <footer className="lite-statusbar">
        <div className="lite-status-primary">
          {activeTab ? (
            <>
              <span className="lite-status-path" title={statusPath}>
                {statusPath}
              </span>
              <span
                className={`lite-status-state ${activeDirty ? 'modified' : 'saved'}`}
                title={t(activeDirty ? 'modifiedStatus' : 'savedStatus')}
                aria-label={t(activeDirty ? 'modifiedStatus' : 'savedStatus')}
              >
                <span aria-hidden="true">{activeDirty ? '●' : '✓'}</span>
                <span className="lite-status-state-label">
                  {t(activeDirty ? 'modifiedStatus' : 'savedStatus')}
                </span>
              </span>
              {activeTab.filterInfo && (
                <button
                  type="button"
                  className="lite-status-filter"
                  title={filterTitle}
                  aria-label={`${t('filterStatus', activeTab.filterInfo)} · ${t('clearFilters')}`}
                  onClick={clearActiveFilters}
                >
                  <Icon name="filter" size={12} />
                  <span>{t('filterStatus', activeTab.filterInfo)}</span>
                  <Icon name="close" size={11} />
                </button>
              )}
              {activeTab.externalChanged && (
                <button
                  type="button"
                  className="lite-status-warning"
                  onClick={() => reloadTab(activeTab.id)}
                  title={`${t('externalChanged')} · ${t('reloadNow')}`}
                >
                  <Icon name="sync" size={12} />
                  <span>{t('externalChanged')}</span>
                </button>
              )}
            </>
          ) : (
            <span className="lite-status-empty">{t('noFileOpen')}</span>
          )}
        </div>
        <div className="lite-status-auxiliary">
          <span className="lite-status-mode">{t('ready')}</span>
          <button
            type="button"
            className="lite-status-reload"
            disabled={!activeTab?.handle}
            onClick={() => activeTab && reloadTab(activeTab.id)}
            title={t('reload')}
          >
            <Icon name="sync" size={13} />
            <span>{t('reload')}</span>
          </button>
          <label className="lite-language-select" title={t('language')}>
            <Icon name="globe" size={13} />
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value)}
              aria-label={t('language')}
            >
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </label>
          <span className="lite-status-version">v{__APP_VERSION__}</span>
        </div>
      </footer>

      {typographyOpen && (
        <TypographyPanel
          settings={typography}
          onChange={updateTypography}
          onReset={() => setTypography({ ...DEFAULT_LITE_TYPOGRAPHY })}
          onClose={() => setTypographyOpen(false)}
          t={t}
        />
      )}

      {dropActive && (
        <div className="lite-drop-overlay">
          <Icon name="folder" size={30} />
          <strong>{t('dropHint')}</strong>
        </div>
      )}
      {toast && (
        <div className="lite-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
