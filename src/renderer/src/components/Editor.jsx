import { memo, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import {
  editorViewCtx,
  editorViewOptionsCtx,
  nodeViewCtx,
  parserCtx,
  prosePluginsCtx,
  remarkCtx,
  remarkPluginsCtx,
  remarkStringifyOptionsCtx,
  serializerCtx
} from '@milkdown/kit/core'
import { replaceAll } from '@milkdown/kit/utils'
import { imageBlockConfig } from '@milkdown/kit/component/image-block'
import { inlineImageConfig } from '@milkdown/kit/component/image-inline'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { inlineCodeSchema } from '@milkdown/kit/preset/commonmark'
import { NodeSelection, TextSelection } from '@milkdown/prose/state'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import '@milkdown/crepe/theme/common/link-tooltip.css'
import { BLOCK_TYPES, blockById, currentBlockId } from '../blocks.js'
import { detectDocLang } from '../keep-parser.js'
import { useI18n } from '../i18n.jsx'
import { copyToClipboard } from '../ui.js'
import { renderHtmlNodeView, convertBlock, mergeInlineHtmlRemarkPlugin } from './editor-html.js'
import { dirOf, isRelativePath, resolveToFileUrl, uniqueImageName } from './editor-images.js'
import { copiedPlainText, inlineRichStyles, materializeCopiedSoftBreaks } from './editor-copy.js'
import {
  createMermaidPreviewRenderer,
  createMermaidSplitPlugin,
  refreshMermaidPreviewFromCodeBlock
} from './editor-mermaid.js'
import { readCodeBlockSource } from './editor-codeblock-source.js'
import { createEditorSnapshot } from './editor-pdf-content.js'
import { tableBreakKeymap, tableCellBreakHandler, brToBreakRemarkPlugin } from './editor-tablebreak.js'
import { normalizeEmptyTableCells } from './editor-table-markdown.js'
import { attachMdPasteHandler } from './editor-md-paste.js'
import { createMathBlockPromotionPlugin, normalizeDisplayMath } from './editor-math.js'
import { mathPreviewPlugin } from './editor-math-preview.js'
import { createInlineMathEditingPlugin } from './editor-inline-math.js'
import { createInlineCodeEditingPlugin } from './editor-inline-code.js'
import { createSafeUnderscoreEmphasisInputRule } from './editor-inputrules.js'
import { tabAtCursorKeymap } from './editor-codeblock-tab.js'
import { remarkRepairNonAsciiAutolinks } from './editor-autolink.js'
import { createSlashPlugin, disableCrepeSlash } from './editor-slash-menu.js'
import { markdownOffsetToPmPos, pmPosToMarkdownOffset } from './editor-source-map.js'
import ZoomLightbox from './ZoomLightbox.jsx'
import { ensureEmbedZoomButtons, zoomItemFromButton } from './editor-zoom.js'
import { internalLinkTarget, parseInternalDocLink } from '../link-navigation.js'
import './editor-codeblock-eager.js' // side effect: stable code-block heights (scroll-jump fix)
import remarkFrontmatter from 'remark-frontmatter'
import { frontmatterSchema, renderFrontmatterNodeView } from './editor-frontmatter.js'
import {
  highlightFeatures,
  highlightStringifyHandler,
  applyHighlightInView,
  HIGHLIGHT_COLORS
} from './editor-highlight.js'
import { keybindingMatchesEvent, keybindingToDisplay } from '../../../shared/keybindings.js'
import { imageBlockMarkdownSchema } from './editor-image-markdown.js'
import { normalizeWebPasteHtml } from './editor-web-paste.js'
import {
  convertListAtSelection,
  getListConversionContext
} from './editor-list-conversion.js'
import { createBlockHandleGutterPlugin } from './editor-block-handle-guard.js'
import { createMathOverflowPlugin } from './editor-math-overflow.js'

// Every mounted rich editor registers itself here. A rich-text tab stays mounted
// after its first activation, so several editors (and several Crepe selection
// toolbars) can coexist. The heading button injected into a toolbar resolves its
// target editor at click time — the one that currently owns the selection —
// instead of capturing a single instance, which previously made the button act
// on the wrong (hidden) tab when more than one tab was open.
const liveEditors = new Set()

// One shared document.body MutationObserver serves every mounted editor's
// toolbar scan. Crepe creates its selection toolbar lazily on selection, so we
// re-scan when nodes are added — but with one observer per editor, N mounted
// tabs meant N body-wide observers all allocating mutation records on every
// edit. The single observer coalesces to one rAF and runs each registered
// scanner (same work as before — injection is idempotent and each editor's
// highlight-active refresh reads its own view), so behavior is unchanged while
// the per-mutation overhead stops scaling with tab count.
const toolbarScanners = new Set()
let sharedToolbarObserver = null
let sharedToolbarRaf = 0
function registerToolbarScanner(scan) {
  toolbarScanners.add(scan)
  if (!sharedToolbarObserver) {
    sharedToolbarObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          if (!sharedToolbarRaf) {
            sharedToolbarRaf = requestAnimationFrame(() => {
              sharedToolbarRaf = 0
              toolbarScanners.forEach((s) => s())
            })
          }
          return
        }
      }
    })
    sharedToolbarObserver.observe(document.body, { childList: true, subtree: true })
  }
  return () => {
    toolbarScanners.delete(scan)
    if (!toolbarScanners.size && sharedToolbarObserver) {
      sharedToolbarObserver.disconnect()
      sharedToolbarObserver = null
      if (sharedToolbarRaf) {
        cancelAnimationFrame(sharedToolbarRaf)
        sharedToolbarRaf = 0
      }
    }
  }
}

// A "Mermaid" entry for the code-block language picker. Mermaid has no real
// CodeMirror language (the diagram is rendered via the code-block preview in
// editor-mermaid.js), so load() returns a no-op language — the picker just needs
// to offer it so users can set a block's language to "mermaid" directly, instead
// of only via the ```mermaid fence info string.
const mermaidLanguage = LanguageDescription.of({
  name: 'Mermaid',
  alias: ['mermaid', 'mmd'],
  extensions: ['mmd', 'mermaid'],
  async load() {
    return new LanguageSupport(StreamLanguage.define(() => ({ token: () => null })))
  }
})

// Localize the image-block / inline-image UI text (caption placeholder, upload
// buttons…) from the current translator. Applied at create and re-applied on a
// language switch so "Write image caption" follows the zh/en toggle.
function applyImageText(ctx, tt) {
  try {
    ctx.update(imageBlockConfig.key, (v) => ({
      ...v,
      captionPlaceholderText: tt('image.caption'),
      uploadPlaceholderText: tt('image.pasteLink'),
      uploadButton: tt('image.uploadFile'),
      confirmButton: tt('image.confirm')
    }))
    ctx.update(inlineImageConfig.key, (v) => ({
      ...v,
      uploadPlaceholderText: tt('image.pasteLink'),
      uploadButton: tt('image.upload'),
      confirmButton: tt('image.confirm')
    }))
  } catch {
    /* config not ready yet — the create-time call covers the initial value */
  }
}

/**
 * WYSIWYG editor (Milkdown Crepe) with Typora-style block-level controls.
 *
 * Ways to change a block's level — all driven through one `setBlock` path:
 *   - Keyboard:        Ctrl+1…6 → headings, Ctrl+0 → paragraph
 *   - Selection toolbar: an "H" button injected into Crepe's bold/italic
 *                        toolbar; hover it to reveal H1 / H2 / H3 / ¶
 *   - Right-click:     context menu with the full list + shortcuts
 *   - Status bar:      always-visible switcher (wired from App via onReady)
 *   - Plus Crepe's built-in slash menu (`/`) and block handle.
 */
function Editor({
  initialContent,
  docPath,
  onChange,
  onReady,
  onActiveBlock,
  onOpenDocLink,
  keybindings,
  selectionToolbar,
  inlineMathDeleteMode,
  readOnly = false
}) {
  const { t } = useI18n()
  const tRef = useRef(t)
  tRef.current = t
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onOpenDocLinkRef = useRef(onOpenDocLink)
  onOpenDocLinkRef.current = onOpenDocLink
  const docPathRef = useRef(docPath)
  docPathRef.current = docPath
  const keybindingsRef = useRef(keybindings)
  keybindingsRef.current = keybindings
  const selectionToolbarRef = useRef(selectionToolbar !== false)
  selectionToolbarRef.current = selectionToolbar !== false
  const inlineMathDeleteModeRef = useRef(inlineMathDeleteMode)
  inlineMathDeleteModeRef.current = inlineMathDeleteMode
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const apiRef = useRef(null)
  const crepeRef = useRef(null)
  const mappingMarkdownRef = useRef(initialContent || '')
  const lastBlockRef = useRef(null)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y } viewport coords, or null
  // Floating "block level" indicator that tracks the caret (H1…H6 / Text).
  const [level, setLevel] = useState(null) // { label, kind, top, left } or null
  // Shared image / Mermaid / display-math zoom lightbox.
  const [lightbox, setLightbox] = useState(null)
  // False until Crepe has parsed and rendered the document — drives the loading
  // skeleton. Only large documents (which actually take a moment to render) show
  // it, so small files never flash a placeholder.
  const [loaded, setLoaded] = useState(false)
  // Below this, docs parse fast enough to create synchronously. At or above it we
  // show a skeleton and defer create past a paint, so opening / switching to a
  // biggish doc shows feedback (and lets a queued click through) before the
  // synchronous ProseMirror parse blocks the main thread.
  const isLargeDoc = (initialContent?.length || 0) > 8000

  useEffect(() => {
    const view = viewRef.current
    if (!view?.dom) return
    try {
      view.setProps({ editable: () => !readOnly })
    } catch {
      return
    }
    view.dom.contentEditable = readOnly ? 'false' : 'true'
    view.dom.setAttribute('aria-readonly', readOnly ? 'true' : 'false')
  }, [readOnly])

  useEffect(() => {
    if (!readOnly) return
    const host = hostRef.current
    if (!host) return
    const stopMutation = (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const onKeyDown = (event) => {
      const key = String(event.key || '')
      const lower = key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'f'].includes(lower)) return
      if (
        key === 'Escape' ||
        key === 'ContextMenu' ||
        /^(Arrow|Home|End|Page)/.test(key)
      ) return
      stopMutation(event)
    }
    const mutationEvents = ['beforeinput', 'paste', 'drop', 'cut']
    mutationEvents.forEach((name) => host.addEventListener(name, stopMutation, true))
    host.addEventListener('keydown', onKeyDown, true)
    return () => {
      mutationEvents.forEach((name) => host.removeEventListener(name, stopMutation, true))
      host.removeEventListener('keydown', onKeyDown, true)
    }
  }, [readOnly])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let ready = false
    let destroyed = false
    let createRaf = 0
    const cleanups = []
    const isMobile = window.api?.platform === 'ios' || window.api?.platform === 'android'

    // Register this editor so a globally-injected toolbar button can find the
    // editor that currently has the selection. Getters read the live refs.
    const self = { host, getView: () => viewRef.current, getApi: () => apiRef.current }
    liveEditors.add(self)
    cleanups.push(() => liveEditors.delete(self))

    // Read an image file as a base64 data: URL — the last-resort persistent src
    // (survives save & reload, unlike a blob: URL) for untitled docs / mobile.
    const fileToDataUrl = (file) =>
      new Promise((resolve) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => resolve(URL.createObjectURL(file))
        r.readAsDataURL(file)
      })

    // Turn a pasted / dropped / picked image file into a *persistable* src so it
    // never dies on reload (the "screenshots lost after save & reopen" bug):
    //   1. saved document → write into ./assets and use a relative path (Typora)
    //   2. untitled doc / mobile / any failure → inline base64 data: URL
    const persistImage = async (file, fromClipboard = false) => {
      const fileName = fromClipboard
        ? uniqueImageName(file.name || 'image.png')
        : file.name || 'image.png'
      if (window.api.saveImage && docPath) {
        // Saved doc → write straight into ./assets, use a relative path.
        try {
          const buf = await file.arrayBuffer()
          const res = await window.api.saveImage(docPath, fileName, new Uint8Array(buf))
          if (res?.ok && res.path) return res.path
        } catch {
          /* fall through */
        }
      } else if (window.api.savePaste) {
        // Unsaved doc → park in the global paste folder and use a file:// path,
        // so it shows as a real path (not a base64 blob); it's relocated into
        // ./assets on first save (Typora-style).
        try {
          const buf = await file.arrayBuffer()
          const res = await window.api.savePaste(fileName, new Uint8Array(buf))
          if (res?.ok && res.url) return res.url
        } catch {
          /* fall through */
        }
      }
      return fileToDataUrl(file)
    }

    // Insert an image at the caret (used by paste / drop of image files). Persists
    // the file first, then drops an inline image node with the resulting src.
    const insertUploadedImage = async (file, fromClipboard = false) => {
      if (readOnlyRef.current) return
      const url = await persistImage(file, fromClipboard)
      const v = viewRef.current
      if (!v || !url) return
      const imgType = v.state.schema.nodes.image
      if (!imgType) return
      const node = imgType.create({ src: url, alt: file.name || '' })
      v.dispatch(v.state.tr.replaceSelectionWith(node, false).scrollIntoView())
    }

    const crepe = new Crepe({
      root: host,
      // Single-line `$$x^2$$` is expanded to the block form Milkdown's LaTeX
      // feature recognizes; code fences / front matter are left untouched.
      defaultValue: normalizeDisplayMath(initialContent || ''),
      features: {
        [CrepeFeature.SelectionTooltip]: !isMobile,
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.CodeMirror]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.InlineCode]: true,
        [CrepeFeature.LinkTooltip]: true,
        // Render LaTeX math ($…$ / $$…$$) via KaTeX. Off by default in Crepe; the
        // KaTeX + latex styles are already bundled through the imported theme CSS.
        [CrepeFeature.Latex]: true,
        // Disable Crepe's virtual cursor: it replaces the native caret with a
        // custom element that reflows text on selection/focus (content jumps),
        // and hides the native caret (invisible in table cells). We use the
        // native caret styled via `caret-color` instead.
        [CrepeFeature.Cursor]: false
      },
      featureConfigs: {
        // Localized empty-block placeholder (replaces Crepe's "Please enter").
        [CrepeFeature.Placeholder]: { text: t('editor.placeholder'), mode: 'block' },
        // Localize the code-block "Copy" button label. (Visual feedback on click
        // is added via a delegated handler below + CSS, since Crepe gives no
        // built-in "Copied!" state.)
        [CrepeFeature.CodeMirror]: {
          copyText: t('code.copy'),
          extensions: [tabAtCursorKeymap],
          // previewToggleText is consumed by the feature to BUILD the toggle
          // button, so it must live in the feature config (not codeBlockConfig)
          // — otherwise the Mermaid Hide/Edit label stays English.
          previewToggleText: (previewOnly) =>
            previewOnly ? t('mermaid.editCode') : t('mermaid.hideCode')
        }
      }
    })

    // Render raw HTML blocks (e.g. <table>…</table>) as actual HTML, like Typora.
    // Milkdown's default `html` node shows the markup as escaped text; we add a
    // ProseMirror node view that renders it instead. Display-only — the node
    // still round-trips through attrs.value, so saving keeps the original HTML.
    //
    // Register through nodeViewCtx (the shared registry Milkdown's $view uses),
    // NOT editorViewOptionsCtx.nodeViews: the core spreads editorViewOptionsCtx
    // LAST into the EditorView constructor, so setting .nodeViews there would
    // overwrite every component node view (image-block captions, CodeMirror code
    // blocks, tables, list items). Appending here merges with them.
    crepe.editor.config((ctx) => {
      disableCrepeSlash(ctx)
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        editable: () => !readOnlyRef.current,
        transformPastedHTML: (html, view) => {
          const transformed = options.transformPastedHTML
            ? options.transformPastedHTML(html, view)
            : html
          return normalizeWebPasteHtml(transformed)
        }
      }))
      ctx.update(nodeViewCtx, (views) => [
        ...views,
        ['html', (node) => renderHtmlNodeView(node)],
        ['frontmatter', (node, view, getPos) => renderFrontmatterNodeView(node, view, getPos, {
          labels: {
            edit: tRef.current('frontmatter.edit'),
            done: tRef.current('frontmatter.done'),
            input: tRef.current('frontmatter.input')
          },
          canEdit: () => !readOnlyRef.current
        })]
      ])
      // Localize the image caption / upload text to the current language.
      applyImageText(ctx, tRef.current)
      // Route the image-block / inline-image "Upload" button through the image
      // host. applyImageText spreads the existing config, so re-applying it on a
      // language switch preserves this onUpload.
      ctx.update(imageBlockConfig.key, (v) => ({
        ...v,
        onUpload: (file) => persistImage(file, false)
      }))
      ctx.update(inlineImageConfig.key, (v) => ({
        ...v,
        onUpload: (file) => persistImage(file, false)
      }))
      // Offer "Mermaid" in the code-block language picker (shown first), and
      // render a ```mermaid block's diagram as the block's "preview" — the same
      // built-in mechanism LaTeX uses: shown by default with the source hidden,
      // with a Hide/Edit toggle in the toolbar next to Copy. Non-mermaid blocks
      // have no preview, so their source always shows. See editor-mermaid.js.
      const renderMermaidPreview = createMermaidPreviewRenderer((k) => tRef.current(k))
      ctx.update(codeBlockConfig.key, (v) => {
        const renderDefaultPreview = v.renderPreview
        return {
          ...v,
          languages: [mermaidLanguage, ...(v.languages || [])],
          renderPreview: (language, text, setPreview) => {
            if (String(language || '').toLowerCase() === 'mermaid') {
              return renderMermaidPreview(language, text, setPreview)
            }
            return renderDefaultPreview?.(language, text, setPreview) ?? null
          },
          previewOnlyByDefault: true,
          previewLabel: t('mermaid.diagram'),
          previewLoading: t('mermaid.rendering')
        }
      })
      ctx.update(prosePluginsCtx, (plugins) => [
        ...plugins,
        // Table-cell line break (issue #7): keymap first so it wins Enter inside a cell.
        tableBreakKeymap(),
        createInlineCodeEditingPlugin(),
        createInlineMathEditingPlugin({
          getDeleteMode: () => inlineMathDeleteModeRef.current || 'protect'
        }),
        createMathBlockPromotionPlugin(),
        createMathOverflowPlugin(),
        createBlockHandleGutterPlugin(),
        mathPreviewPlugin(),
        createSlashPlugin(ctx, (key) => tRef.current(key)),
        // Split a mermaid block that holds 2+ diagrams (e.g. a 2nd paste appended
        // into the same block) back into one block per diagram.
        createMermaidSplitPlugin()
      ])
      // Table-cell line break — serialize a break to <br> inside a cell, and parse
      // inline <br> back into a break (see editor-tablebreak.js).
      ctx.update(remarkStringifyOptionsCtx, (opts) => ({
        ...opts,
        // break → <br> inside a table cell; highlight → ==text== (yellow) or
        // <mark class="hm-hl-…"> (red/blue). See editor-tablebreak / editor-highlight.
        handlers: {
          ...(opts?.handlers || {}),
          break: tableCellBreakHandler,
          highlight: highlightStringifyHandler
        }
      }))
      ctx.update(remarkPluginsCtx, (plugins) => [
        ...plugins,
        // YAML front matter is valid only at the document header. Body `---`
        // separators must stay ordinary Markdown even if a heading follows.
        { plugin: remarkFrontmatter, options: undefined },
        { plugin: brToBreakRemarkPlugin, options: undefined },
        { plugin: remarkRepairNonAsciiAutolinks, options: undefined },
        // Merge balanced inline HTML pairs (<span>…</span>, <sub>…</sub>) into one
        // html node so the node view can render them inline (see editor-html.js).
        { plugin: mergeInlineHtmlRemarkPlugin, options: undefined }
      ])
    })

    // Issue #10: inline code "won't stop". Milkdown's inlineCode mark has no
    // `inclusive` flag, so ProseMirror defaults it to inclusive=true — typing at
    // the RIGHT boundary of `code` keeps inheriting the mark, so text after a
    // closing backtick stays code until you hard-break. Override the mark schema
    // to inclusive:false (the standard code-mark behavior, same as Typora) so the
    // caret exits the code span on the next character. Registered after Crepe's
    // commonmark preset (same id → last registration wins); nothing else about
    // the mark changes, so Markdown round-trips identically.
    crepe.editor.use(
      inlineCodeSchema.extendSchema((prev) => (ctx) => ({ ...prev(ctx), inclusive: false }))
    )
    crepe.editor.use(imageBlockMarkdownSchema)
    // YAML front matter (`---` block at the top) — a block node rendered as a
    // structured key/value card (see editor-frontmatter.js).
    crepe.editor.use(frontmatterSchema)
    // Issue #14: ==highlight== mark (yellow via ==, red/blue via <mark class>) +
    // Mod-Alt-H shortcut. Pass the whole array — editor.use() registers only its
    // first arg, so spreading would drop every feature after the first.
    crepe.editor.use(highlightFeatures)
    // Milkdown's underscore-emphasis input rule lacks the required end anchor;
    // replace it before EditorState is built so escaped literal underscores
    // cannot corrupt a paragraph when Enter is pressed later.
    crepe.editor.use(createSafeUnderscoreEmphasisInputRule())
    crepeRef.current = crepe

    // Convert the block the cursor sits in to a given block id (paragraph/h1…h6).
    const setBlock = (id) => {
      if (readOnlyRef.current) return
      const view = viewRef.current
      if (!view) return
      const def = blockById(id)
      if (!def) return
      convertBlock(view, def.name, def.level ? { level: def.level } : {})
      view.focus()
      reportActiveBlock()
      refreshLevel()
      setCtxMenu(null)
    }
    const convertList = (targetType, listPos) => {
      if (readOnlyRef.current) return false
      const view = viewRef.current
      if (!view) return false
      const converted = convertListAtSelection(view, targetType, listPos)
      if (!converted) return false
      view.focus()
      setCtxMenu(null)
      return true
    }
    const restoreActionSelection = (view, range) => {
      if (!range || !Number.isFinite(range.anchor) || !Number.isFinite(range.head)) return
      try {
        view.dispatch(view.state.tr.setSelection(
          TextSelection.create(view.state.doc, range.anchor, range.head)
        ))
      } catch {
        // The document may have changed between opening and choosing the item.
      }
    }
    const applyTextFormat = (format, range) => {
      if (readOnlyRef.current) return false
      const view = viewRef.current
      if (!view) return false
      restoreActionSelection(view, range)
      if (view.state.selection.empty) return false
      if (format === 'highlight') {
        applyHighlightInView(view, 'yellow')
        return true
      }
      const markNames = {
        bold: ['strong'],
        italic: ['emphasis', 'em'],
        strike: ['strike_through', 'strike'],
        code: ['inlineCode', 'inline_code', 'code'],
        link: ['link']
      }
      const type = markNames[format]
        ?.map((name) => view.state.schema.marks[name])
        .find(Boolean)
      if (!type) return false
      const { from, to } = view.state.selection
      let tr = view.state.tr
      if (view.state.doc.rangeHasMark(from, to, type)) {
        tr = tr.removeMark(from, to, type)
      } else {
        let attrs
        if (format === 'link') {
          const href = window.prompt(tRef.current('editor.linkPrompt'), 'https://')
          if (!href) return false
          attrs = { href }
        }
        tr = tr.addMark(from, to, type.create(attrs))
      }
      view.dispatch(tr.scrollIntoView())
      view.focus()
      return true
    }

    // Push the cursor's current block type up to the parent (status bar).
    const reportActiveBlock = () => {
      const view = viewRef.current
      if (!view) return
      const id = currentBlockId(view.state)
      if (id !== lastBlockRef.current) {
        lastBlockRef.current = id
        onActiveBlock?.(id)
      }
    }

    // Position the floating level badge next to the caret's line. Hidden when
    // the editor isn't focused or the caret has scrolled out of view.
    const refreshLevel = () => {
      const view = viewRef.current
      if (!view || !view.hasFocus()) {
        setLevel(null)
        return
      }
      const sel = view.state.selection
      let coords
      try {
        coords = view.coordsAtPos(sel.from)
      } catch {
        return
      }
      const scrollEl = host.closest('.editor-scroll')
      const r = scrollEl
        ? scrollEl.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight, left: 0 }
      if (coords.bottom < r.top + 2 || coords.top > r.bottom - 2) {
        setLevel(null)
        return
      }
      const id = currentBlockId(view.state)
      const def = blockById(id)
      // Only headings (H1…H6) and plain paragraphs get a badge.
      if (!def) {
        setLevel(null)
        return
      }
      // Anchor to the current block's left edge so the tag sits just beside the
      // text, not floating off at the pane edge.
      let blockLeft = coords.left
      try {
        let el = view.domAtPos(sel.from).node
        if (el && el.nodeType === 3) el = el.parentElement
        const pm = view.dom
        while (el && el !== pm && el.parentElement && el.parentElement !== pm) {
          el = el.parentElement
        }
        if (el && el !== pm) blockLeft = el.getBoundingClientRect().left
      } catch {
        /* fall back to the caret x */
      }
      const kind = id === 'paragraph' ? 'text' : 'heading'
      const label = id === 'paragraph' ? tRef.current('block.paragraph') : def.short
      // The badge's right edge: 10px left of the text. (We used to also nudge it
      // aside for Crepe's hover drag-handle, but that required re-measuring on every
      // mousemove — a per-frame forced reflow that made caret/pointer movement feel
      // laggy. The badge stays visible and correct without it.)
      const badgeRight = blockLeft - 10
      // Sit in the gutter; if the window is too narrow for that, tuck the tag
      // against the pane's left edge instead.
      const align = badgeRight - r.left >= 46 ? 'right' : 'left'
      const x = align === 'right' ? badgeRight : r.left + 6
      setLevel({ label, kind, align, top: (coords.top + coords.bottom) / 2, x })
    }

    // refreshLevel does forced layout reads (coordsAtPos / getBoundingClientRect).
    // Selection change and scroll fire on every keystroke; on a large document
    // that synchronous reflow is the main typing lag AND the main cause of the
    // scroll "chase" (#17) — the main thread is busy reflowing while the
    // compositor piles up scroll frames.
    // Throttle: at most once per 200ms (not per frame). On fast scroll the level
    // badge simply doesn't update until you pause — a fine trade-off vs freezing.
    let levelTimer = 0
    const scheduleLevel = () => {
      if (levelTimer) return
      levelTimer = setTimeout(() => {
        levelTimer = 0
        refreshLevel()
      }, 200)
    }
    cleanups.push(() => {
      if (levelTimer) clearTimeout(levelTimer)
    })

    // Route the host to the Chinese/Japanese stack from the document content.
    // Kana wins over Han so Japanese prose keeps Japanese glyph forms. Kept in
    // sync on every content update.
    const syncDocLang = (md) => {
      const docLang = detectDocLang(md || '')
      if (docLang) host.setAttribute('lang', docLang)
      else host.removeAttribute('lang')
    }
    syncDocLang(initialContent)

    // IMPORTANT: register listeners BEFORE create(). Crepe wires them during
    // create(), so registering afterwards means `markdownUpdated` never fires —
    // which left tab.content (outline, word count, dirty state, and saves!)
    // frozen at the initial value while the editor was actually edited.
    crepe.on((api) => {
      api.markdownUpdated((_ctx, md) => {
        const normalized = normalizeEmptyTableCells(md)
        mappingMarkdownRef.current = normalized
        if (ready) {
          onChange?.(normalized, false)
          syncDocLang(normalized)
        }
      })
    })

    const runCreate = () =>
      crepe
        .create()
        .then(() => {
          if (destroyed) {
            crepe.destroy()
            return
          }

        // Milkdown stores the ProseMirror view in its context — `editor.view`
        // does not exist in this version, which previously left `view`
        // undefined and silently disabled every view-dependent feature.
        let view
        try {
          view = crepe.editor.ctx.get(editorViewCtx)
        } catch {
          view = crepe.editor?.view
        }
        viewRef.current = view

        // Issue #10 (belt-and-suspenders): guarantee the inline-code mark is
        // non-inclusive on the live schema, in case Crepe's plugin order left the
        // extendSchema override (above) ineffective. ResolvedPos.marks() reads
        // `mark.type.spec.inclusive === false` to drop the mark at a span's end,
        // so the caret exits `code` on the next character either way.
        try {
          const icMark = view?.state.schema.marks.inlineCode
          if (icMark && icMark.spec.inclusive !== false) icMark.spec.inclusive = false
        } catch {
          /* schema shape changed — extendSchema override still applies */
        }

        // Typora-theme hooks: most Typora themes target `#write` (the content
        // container) and `.markdown-body`. Tagging the ProseMirror element with
        // both lets a migrated Typora CSS style our editor. (Several editors can
        // be mounted at once, so `id="write"` may repeat — invalid HTML but
        // harmless: CSS `#write` still matches all, and we never getElementById it.)
        if (view?.dom) {
          view.dom.id = 'write'
          view.dom.classList.add('markdown-body')
          view.dom.setAttribute('aria-readonly', readOnlyRef.current ? 'true' : 'false')
          try {
            view.setProps({ editable: () => !readOnlyRef.current })
          } catch {
            /* the view can be tearing down during a rapid tab switch */
          }
          view.dom.contentEditable = readOnlyRef.current ? 'false' : 'true'
        }

        // Content is in the DOM now — remove the loading skeleton SYNCHRONOUSLY
        // (flushSync) so it's gone before the heavy getMarkdown + onChange work
        // below. A plain setState here would be batched and its repaint blocked by
        // that work, leaving the skeleton visibly overlapping the rendered text
        // for hundreds of ms (worse when toggling source↔rich on a big doc).
        flushSync(() => setLoaded(true))

        const onKeydown = (e) => {
          const bindings = keybindingsRef.current || {}
          for (let level = 1; level <= 6; level += 1) {
            if (!keybindingMatchesEvent(
              bindings[`editor.block.h${level}`]?.[0],
              e,
              window.api.platform
            )) continue
            e.preventDefault()
            setBlock(`h${level}`)
            return
          }
          if (keybindingMatchesEvent(
            bindings['editor.block.paragraph']?.[0],
            e,
            window.api.platform
          )) {
            e.preventDefault()
            setBlock('paragraph')
          }
        }

        const onContextMenu = (e) => {
          const tableBlock = e.target.closest?.('.milkdown-table-block')
          const tableWrapper = tableBlock?.querySelector('.table-wrapper')
          const tableScrollLeft = tableWrapper?.scrollLeft
          const tableIndex = tableBlock
            ? [...view.dom.querySelectorAll('.milkdown-table-block')].indexOf(tableBlock)
            : -1
          const restoreTableScroll = () => {
            if (!Number.isFinite(tableScrollLeft) || tableIndex < 0) return
            const nextWrapper = viewRef.current?.dom
              ?.querySelectorAll('.milkdown-table-block')[tableIndex]
              ?.querySelector('.table-wrapper')
            if (nextWrapper) nextWrapper.scrollLeft = tableScrollLeft
          }
          e.preventDefault()
          // Move the caret to the click so the menu acts on the clicked block.
          const v = viewRef.current
          let listConversion = null
          let showTextFormatting = false
          let selection = null
          if (v) {
            const at = v.posAtCoords({ left: e.clientX, top: e.clientY })
            if (at) {
              const positions = [at.pos]
              try {
                positions.push(v.posAtDOM(e.target, 0))
              } catch {
                // Some node-view controls are outside ProseMirror's content DOM.
              }
              const listItem = e.target.closest?.('li')
              if (listItem) {
                try {
                  positions.push(v.posAtDOM(listItem, 0) + 1)
                } catch {
                  // A list node view may refresh during the contextmenu event.
                }
              }
              listConversion = positions
                .map((position) => getListConversionContext(v.state, position))
                .find(Boolean) || null

              const domSelection = v.dom.ownerDocument.getSelection()
              let preservedTextSelection = false
              if (
                domSelection &&
                !domSelection.isCollapsed &&
                v.dom.contains(domSelection.anchorNode) &&
                v.dom.contains(domSelection.focusNode)
              ) {
                try {
                  const anchor = v.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset)
                  const head = v.posAtDOM(domSelection.focusNode, domSelection.focusOffset)
                  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, anchor, head)))
                  preservedTextSelection = true
                } catch {
                  // Fall back to the clicked caret position.
                }
              }
              if (!preservedTextSelection) {
                const $pos = v.state.doc.resolve(at.pos)
                v.dispatch(v.state.tr.setSelection(TextSelection.near($pos)))
              }
              reportActiveBlock()
              showTextFormatting =
                !selectionToolbarRef.current && !v.state.selection.empty
              if (showTextFormatting) {
                selection = {
                  anchor: v.state.selection.anchor,
                  head: v.state.selection.head
                }
              }
            }
          }
          setCtxMenu({
            x: e.clientX,
            y: e.clientY,
            listConversion,
            showTextFormatting,
            selection
          })
          requestAnimationFrame(() => {
            restoreTableScroll()
            requestAnimationFrame(() => {
              restoreTableScroll()
              requestAnimationFrame(restoreTableScroll)
            })
          })
        }

        // Reflect whether the selection is highlighted onto every injected
        // highlight toolbar button (so it shows an active state, like bold does).
        const updateHighlightActive = () => {
          const v = viewRef.current
          let active = false
          if (v && v.hasFocus()) {
            const { from, $from, empty, to } = v.state.selection
            const type = v.state.schema.marks.highlight
            if (type) {
              active = empty
                ? ($from.storedMarks || []).some((m) => m.type === type)
                : v.state.doc.rangeHasMark(from, to, type)
            }
          }
          document
            .querySelectorAll('.milkdown-toolbar .hm-highlight-item')
            .forEach((b) => b.classList.toggle('active', active))
        }

        const onSelChange = () => {
          const v = viewRef.current
          updateHighlightActive()
          if (!v || !v.hasFocus()) return
          reportActiveBlock()
          scheduleLevel()
        }

        if (view) {
          view.dom.addEventListener('keydown', onKeydown)
          cleanups.push(() => view.dom.removeEventListener('keydown', onKeydown))
          if (!isMobile) {
            view.dom.addEventListener('contextmenu', onContextMenu)
            cleanups.push(() => view.dom.removeEventListener('contextmenu', onContextMenu))
          }
          // Show/hide and reposition the level badge with focus and scrolling.
          const onBlur = () => setLevel(null)
          const onFocus = () => refreshLevel()
          view.dom.addEventListener('blur', onBlur)
          view.dom.addEventListener('focus', onFocus)
          cleanups.push(() => view.dom.removeEventListener('blur', onBlur))
          cleanups.push(() => view.dom.removeEventListener('focus', onFocus))
          const scrollEl = host.closest('.editor-scroll')
          if (scrollEl) {
            // Scrolling only moves the caret's on-screen position (the caret
            // itself doesn't move), so the level badge needn't reflow every
            // 200ms mid-scroll. Refresh it ONCE after scrolling settles — this
            // drops the per-tick full-doc reflow that janked large docs (#17).
            // (Typing / selection / mouse-hover still use the leading 200ms
            // scheduleLevel above.)
            let scrollLevelTimer = 0
            const onScroll = () => {
              if (scrollLevelTimer) clearTimeout(scrollLevelTimer)
              scrollLevelTimer = setTimeout(() => {
                scrollLevelTimer = 0
                refreshLevel()
              }, 150)
            }
            scrollEl.addEventListener('scroll', onScroll, { passive: true })
            cleanups.push(() => {
              scrollEl.removeEventListener('scroll', onScroll)
              if (scrollLevelTimer) clearTimeout(scrollLevelTimer)
            })
          }
          // NOTE: no mousemove listener. The badge only needs to reposition on caret
          // move (selectionchange) and scroll; recomputing it on every pointer move
          // meant a forced reflow each frame, which made cursor movement / right-click
          // feel laggy (worst at startup when the main thread is busy).
        }
        document.addEventListener('selectionchange', onSelChange)
        cleanups.push(() => document.removeEventListener('selectionchange', onSelChange))

        // --- Link navigation: Ctrl/Cmd opens web links; Alt opens docs at right ---
        if (view) {
        const onLinkClick = (e) => {
          const a = e.target.closest?.('a')
          const href = a?.getAttribute('href')
          if (!href) return
          if ((e.ctrlKey || e.metaKey) && /^(https?:|mailto:)/i.test(href)) {
            e.preventDefault()
            e.stopPropagation()
            window.api.openExternal(href)
            return
          }
          if (!e.altKey) return
          const target = parseInternalDocLink(href)
          if (!target) return
          e.preventDefault()
          e.stopPropagation()
          onOpenDocLinkRef.current?.(
            target.path,
            target.anchor,
            docPathRef.current,
            { openRight: true }
          )
        }
        const onLinkHover = (e) => {
          const a = e.target.closest?.('a[href]')
          if (!a || !view.dom.contains(a)) return
          const target = internalLinkTarget(a.getAttribute('href'), docPathRef.current)
          if (!target?.label) return
          a.title = `${tRef.current('links.hoverTarget', { target: target.label })}\n${tRef.current('links.openRightHint')}`
        }

        // --- Rich-text copy: inject inline styles into the HTML clipboard ---
        const onCopy = (e) => {
          const sel = window.getSelection()
          if (!sel || sel.isCollapsed || !view.dom.contains(sel.anchorNode)) return
          // Let CodeMirror code blocks handle their own copy.
          if (sel.anchorNode?.parentElement?.closest?.('.cm-editor')) return
          try {
            const frag = sel.getRangeAt(0).cloneContents()
            const wrap = document.createElement('div')
            wrap.appendChild(frag)
            materializeCopiedSoftBreaks(wrap)
            const plain = copiedPlainText(wrap, sel.toString())
            inlineRichStyles(wrap)
            // If the selection produced nothing meaningful (e.g. anchored in a
            // non-editable rendered HTML block), don't hijack the copy with an
            // empty payload — let the browser's default copy run.
            if (!wrap.innerHTML.trim() && !plain) return
            e.clipboardData.setData(
              'text/html',
              `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#24292f;">${wrap.innerHTML}</div>`
            )
            e.clipboardData.setData('text/plain', plain)
            e.preventDefault()
          } catch {
            /* fall back to default copy */
          }
        }

        // --- Paste / drop an image file → persist it, then insert ---
        // ProseMirror/Crepe doesn't ingest pasted or dropped image *files* by
        // default (and its own handling would yield a blob: URL that dies on
        // reload). We intercept image files and route them through persistImage:
        // image host if configured, else a local ./assets file (saved docs), else
        // an inline data: URL — so a pasted screenshot survives save & reopen.
        // Pasted/dropped text and HTML are left to the editor's own paste. Never
        // hijack a paste/drop inside a code block (CodeMirror) or input — replacing
        // the ProseMirror node selection there would clobber the block.
        const imageHandlingActive = (e) =>
          !e.target.closest?.('.cm-editor, input, textarea, .caption-input')
        const onPasteImage = (e) => {
          if (readOnlyRef.current) return
          if (!imageHandlingActive(e)) return
          const items = e.clipboardData?.items
          if (!items) return
          const imgItem = [...items].find(
            (it) => it.kind === 'file' && it.type.startsWith('image/')
          )
          if (!imgItem) return
          const file = imgItem.getAsFile()
          if (!file) return
          e.preventDefault()
          e.stopImmediatePropagation()
          insertUploadedImage(file, true)
        }
        const onDropImage = (e) => {
          if (readOnlyRef.current) return
          if (!imageHandlingActive(e)) return
          const files = [...(e.dataTransfer?.files || [])].filter((f) =>
            f.type.startsWith('image/')
          )
          if (!files.length) return
          e.preventDefault()
          e.stopImmediatePropagation()
          // Move the caret to the drop point before inserting.
          const at = view.posAtCoords({ left: e.clientX, top: e.clientY })
          if (at) {
            const $pos = view.state.doc.resolve(at.pos)
            view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)))
          }
          files.forEach((file) => insertUploadedImage(file, false))
        }

        // --- Double-click an image → open it enlarged in a lightbox ---
        // Display-only: opens an overlay, never changes the document. We detect
        // the double-click ourselves (two clicks on the same image within 350ms)
        // instead of relying on the native `dblclick` event: the image-block
        // component re-renders when the first click selects it, so the two
        // physical clicks can land on different DOM nodes and no `dblclick`
        // fires. A single click is left untouched so Crepe's native image
        // interaction (select + caption editing) keeps working.
        let lastImgClick = { src: null, at: 0 }
        const onImgClick = (e) => {
          if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
          // Never treat clicks on the image-block's controls as image clicks:
          // the caption input, the caption/operation button, and the resize
          // handle must keep their own behavior (typing, toggling, resizing).
          if (
            e.target.closest?.(
              '.caption-input, .operation, .operation-item, .image-resize-handle, button, input, textarea'
            )
          )
            return
          // Match the image body itself — directly, or via the wrapper, so a
          // click still lands on the image even when it's selected and a
          // transparent overlay sits on top of it.
          const img = e.target.closest?.('img') || e.target.closest?.('.image-wrapper')?.querySelector?.('img')
          if (!img || !view.dom.contains(img)) return
          const src = img.currentSrc || img.getAttribute('src')
          if (!src) return
          const now = e.timeStamp || Date.now()
          if (lastImgClick.src === src && now - lastImgClick.at < 350) {
            e.preventDefault()
            setLightbox({ kind: 'image', src, trigger: img })
            lastImgClick = { src: null, at: 0 }
          } else {
            lastImgClick = { src, at: now }
          }
        }

        // When the caption (operation) button is clicked, focus the caption
        // input the component reveals so the user can type the caption straight
        // away — otherwise focus stays in the editor and typing hits the body.
        const onCaptionBtn = (e) => {
          const op = e.target.closest?.('.milkdown-image-block .operation-item')
          if (!op) return
          const block = op.closest('.milkdown-image-block')
          let tries = 0
          const tryFocus = () => {
            if (destroyed) return
            const input = block?.querySelector('input.caption-input')
            if (input) {
              input.focus()
            } else if (tries++ < 12) {
              setTimeout(tryFocus, 30)
            }
          }
          setTimeout(tryFocus, 0)
        }

        // --- Code-block "Copy" button → flash the button + show a toast ---
        // Crepe copies to the clipboard itself but gives no visible feedback, so
        // a click feels unresponsive. We add a transient .hm-copied class (CSS
        // turns the label green with a ✓) and fire a global toast.
        const onCopyBtn = async (e) => {
          const btn = e.target.closest?.('.copy-button')
          if (!btn || !view.dom.contains(btn)) return
          const block = btn.closest('.milkdown-code-block')
          const source = readCodeBlockSource(view, block)
          if (!block || source === '') return
          e.preventDefault()
          e.stopImmediatePropagation()
          if (!await copyToClipboard(source, tRef.current('code.copied'))) return
          btn.classList.add('hm-copied')
          setTimeout(() => btn.classList.remove('hm-copied'), 1100)
        }

        let taskFlushTimer = 0
        const flushLiveMarkdown = () => {
          try {
            const serialized = normalizeEmptyTableCells(
              crepe.editor.ctx.get(serializerCtx)(view.state.doc)
            )
            mappingMarkdownRef.current = serialized
            onChangeRef.current?.(serialized, false)
            syncDocLang(serialized)
            return serialized
          } catch {
            return null
          }
        }
        const onTaskPointerDown = (e) => {
          if (!e.target.closest?.('.label-wrapper, input[type="checkbox"]')) return
          clearTimeout(taskFlushTimer)
          taskFlushTimer = setTimeout(flushLiveMarkdown, 0)
        }
        const onMermaidCodeInput = (e) => {
          const block = e.target.closest?.('.milkdown-code-block')
          if (!block) return
          setTimeout(() => refreshMermaidPreviewFromCodeBlock(block, view), 0)
        }

        const onEmbedZoom = (e) => {
          const button = e.target.closest?.('.hm-embed-zoom')
          if (!button || !view.dom.contains(button)) return
          const item = zoomItemFromButton(button)
          if (!item) return
          e.preventDefault()
          e.stopPropagation()
          setLightbox(item)
        }

        let embedRaf = 0
        const scanEmbeds = () => ensureEmbedZoomButtons(view.dom, (key) => tRef.current(key))
        const embedObserver = new MutationObserver((mutations) => {
          if (!mutations.some((mutation) => mutation.addedNodes.length)) return
          if (!embedRaf) {
            embedRaf = requestAnimationFrame(() => {
              embedRaf = 0
              scanEmbeds()
            })
          }
        })
        embedObserver.observe(view.dom, { childList: true, subtree: true })
        scanEmbeds()

        view.dom.addEventListener('click', onLinkClick, true)
        view.dom.addEventListener('mouseover', onLinkHover)
        view.dom.addEventListener('click', onImgClick, true)
        view.dom.addEventListener('click', onEmbedZoom, true)
        view.dom.addEventListener('click', onCaptionBtn)
        view.dom.addEventListener('click', onCopyBtn, true)
        view.dom.addEventListener('pointerdown', onTaskPointerDown, true)
        view.dom.addEventListener('input', onMermaidCodeInput, true)
        view.dom.addEventListener('copy', onCopy, true)
        view.dom.addEventListener('paste', onPasteImage, true)
        view.dom.addEventListener('drop', onDropImage, true)
        cleanups.push(() => view.dom.removeEventListener('click', onLinkClick, true))
        cleanups.push(() => view.dom.removeEventListener('mouseover', onLinkHover))
        cleanups.push(() => view.dom.removeEventListener('click', onImgClick, true))
        cleanups.push(() => view.dom.removeEventListener('click', onEmbedZoom, true))
        cleanups.push(() => view.dom.removeEventListener('click', onCaptionBtn))
        cleanups.push(() => view.dom.removeEventListener('click', onCopyBtn, true))
        cleanups.push(() => view.dom.removeEventListener('pointerdown', onTaskPointerDown, true))
        cleanups.push(() => view.dom.removeEventListener('input', onMermaidCodeInput, true))
        cleanups.push(() => view.dom.removeEventListener('copy', onCopy, true))
        cleanups.push(() => view.dom.removeEventListener('paste', onPasteImage, true))
        cleanups.push(() => view.dom.removeEventListener('drop', onDropImage, true))
        cleanups.push(() => {
          clearTimeout(taskFlushTimer)
          embedObserver.disconnect()
          if (embedRaf) cancelAnimationFrame(embedRaf)
        })
        // Markdown paste (capture phase — runs before ProseMirror's handler so
        // text/html doesn't bypass us). Parses pasted Markdown source via
        // Milkdown's own remark pipeline. See editor-md-paste.js.
        cleanups.push(
          attachMdPasteHandler(view, (md) => {
            try {
              // parserCtx is a FUNCTION (text) => Doc (ParserState.create returns
              // a closure). Call it directly — it runs the full remark pipeline.
              return crepe.editor.ctx.get(parserCtx)(md)
            } catch {
              return null
            }
          }, () => !readOnlyRef.current)
        )

        // --- Resolve relative image paths against the file's folder ---
        const baseDir = dirOf(docPath)
        if (baseDir) {
          const fixImg = (img) => {
            if (img.dataset.hmResolved) return
            const raw = img.getAttribute('src') || ''
            if (!isRelativePath(raw)) return
            img.dataset.hmResolved = '1'
            img.setAttribute('src', resolveToFileUrl(baseDir, raw))
          }
          const scanImgs = (root) => {
            if (root.tagName === 'IMG') fixImg(root)
            else root.querySelectorAll?.('img').forEach(fixImg)
          }
          scanImgs(view.dom)
          const imgObserver = new MutationObserver((muts) => {
            for (const m of muts) {
              if (m.type === 'attributes' && m.target.tagName === 'IMG') fixImg(m.target)
              m.addedNodes?.forEach((n) => {
                if (n.nodeType === 1) scanImgs(n)
              })
            }
          })
          imgObserver.observe(view.dom, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
          })
          cleanups.push(() => imgObserver.disconnect())
        }

        // --- Inject a heading-level button into Crepe's selection toolbar ---
        // Crepe's toolbar (bold/italic/strike…) has no submenu support, so we
        // append our own "H" item; hovering it reveals H1…H6 / ¶.
        const HEAD_DEFS = [
          ['h1', 'H1', 'Ctrl+1'],
          ['h2', 'H2', 'Ctrl+2'],
          ['h3', 'H3', 'Ctrl+3'],
          ['h4', 'H4', 'Ctrl+4'],
          ['h5', 'H5', 'Ctrl+5'],
          ['h6', 'H6', 'Ctrl+6'],
          ['paragraph', '¶', 'Ctrl+0']
        ]
        const injectHeadingButton = (toolbar) => {
          if (toolbar.querySelector('.hm-heading-item')) return
          const divider = document.createElement('div')
          divider.className = 'divider hm-heading-divider'

          const item = document.createElement('div')
          item.className = 'toolbar-item hm-heading-item'
          item.setAttribute('role', 'button')
          item.title = tRef.current('tip.changeBlock')
          item.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/></svg>'

          const pop = document.createElement('div')
          pop.className = 'hm-heading-pop'
          const inner = document.createElement('div')
          inner.className = 'hm-heading-pop-inner'
          for (const [id, label, tip] of HEAD_DEFS) {
            const b = document.createElement('button')
            b.type = 'button'
            b.textContent = label
            b.title = `${tRef.current('block.' + id)} (${tip})`
            b.addEventListener('mousedown', (e) => {
              e.preventDefault()
              e.stopPropagation()
            })
            b.addEventListener('click', (e) => {
              e.preventDefault()
              e.stopPropagation()
              // Act on the editor that owns this toolbar's selection — the
              // focused one — not whichever instance injected the button.
              const target =
                [...liveEditors].find((ed) => ed.getView()?.hasFocus()) ||
                [...liveEditors].find((ed) => ed.host.contains(toolbar)) ||
                self
              target.getApi()?.setBlock(id)
            })
            inner.appendChild(b)
          }
          pop.appendChild(inner)
          item.appendChild(pop)
          item.addEventListener('mousedown', (e) => e.preventDefault()) // keep selection
          toolbar.appendChild(divider)
          toolbar.appendChild(item)
        }

        // Highlight color picker (issue #14): hover the highlighter reveals
        // yellow / red / blue swatches. Same selection-toolbar injection as the
        // heading button, and routes to the focused editor's view.
        const injectHighlightButton = (toolbar) => {
          if (toolbar.querySelector('.hm-highlight-item')) return
          const item = document.createElement('div')
          item.className = 'toolbar-item hm-highlight-item'
          item.setAttribute('role', 'button')
          item.title = tRef.current('tb.highlight')
          item.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l-1 4 4-1L19 8l-3-3z"/><path d="M14 5l3 3"/><rect x="3" y="20" width="18" height="2" rx="1" fill="currentColor" stroke="none"/></svg>'
          const pop = document.createElement('div')
          pop.className = 'hm-highlight-pop'
          const inner = document.createElement('div')
          inner.className = 'hm-highlight-pop-inner'
          for (const color of HIGHLIGHT_COLORS) {
            const sw = document.createElement('button')
            sw.type = 'button'
            sw.className = 'hm-hl-swatch hm-hl-' + color
            sw.title = tRef.current('tb.highlightColor.' + color)
            sw.addEventListener('mousedown', (e) => {
              e.preventDefault()
              e.stopPropagation()
            })
            sw.addEventListener('click', (e) => {
              e.preventDefault()
              e.stopPropagation()
              const target =
                [...liveEditors].find((ed) => ed.getView()?.hasFocus()) ||
                [...liveEditors].find((ed) => ed.host.contains(toolbar)) ||
                self
              const v = target.getView?.()
              if (v) applyHighlightInView(v, color)
            })
            inner.appendChild(sw)
          }
          pop.appendChild(inner)
          item.appendChild(pop)
          item.addEventListener('mousedown', (e) => e.preventDefault()) // keep selection
          toolbar.appendChild(item)
        }

        // Inject synchronously (no requestAnimationFrame — it's throttled when
        // the window is occluded, which would skip injection). The scan is cheap
        // and injectHeadingButton early-returns once the button is present.
        // Scan globally because Crepe may render its toolbar outside `host`; the
        // button routes its click to the focused editor (see the click handler),
        // so it doesn't matter which instance injected it.
        // Crepe's toolbar buttons carry no label/identifier in the DOM, so we
        // add tooltips by their fixed order: bold, italic, strikethrough, inline
        // code, link. (Our injected heading button is excluded and titled above.)
        const addToolbarTitles = (toolbar) => {
          const tips = [
            tRef.current('tb.bold'),
            tRef.current('tb.italic'),
            tRef.current('tb.strike'),
            tRef.current('tb.code'),
            tRef.current('tb.link')
          ]
          toolbar
            .querySelectorAll('.toolbar-item:not(.hm-heading-item):not(.hm-highlight-item)')
            .forEach((btn, i) => {
              if (tips[i] && btn.title !== tips[i]) btn.title = tips[i]
            })
        }
        const scanToolbars = () => {
          document.querySelectorAll('.milkdown-toolbar').forEach((tb) => {
            injectHeadingButton(tb)
            injectHighlightButton(tb)
            addToolbarTitles(tb)
          })
          updateHighlightActive()
        }
        if (!isMobile) {
          scanToolbars()
          // Re-scan when nodes are added (the toolbar is created on selection) —
          // via the module-level shared observer, so N mounted editors cost one
          // body observer instead of N (see registerToolbarScanner above).
          cleanups.push(registerToolbarScanner(scanToolbars))
        }

        // Clicking the visible writing area below the final rich block should
        // continue the document, even when the centered page itself ends above
        // the pointer. Reuse an existing trailing empty paragraph or append one.
        const blankScrollEl = host.closest('.editor-scroll')
        const onBlankAreaMouseDown = (event) => {
          if (readOnlyRef.current) return
          if (
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey
          ) return
          if (event.target.closest?.('button, input, textarea, select, a')) return
          const nestedEditable = event.target.closest?.('[contenteditable="true"]')
          if (nestedEditable && nestedEditable !== view.dom) return
          const lastBlock = view.dom.lastElementChild
          const contentBottom =
            lastBlock?.getBoundingClientRect().bottom ??
            view.dom.getBoundingClientRect().top
          if (event.clientY <= contentBottom + 1) return
          if (blankScrollEl) {
            const rect = blankScrollEl.getBoundingClientRect()
            const scrollbarWidth = blankScrollEl.offsetWidth - blankScrollEl.clientWidth
            if (scrollbarWidth > 0 && event.clientX >= rect.right - scrollbarWidth) return
          }

          event.preventDefault()
          const paragraphType = view.state.schema.nodes.paragraph
          const trailingNode = view.state.doc.lastChild
          const hasEmpty =
            trailingNode?.type === paragraphType && trailingNode.content.size === 0
          let tr = view.state.tr
          if (paragraphType && !hasEmpty) {
            tr = tr.insert(view.state.doc.content.size, paragraphType.create())
          }
          view.dispatch(tr.setSelection(TextSelection.atEnd(tr.doc)).scrollIntoView())
          view.focus()
          reportActiveBlock()
        }
        ;(blankScrollEl || host).addEventListener('mousedown', onBlankAreaMouseDown)
        cleanups.push(() =>
          (blankScrollEl || host).removeEventListener('mousedown', onBlankAreaMouseDown)
        )
        }

        // Typora-style new document: first line is an empty Heading 1 (title),
        // with an empty paragraph below it. The title is there if you want it,
        // but the body block lets you skip the title and start writing straight
        // away (click it or press ↓). Done before the baseline below so the new
        // tab isn't marked dirty.
        if (view) {
          const { state } = view
          const doc = state.doc
          const first = doc.firstChild
          const headingType = state.schema.nodes.heading
          const paragraphType = state.schema.nodes.paragraph
          if (
            headingType &&
            paragraphType &&
            doc.childCount === 1 &&
            first &&
            first.type.name === 'paragraph' &&
            first.content.size === 0
          ) {
            let tr = state.tr.setNodeMarkup(0, headingType, { level: 1 })
            tr = tr.insert(tr.doc.content.size, paragraphType.create())
            // Leave the cursor in the title; the body paragraph is one ↓ / click away.
            tr = tr.setSelection(TextSelection.create(tr.doc, 1))
            view.dispatch(tr)
          }
        }

        // Produce a clean, inline-styled HTML snapshot of the whole document
        // for PDF export (reuses the rich-copy styling; flattens CodeMirror code
        // blocks to plain <pre><code> so they render predictably).
        const getDocHTML = async () => {
          const v = viewRef.current
          if (!v) return ''
          const snapshot = await createEditorSnapshot(v)
          if (typeof snapshot === 'string') return snapshot
          return ''
        }
        const serializeCurrentDocument = () => {
          try {
            const v = viewRef.current
            if (v) {
              return normalizeEmptyTableCells(
                crepe.editor.ctx.get(serializerCtx)(v.state.doc)
              )
            }
          } catch {
            // Fall through to Crepe's cached snapshot during teardown.
          }
          try {
            return normalizeEmptyTableCells(crepe.getMarkdown())
          } catch {
            return ''
          }
        }
        const getMarkdown = () => serializeCurrentDocument()
        const flushMarkdown = ({ force = false } = {}) => {
          if (destroyed || !crepeRef.current) return null
          const serialized = serializeCurrentDocument()
          if (!force && serialized === mappingMarkdownRef.current) return mappingMarkdownRef.current
          mappingMarkdownRef.current = serialized
          return serialized
        }
        const replaceMarkdown = (markdown) => {
          if (destroyed || readOnlyRef.current || !crepeRef.current) return false
          try {
            const next = normalizeDisplayMath(markdown || '')
            mappingMarkdownRef.current = next
            crepe.editor.action(replaceAll(next))
            return true
          } catch (error) {
            console.error('Replace markdown failed', error)
            return false
          }
        }
        const markdownOffsetFromSelection = () => {
          const v = viewRef.current
          if (!v || !crepeRef.current) return null
          try {
            const remark = crepe.editor.ctx.get(remarkCtx)
            return pmPosToMarkdownOffset(
              mappingMarkdownRef.current || getMarkdown(),
              v.state.selection.head,
              v.state.doc,
              remark
            )
          } catch {
            return null
          }
        }
        const markdownOffsetFromViewportTop = () => {
          const v = viewRef.current
          const scroller = v?.dom.closest('.editor-scroll')
          if (!v || !scroller || !crepeRef.current) return null
          try {
            const rect = scroller.getBoundingClientRect()
            const editorRect = v.dom.getBoundingClientRect()
            const coords = {
              left: editorRect.left + Math.min(editorRect.width / 2, 320),
              top: Math.max(rect.top + 12, editorRect.top + 1)
            }
            const mapped = v.posAtCoords(coords)
            let pos = mapped?.pos
            if (!Number.isFinite(pos)) {
              const point = v.dom.ownerDocument.caretPositionFromPoint?.(coords.left, coords.top)
              if (!point || !v.dom.contains(point.offsetNode)) return null
              pos = v.posAtDOM(point.offsetNode, point.offset)
            }
            const remark = crepe.editor.ctx.get(remarkCtx)
            return pmPosToMarkdownOffset(
              mappingMarkdownRef.current || getMarkdown(),
              pos,
              v.state.doc,
              remark
            )
          } catch {
            return null
          }
        }
        const restoreMarkdownOffset = (rawOffset, follow = false) => {
          const v = viewRef.current
          if (!v || !crepeRef.current) return false
          try {
            const remark = crepe.editor.ctx.get(remarkCtx)
            const target = markdownOffsetToPmPos(
              mappingMarkdownRef.current || getMarkdown(),
              rawOffset,
              v.state.doc,
              remark
            )
            const pos = typeof target === 'number' ? target : target?.pos
            if (!Number.isFinite(pos)) return false
            const size = v.state.doc.content.size
            const safePos = Math.max(0, Math.min(pos, size))
            let selection
            if (target?.atom) {
              try {
                selection = NodeSelection.create(v.state.doc, Math.min(safePos, Math.max(0, size - 1)))
              } catch {
                selection = TextSelection.near(v.state.doc.resolve(Math.max(0, safePos)))
              }
            } else {
              selection = TextSelection.near(v.state.doc.resolve(Math.max(0, safePos)))
            }
            let tr = v.state.tr.setSelection(selection)
            if (follow) tr = tr.scrollIntoView()
            v.dispatch(tr)
            if (follow) v.focus()
            if (!follow) {
              const scroller = v.dom.closest('.editor-scroll')
              const dom = v.domAtPos(v.state.selection.head)
              const node = dom.node.nodeType === Node.TEXT_NODE ? dom.node.parentElement : dom.node
              const sr = scroller?.getBoundingClientRect()
              const nr = node?.getBoundingClientRect?.()
              if (scroller && sr && nr) scroller.scrollTop += nr.top - sr.top
            }
            return true
          } catch {
            return false
          }
        }
        const isSelectionVisible = () => {
          const v = viewRef.current
          const scroller = v?.dom.closest('.editor-scroll')
          if (!v || !scroller) return false
          try {
            const coords = v.coordsAtPos(v.state.selection.head)
            const rect = scroller.getBoundingClientRect()
            return coords.bottom >= rect.top + 8 && coords.top <= rect.bottom - 8
          } catch {
            return false
          }
        }
        const insertMarkdown = (markdown) => {
          if (readOnlyRef.current) return false
          const v = viewRef.current
          if (!v || !crepeRef.current) return false
          try {
            const current = mappingMarkdownRef.current || getMarkdown()
            const remark = crepe.editor.ctx.get(remarkCtx)
            const from = pmPosToMarkdownOffset(current, v.state.selection.from, v.state.doc, remark)
            const to = pmPosToMarkdownOffset(current, v.state.selection.to, v.state.doc, remark)
            const start = Number.isFinite(from) ? from : current.length
            const end = Number.isFinite(to) ? to : start
            const insert = String(markdown ?? '')
            if (!replaceMarkdown(current.slice(0, start) + insert + current.slice(end))) return false
            requestAnimationFrame(() => restoreMarkdownOffset(start + insert.length, true))
            return true
          } catch {
            return false
          }
        }
        const editorApi = {
          setBlock,
          convertList,
          applyTextFormat,
          getView: () => viewRef.current,
          getDocHTML,
          getPdfSource: () => createEditorSnapshot(viewRef.current, { stageImages: true }),
          getMarkdown,
          flushMarkdown,
          getScroller: () => viewRef.current?.dom.closest('.editor-scroll') || null,
          replaceMarkdown,
          insertMarkdown,
          markdownOffsetFromSelection,
          markdownOffsetFromViewportTop,
          restoreMarkdownOffset,
          isSelectionVisible
        }
        apiRef.current = editorApi
        onReady?.(editorApi)

        // Compute the initial markdown snapshot (content baseline for dirty
        // tracking / outline / word count). On a big doc serializing the whole
        // document is non-trivial, so for large docs defer it past a paint —
        // setLoaded(true) above has already cleared the skeleton, so this runs
        // after the rendered content is on screen instead of holding it back.
        const finishInitial = () => {
          if (destroyed) return
          const md = normalizeEmptyTableCells(crepe.getMarkdown())
          onChange?.(md, true)
          ready = true
          reportActiveBlock()
        }
        if (isLargeDoc) {
          requestAnimationFrame(() => requestAnimationFrame(finishInitial))
        } else {
          finishInitial()
        }
      })
      .catch((err) => console.error('Crepe init failed', err))

    // For large docs, defer create() past a paint so the loading skeleton is
    // actually shown before create() blocks the main thread parsing/rendering —
    // otherwise switching to (or first opening) a big tab freezes on the
    // previous view with no feedback. Small docs create immediately.
    if (isLargeDoc) {
      createRaf = requestAnimationFrame(() => {
        createRaf = requestAnimationFrame(() => {
          if (!destroyed) runCreate()
        })
      })
    } else {
      runCreate()
    }

    return () => {
      destroyed = true
      if (createRaf) cancelAnimationFrame(createRaf)
      cleanups.forEach((fn) => {
        try {
          fn()
        } catch {
          /* ignore */
        }
      })
      viewRef.current = null
      crepeRef.current = null
      try {
        crepe.destroy()
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-localize the image caption / upload text when the language changes. The
  // editor isn't re-created, so we (1) update the config for images rendered
  // later, and (2) patch the placeholder on any caption inputs already in the
  // DOM — the image-block component caches the config and won't re-read it.
  useEffect(() => {
    const crepe = crepeRef.current
    if (crepe) {
      try {
        crepe.editor.action((ctx) => applyImageText(ctx, t))
      } catch {
        /* editor not ready yet */
      }
    }
    const root = hostRef.current
    if (root) {
      root.querySelectorAll('input.caption-input').forEach((inp) => {
        inp.placeholder = t('image.caption')
      })
    }
  }, [t])

  // The floating bar and context menu reuse the same conversion path as the
  // keyboard shortcuts (defined inside the effect, reached through apiRef).
  const pickBlock = (id) => apiRef.current?.setBlock(id)
  const pickListConversion = (targetType, listPos) =>
    apiRef.current?.convertList(targetType, listPos)
  const pickTextFormat = (format, selection) => {
    const applied = apiRef.current?.applyTextFormat(format, selection)
    if (applied) setCtxMenu(null)
  }
  const blockShortcut = (id) =>
    keybindingToDisplay(
      keybindings?.[`editor.block.${id}`]?.[0],
      window.api.platform
    )

  return (
    <>
      {/* Placeholder text is baked into the Crepe editor at create() and won't
          follow a language switch. Expose the current translation as a CSS var
          (re-rendered on lang change) and let CSS prefer it over the editor's
          static data-placeholder. */}
      <div
        className={`editor-host${readOnly ? ' hm-read-only' : ''}`}
        ref={hostRef}
        style={{ '--hm-placeholder': JSON.stringify(t('editor.placeholder')) }}
      />

      {/* Loading skeleton — pulsing gray bars shown while a large document is
          still parsing/rendering. Gated on document size so small files (which
          load instantly) never flash a placeholder. */}
      {!loaded && isLargeDoc && (
        <div className="editor-skeleton" aria-hidden="true">
          <div className="skel-line skel-title" />
          <div className="skel-line" style={{ width: '94%' }} />
          <div className="skel-line" style={{ width: '99%' }} />
          <div className="skel-line" style={{ width: '86%' }} />
          <div className="skel-line skel-gap" style={{ width: '64%' }} />
          <div className="skel-line" style={{ width: '97%' }} />
          <div className="skel-line" style={{ width: '90%' }} />
          <div className="skel-line" style={{ width: '72%' }} />
          <div className="skel-line skel-gap" style={{ width: '50%' }} />
          <div className="skel-line" style={{ width: '93%' }} />
          <div className="skel-line" style={{ width: '80%' }} />
        </div>
      )}

      {level && (
        <div
          className={`hm-level-badge hm-level-${level.kind} align-${level.align}`}
          style={{ top: level.top, left: level.x }}
          aria-hidden="true"
        >
          {level.label}
        </div>
      )}

      {ctxMenu && (
        <>
          <div className="menu-backdrop" onMouseDown={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <div className={`block-ctxmenu${ctxMenu.x > window.innerWidth - 410 ? ' block-ctxmenu-submenus-left' : ''}`} style={{
            left: Math.min(ctxMenu.x, window.innerWidth - 210),
            top: Math.max(8, Math.min(ctxMenu.y, window.innerHeight - 360))
          }}>
            {ctxMenu.showTextFormatting && (
              <>
                <div className="block-menu-submenu-parent">
                  <button className="block-menu-item block-menu-submenu-trigger" aria-haspopup="menu">
                    <span className="block-menu-short">Aa</span>
                    <span className="block-menu-name">{t('editor.textFormatting')}</span>
                    <span className="block-menu-arrow" aria-hidden="true">›</span>
                  </button>
                  <div className="block-menu-submenu" role="menu">
                    {[
                      ['bold', 'tb.bold', 'B'],
                      ['italic', 'tb.italic', 'I'],
                      ['strike', 'tb.strike', 'S'],
                      ['code', 'tb.code', '</>'],
                      ['link', 'tb.link', '↗'],
                      ['highlight', 'tb.highlight', '▰']
                    ].map(([format, labelKey, symbol]) => (
                      <button
                        key={format}
                        className="block-menu-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickTextFormat(format, ctxMenu.selection)}
                      >
                        <span className="block-menu-short">{symbol}</span>
                        <span className="block-menu-name">{t(labelKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="block-menu-divider" />
              </>
            )}
            {!ctxMenu.listConversion ? (
              <div className="block-menu-submenu-parent">
                <button className="block-menu-item block-menu-submenu-trigger" aria-haspopup="menu">
                  <span className="block-menu-short">H</span>
                  <span className="block-menu-name">{t('block.turnInto')}</span>
                  <span className="block-menu-arrow" aria-hidden="true">›</span>
                </button>
                <div className="block-menu-submenu" role="menu">
                  {BLOCK_TYPES.map((b) => (
                    <button key={b.id} className="block-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pickBlock(b.id)}>
                      <span className="block-menu-short">{b.short}</span>
                      <span className="block-menu-name">{t('block.' + b.id)}</span>
                      <span className="block-menu-sc">{blockShortcut(b.id)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="block-menu-submenu-parent">
                <button className="block-menu-item block-menu-submenu-trigger" aria-haspopup="menu">
                  <span className="block-menu-short">☷</span>
                  <span className="block-menu-name">{t('list.convert')}</span>
                  <span className="block-menu-arrow" aria-hidden="true">›</span>
                </button>
                <div className="block-menu-submenu" role="menu">
                  {ctxMenu.listConversion.actions.map((action) => (
                    <button
                      key={action.targetType}
                      className="block-menu-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickListConversion(
                        action.targetType,
                        ctxMenu.listConversion.listPos
                      )}
                    >
                      <span className="block-menu-short">
                        {action.targetType === 'ordered_list'
                          ? '1.'
                          : action.targetType === 'task_list' ? '☐' : '•'}
                      </span>
                      <span className="block-menu-name">
                        {t(`list.convertTo.${action.targetType}`)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <ZoomLightbox item={lightbox} onClose={() => setLightbox(null)} t={t} />
    </>
  )
}

// Memoized (shallow): hidden-but-mounted Milkdown tabs skip re-rendering while
// another tab's content changes. The active tab still re-renders per keystroke
// (initialContent prop changes) — its render body is cheap; the heavy work all
// lives in mount-once effects.
export default memo(Editor)
