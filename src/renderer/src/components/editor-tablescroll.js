// Keep-mode wide-table affordances.
//
// Per rendered `.km-table-wrap` we add:
//   (1) a compact table toolbar (auto-fit + hidden-column recovery);
//   (2) draggable column edges, with double-click / keyboard auto-fit;
//   (3) a synced horizontal scrollbar ABOVE the table; and
//   (4) a viewport-fixed floating header with the same column controls.
//
// Column layout is display-only. `columnState` is owned by the caller so manual
// widths / hidden columns survive a keep-mode DOM repaint without ever touching
// the Markdown source. Auto-fit restores the parser-generated <col> width hints,
// which is exactly the same calculation used for the table's initial render.
//
// Why JS and not plain CSS `position: sticky`: the wrapper needs `overflow-x:auto`
// for horizontal scroll, and per the CSS overflow spec that forces `overflow-y`
// to compute to `auto` too — which makes the wrapper a vertical scroll container
// and defeats a sticky header anchored to the *page* scroller. So we clone the
// header into a `position: fixed` element and sync width + horizontal scroll by
// hand. Mirrors the standalone Markdown viewer's approach.

const FALLBACK_LABELS = {
  'keep.tableAutoFit': 'Auto-fit all columns',
  'keep.hiddenColumns': '{count} hidden columns',
  'keep.hideColumn': 'Hide “{name}”',
  'keep.showColumn': 'Show “{name}”',
  'keep.showAllColumns': 'Show all columns',
  'keep.resizeColumn': 'Drag to resize “{name}”; double-click to auto-fit',
  'keep.autoFitColumn': 'Auto-fit this column',
  'keep.columnNumber': 'Column {number}'
}

const MIN_COLUMN_PX = 72
const MAX_COLUMN_PX = 1600
const TABLE_VIEWPORT_CONTAINMENT_THRESHOLD = 80

function fallbackT(key, vars) {
  let text = FALLBACK_LABELS[key] || key
  if (vars) for (const name in vars) text = text.replace('{' + name + '}', vars[name])
  return text
}

export function enhanceKeepTables(
  host,
  scroller,
  {
    onFilterClick,
    onHeaderClick,
    onHeaderContextMenu,
    onHeaderEdit,
    columnState = {},
    t: initialT
  } = {}
) {
  const noop = {
    update() {},
    hide() {},
    destroy() {},
    refreshContent() {},
    refreshLabels() {},
    refreshSelection() {},
    preserveFilterViewport(_tableIdx, mutate) {
      return mutate?.()
    },
    autoFitColumn() {},
    autoFitTable() {},
    hideColumn() {},
    revealCell() {
      return false
    },
    canHideColumn() {
      return false
    }
  }
  if (!host) return noop

  let translate = typeof initialT === 'function' ? initialT : fallbackT
  const tr = (key, vars) => translate(key, vars)
  const cleanups = []
  const controllers = new Map()
  const controllerByFrame = new Map()
  let activeColumnPop = null
  let activeResizeCleanup = null
  let activeController = null
  let updateRaf = 0

  // One floating header is shared by the whole document. Large generated reports
  // often contain hundreds of short tables; cloning every header and attaching a
  // ResizeObserver to every table made ordinary scroll/tab/sidebar work scale with
  // the total table count even though at most one table can be sticky at a time.
  const floatEl = document.createElement('div')
  floatEl.className = 'km-float-header'
  floatEl.setAttribute('aria-hidden', 'true')
  const hostLang = host.getAttribute('lang')
  if (hostLang) floatEl.setAttribute('lang', hostLang)

  const floatTop = document.createElement('div')
  floatTop.className = 'km-float-scrolltop'
  const floatTopInner = document.createElement('div')
  floatTopInner.className = 'km-table-scrolltop-inner'
  floatTop.appendChild(floatTopInner)

  const floatScroll = document.createElement('div')
  floatScroll.className = 'km-float-header-scroll'
  const floatTable = document.createElement('table')
  floatScroll.appendChild(floatTable)
  floatEl.append(floatTop, floatScroll)
  ;(host.closest('.pane-center') || document.body).appendChild(floatEl)
  cleanups.push(() => floatEl.remove())

  let cloneThead = null

  const hideSharedFloat = () => floatEl.classList.remove('km-visible')

  const activateFloat = (controller) => {
    if (activeController === controller && cloneThead) return cloneThead
    closeColumnPop()
    hideSharedFloat()
    activeController = controller
    floatTable.className = controller.table.className
    cloneThead = controller.thead.cloneNode(true)
    floatTable.replaceChildren(cloneThead)
    controller.onFloatActivated()
    return cloneThead
  }

  const closeColumnPop = () => {
    if (!activeColumnPop) return
    activeColumnPop.pop.remove()
    activeColumnPop = null
  }

  const positionColumnPop = () => {
    if (!activeColumnPop) return
    const { pop, anchor } = activeColumnPop
    if (!document.body.contains(anchor)) {
      closeColumnPop()
      return
    }
    const r = anchor.getBoundingClientRect()
    const pw = pop.offsetWidth || 220
    const ph = pop.offsetHeight || 0
    let left = Math.min(r.right - pw, window.innerWidth - pw - 8)
    left = Math.max(8, left)
    let top = r.bottom + 6
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6)
    pop.style.left = left + 'px'
    pop.style.top = top + 'px'
  }

  const openColumnPop = (controller, anchor) => {
    closeColumnPop()
    const hidden = controller.hiddenColumns()
    if (!hidden.length) return

    const pop = document.createElement('div')
    pop.className = 'km-column-pop'
    pop.setAttribute('role', 'menu')

    const title = document.createElement('div')
    title.className = 'km-column-pop-title'
    title.textContent = tr('keep.hiddenColumns', { count: hidden.length })
    pop.appendChild(title)

    hidden.forEach((ci) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'km-column-pop-item'
      button.dataset.ci = String(ci)
      button.setAttribute('role', 'menuitem')
      button.textContent = '◉ ' + tr('keep.showColumn', { name: controller.columnName(ci) })
      button.addEventListener('click', () => {
        controller.showColumn(ci)
        closeColumnPop()
      })
      pop.appendChild(button)
    })

    if (hidden.length > 1) {
      const sep = document.createElement('div')
      sep.className = 'km-column-pop-sep'
      pop.appendChild(sep)
      const showAll = document.createElement('button')
      showAll.type = 'button'
      showAll.className = 'km-column-pop-item km-column-pop-all'
      showAll.setAttribute('role', 'menuitem')
      showAll.textContent = tr('keep.showAllColumns')
      showAll.addEventListener('click', () => {
        controller.showAllColumns()
        closeColumnPop()
      })
      pop.appendChild(showAll)
    }

    document.body.appendChild(pop)
    activeColumnPop = { pop, anchor, controller }
    positionColumnPop()
    pop.querySelector('button')?.focus({ preventScroll: true })
  }

  const onOutsidePointer = (event) => {
    if (!activeColumnPop) return
    if (activeColumnPop.pop.contains(event.target) || activeColumnPop.anchor.contains(event.target))
      return
    closeColumnPop()
  }
  const onGlobalScroll = (event) => {
    if (activeColumnPop?.pop.contains(event.target)) return
    closeColumnPop()
  }
  document.addEventListener('pointerdown', onOutsidePointer, true)
  window.addEventListener('scroll', onGlobalScroll, true)
  window.addEventListener('resize', positionColumnPop)
  cleanups.push(() => document.removeEventListener('pointerdown', onOutsidePointer, true))
  cleanups.push(() => window.removeEventListener('scroll', onGlobalScroll, true))
  cleanups.push(() => window.removeEventListener('resize', positionColumnPop))

  const clonedHeader = (target) => target.closest?.('th[data-ci]') || null
  const clonedColumn = (target) => {
    const value = target?.closest?.('[data-ci]')?.getAttribute('data-ci')
    const column = Number(value)
    return Number.isFinite(column) ? column : null
  }
  const liveHeaderForClone = (target) => {
    const column = clonedColumn(target)
    return column == null ? null : activeController?.liveHeaders[column] || null
  }
  const isHeaderControl = (target) =>
    target.closest?.('.km-filter-btn, .km-col-hide-btn, .km-col-resize')

  // Event delegation keeps the shared clone interactive without installing a new
  // listener set every time scrolling activates another table.
  const onFloatClick = (event) => {
    const filterButton = event.target.closest?.('.km-filter-btn')
    if (filterButton) {
      event.stopPropagation()
      onFilterClick?.(filterButton)
      return
    }
    const hideButton = event.target.closest?.('.km-col-hide-btn')
    if (hideButton) {
      event.preventDefault()
      event.stopPropagation()
      activeController?.hideColumn(clonedColumn(hideButton))
      return
    }
    if (event.target.closest?.('.km-col-resize')) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const clonedTh = clonedHeader(event.target)
    const liveTh = liveHeaderForClone(clonedTh)
    if (!liveTh) return
    onHeaderClick?.(liveTh, clonedTh, event)
    activeController?.syncSelection()
  }
  const onFloatContextMenu = (event) => {
    const clonedTh = clonedHeader(event.target)
    const liveTh = liveHeaderForClone(clonedTh)
    if (!liveTh) return
    onHeaderContextMenu?.(liveTh, clonedTh, event)
    activeController?.syncSelection()
  }
  const onFloatDoubleClick = (event) => {
    const resize = event.target.closest?.('.km-col-resize')
    if (resize) {
      event.preventDefault()
      event.stopPropagation()
      activeController?.autoFitColumn(clonedColumn(resize))
      return
    }
    if (isHeaderControl(event.target)) return
    const clonedTh = clonedHeader(event.target)
    const liveTh = liveHeaderForClone(clonedTh)
    if (liveTh) onHeaderEdit?.(liveTh, clonedTh, event)
  }
  const onFloatPointerDown = (event) => {
    const resize = event.target.closest?.('.km-col-resize')
    if (resize) activeController?.startResize(clonedColumn(resize), event)
  }
  const onFloatKeyDown = (event) => {
    const resize = event.target.closest?.('.km-col-resize')
    if (!resize) return
    const column = clonedColumn(resize)
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activeController?.autoFitColumn(column)
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    activeController?.resizeColumnBy(
      column,
      (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 32 : 12)
    )
  }
  floatEl.addEventListener('click', onFloatClick)
  floatEl.addEventListener('contextmenu', onFloatContextMenu)
  floatEl.addEventListener('dblclick', onFloatDoubleClick)
  floatEl.addEventListener('pointerdown', onFloatPointerDown)
  floatEl.addEventListener('keydown', onFloatKeyDown)
  cleanups.push(() => floatEl.removeEventListener('click', onFloatClick))
  cleanups.push(() => floatEl.removeEventListener('contextmenu', onFloatContextMenu))
  cleanups.push(() => floatEl.removeEventListener('dblclick', onFloatDoubleClick))
  cleanups.push(() => floatEl.removeEventListener('pointerdown', onFloatPointerDown))
  cleanups.push(() => floatEl.removeEventListener('keydown', onFloatKeyDown))

  host.querySelectorAll('.km-table-wrap').forEach((wrap, tableOrder) => {
    const table = wrap.querySelector('table.km-table')
    if (!table) return
    const thead = table.querySelector('thead')
    const liveHeaders = thead ? [...thead.querySelectorAll('th')] : []
    const liveCols = [...table.querySelectorAll(':scope > colgroup > col')]
    if (!thead || !liveHeaders.length || liveCols.length !== liveHeaders.length) return

    const stateKey = table.getAttribute('data-ti') || String(tableOrder)
    let state = columnState[stateKey]
    if (!state || state.colCount !== liveCols.length) {
      state = { colCount: liveCols.length, widths: {}, hidden: new Set() }
      columnState[stateKey] = state
    }
    if (!(state.hidden instanceof Set)) state.hidden = new Set(state.hidden || [])
    if (!state.widths || typeof state.widths !== 'object') state.widths = {}
    state.hidden = new Set([...state.hidden].filter((ci) => ci >= 0 && ci < liveCols.length))
    if (state.hidden.size >= liveCols.length) state.hidden.delete(0)
    const hasInitialColumnOverrides =
      state.hidden.size > 0 ||
      Object.values(state.widths).some(
        (width) => Number.isFinite(Number(width)) && Number(width) > 0
      )

    const autoWidths = liveCols.map((col) => col.style.width || '')
    let headerNames = []
    let syncTopWidth = () => {}
    let syncWidths = () => {}
    let syncSelection = () => {}
    let updateFloat = () => {}

    // Group toolbar + top scrollbar + table as one visual frame. On an in-place
    // teardown, put the parser-owned wrapper back exactly where it started.
    const frame = document.createElement('div')
    frame.className = 'km-table-frame'
    wrap.parentNode.insertBefore(frame, wrap)
    frame.appendChild(wrap)
    cleanups.push(() => {
      if (frame.parentNode && wrap.parentNode === frame) {
        frame.parentNode.insertBefore(wrap, frame)
        frame.remove()
      }
    })

    const tools = document.createElement('div')
    tools.className = 'km-table-tools'
    const autoFitButton = document.createElement('button')
    autoFitButton.type = 'button'
    autoFitButton.className = 'km-table-tool km-table-autofit'
    const hiddenButton = document.createElement('button')
    hiddenButton.type = 'button'
    hiddenButton.className = 'km-table-tool km-table-hidden-columns'
    tools.append(autoFitButton, hiddenButton)
    frame.insertBefore(tools, wrap)

    const hGroup = []
    let hsyncing = false
    const syncH = (src) => {
      if (hsyncing) return
      hsyncing = true
      const x = src.scrollLeft
      for (const el of hGroup) if (el !== src) el.scrollLeft = x
      if (activeController === controller) {
        if (floatTop !== src) floatTop.scrollLeft = x
        if (floatScroll !== src) floatScroll.scrollLeft = x
      }
      hsyncing = false
    }
    const addH = (el, listen) => {
      hGroup.push(el)
      if (!listen) return
      const fn = () => syncH(el)
      el.addEventListener('scroll', fn, { passive: true })
      cleanups.push(() => el.removeEventListener('scroll', fn))
    }
    addH(wrap, true)

    const topBar = document.createElement('div')
    topBar.className = 'km-table-scrolltop km-hidden'
    const topInner = document.createElement('div')
    topInner.className = 'km-table-scrolltop-inner'
    topBar.appendChild(topInner)
    frame.insertBefore(topBar, wrap)
    addH(topBar, true)

    const visibleColumns = () => liveCols.map((_, ci) => ci).filter((ci) => !state.hidden.has(ci))
    const columnName = (ci) =>
      headerNames[ci] || tr('keep.columnNumber', { number: Number(ci) + 1 })
    const canHideColumn = (ci) => !state.hidden.has(Number(ci)) && visibleColumns().length > 1

    const refreshLabels = () => {
      headerNames = liveHeaders.map((th, ci) => {
        const text = (th.querySelector('.km-th-content')?.textContent || '').trim()
        return text || tr('keep.columnNumber', { number: ci + 1 })
      })
      autoFitButton.textContent = '↔ ' + tr('keep.tableAutoFit')
      autoFitButton.title = tr('keep.tableAutoFit')
      autoFitButton.setAttribute('aria-label', tr('keep.tableAutoFit'))
      const hiddenCount = state.hidden.size
      hiddenButton.hidden = hiddenCount === 0
      hiddenButton.textContent = '◉ ' + tr('keep.hiddenColumns', { count: hiddenCount })
      hiddenButton.title = tr('keep.hiddenColumns', { count: hiddenCount })
      hiddenButton.setAttribute('aria-label', tr('keep.hiddenColumns', { count: hiddenCount }))

      const activeClone = activeController === controller ? cloneThead : null
      const roots = [thead, activeClone].filter(Boolean)
      roots.forEach((root) => {
        root.querySelectorAll('.km-col-hide-btn').forEach((button) => {
          const ci = Number(button.dataset.ci)
          const label = tr('keep.hideColumn', { name: columnName(ci) })
          button.title = label
          button.setAttribute('aria-label', label)
          button.disabled = !canHideColumn(ci)
        })
        root.querySelectorAll('.km-col-resize').forEach((button) => {
          const ci = Number(button.dataset.ci)
          const label = tr('keep.resizeColumn', { name: columnName(ci) })
          button.title = label
          button.setAttribute('aria-label', label)
        })
      })
    }

    const widthTerm = (ci) => {
      const manual = Number(state.widths[ci])
      if (Number.isFinite(manual) && manual > 0) return Math.round(manual) + 'px'
      return autoWidths[ci] || Math.max(MIN_COLUMN_PX, liveHeaders[ci]?.offsetWidth || 0) + 'px'
    }

    const applyColumnLayout = () => {
      const visible = visibleColumns()
      liveCols.forEach((col, ci) => {
        col.classList.toggle('km-col-hidden', state.hidden.has(ci))
        col.style.width = widthTerm(ci)
      })
      table.querySelectorAll('th[data-ci], td[data-ci]').forEach((cell) => {
        cell.classList.toggle(
          'km-col-hidden',
          state.hidden.has(Number(cell.getAttribute('data-ci')))
        )
      })
      const activeClone = activeController === controller ? cloneThead : null
      if (activeClone) {
        activeClone.querySelectorAll('th[data-ci]').forEach((cell) => {
          cell.classList.toggle(
            'km-col-hidden',
            state.hidden.has(Number(cell.getAttribute('data-ci')))
          )
        })
      }
      // The CSS min-width remains 100%, so narrow visible sets still fill the
      // viewport; otherwise the sum below is the exact parser/manual width mix.
      table.style.width = visible.length ? 'calc(' + visible.map(widthTerm).join(' + ') + ')' : ''
      refreshLabels()
      syncTopWidth()
      syncWidths()
      updateFloat()
    }

    const freezeVisibleWidths = () => {
      liveHeaders.forEach((th, ci) => {
        if (state.hidden.has(ci) || Number.isFinite(Number(state.widths[ci]))) return
        state.widths[ci] = Math.max(MIN_COLUMN_PX, th.offsetWidth || MIN_COLUMN_PX)
      })
    }

    const autoFitColumn = (ci) => {
      ci = Number(ci)
      if (!Number.isFinite(ci)) return
      delete state.widths[ci]
      applyColumnLayout()
    }
    const autoFitTable = () => {
      state.widths = {}
      applyColumnLayout()
    }
    const hideColumn = (ci) => {
      ci = Number(ci)
      if (!canHideColumn(ci)) return
      state.hidden.add(ci)
      closeColumnPop()
      applyColumnLayout()
    }
    const showColumn = (ci) => {
      ci = Number(ci)
      if (!state.hidden.delete(ci)) return
      applyColumnLayout()
    }
    const showAllColumns = () => {
      if (!state.hidden.size) return
      state.hidden.clear()
      applyColumnLayout()
    }

    let controller
    const startResize = (ci, event) => {
      ci = Number(ci)
      if (!Number.isFinite(ci) || state.hidden.has(ci)) return
      event.preventDefault()
      event.stopPropagation()
      activeResizeCleanup?.()
      freezeVisibleWidths()
      const zoom = parseFloat(getComputedStyle(host).getPropertyValue('--editor-zoom')) || 1
      const startX = event.clientX
      const startWidth = Number(state.widths[ci]) || liveHeaders[ci]?.offsetWidth || MIN_COLUMN_PX
      let pendingWidth = startWidth
      let moveRaf = 0
      let stopped = false

      const paint = () => {
        moveRaf = 0
        state.widths[ci] = pendingWidth
        applyColumnLayout()
      }
      const onMove = (moveEvent) => {
        pendingWidth = Math.max(
          MIN_COLUMN_PX,
          Math.min(MAX_COLUMN_PX, Math.round(startWidth + (moveEvent.clientX - startX) / zoom))
        )
        if (!moveRaf) moveRaf = requestAnimationFrame(paint)
      }
      const stop = () => {
        if (stopped) return
        stopped = true
        if (moveRaf) {
          cancelAnimationFrame(moveRaf)
          paint()
        }
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', stop)
        document.removeEventListener('pointercancel', stop)
        document.body.classList.remove('km-column-resizing')
        table.classList.remove('km-column-resizing')
        if (activeResizeCleanup === stop) activeResizeCleanup = null
      }

      document.body.classList.add('km-column-resizing')
      table.classList.add('km-column-resizing')
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', stop)
      document.addEventListener('pointercancel', stop)
      activeResizeCleanup = stop
    }

    const resizeColumnBy = (ci, delta) => {
      ci = Number(ci)
      if (!Number.isFinite(ci) || state.hidden.has(ci)) return
      freezeVisibleWidths()
      state.widths[ci] = Math.max(
        MIN_COLUMN_PX,
        Math.min(MAX_COLUMN_PX, Number(state.widths[ci] || MIN_COLUMN_PX) + Number(delta || 0))
      )
      applyColumnLayout()
    }

    const wireHeaderControls = (root) => {
      const localCleanups = []
      root.querySelectorAll('.km-col-hide-btn').forEach((button) => {
        const onClick = (event) => {
          event.preventDefault()
          controller.hideColumn(Number(button.dataset.ci))
        }
        const onDoubleClick = (event) => event.stopPropagation()
        button.addEventListener('click', onClick)
        button.addEventListener('dblclick', onDoubleClick)
        localCleanups.push(() => button.removeEventListener('click', onClick))
        localCleanups.push(() => button.removeEventListener('dblclick', onDoubleClick))
      })
      root.querySelectorAll('.km-col-resize').forEach((button) => {
        const ci = Number(button.dataset.ci)
        const onPointerDown = (event) => startResize(ci, event)
        const onClick = (event) => {
          event.preventDefault()
          event.stopPropagation()
        }
        const onDoubleClick = (event) => {
          event.preventDefault()
          event.stopPropagation()
          controller.autoFitColumn(ci)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            controller.autoFitColumn(ci)
            return
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const step = event.shiftKey ? 32 : 12
          const direction = event.key === 'ArrowRight' ? 1 : -1
          resizeColumnBy(ci, direction * step)
        }
        button.addEventListener('pointerdown', onPointerDown)
        button.addEventListener('click', onClick)
        button.addEventListener('dblclick', onDoubleClick)
        button.addEventListener('keydown', onKeyDown)
        localCleanups.push(() => button.removeEventListener('pointerdown', onPointerDown))
        localCleanups.push(() => button.removeEventListener('click', onClick))
        localCleanups.push(() => button.removeEventListener('dblclick', onDoubleClick))
        localCleanups.push(() => button.removeEventListener('keydown', onKeyDown))
      })
      cleanups.push(() => localCleanups.reverse().forEach((fn) => fn()))
    }

    // Add one quiet hide button and one edge handle to each live header before
    // cloning it, so the floating header gets the exact same controls and layout.
    liveHeaders.forEach((th, ci) => {
      const flex = th.querySelector('.km-th-flex') || th
      const filter = flex.querySelector('.km-filter-btn')
      const actions = document.createElement('span')
      actions.className = 'km-th-actions'
      if (filter) {
        flex.insertBefore(actions, filter)
        actions.appendChild(filter)
      } else {
        flex.appendChild(actions)
      }
      const hide = document.createElement('button')
      hide.type = 'button'
      hide.className = 'km-col-hide-btn'
      hide.dataset.ci = String(ci)
      hide.textContent = '⊘'
      actions.insertBefore(hide, actions.firstChild)

      const resize = document.createElement('button')
      resize.type = 'button'
      resize.className = 'km-col-resize'
      resize.dataset.ci = String(ci)
      th.appendChild(resize)
    })
    cleanups.push(() => {
      liveHeaders.forEach((th) => {
        th.querySelectorAll(':scope > .km-col-resize').forEach((el) => el.remove())
        const actions = th.querySelector('.km-th-actions')
        const flex = th.querySelector('.km-th-flex')
        if (!actions || !flex) return
        const filter = actions.querySelector('.km-filter-btn')
        if (filter) flex.appendChild(filter)
        actions.remove()
      })
    })

    controller = {
      stateKey,
      table,
      thead,
      wrap,
      frame,
      topBar,
      liveHeaders,
      columnName,
      hiddenColumns: () => [...state.hidden].sort((a, b) => a - b),
      canHideColumn,
      autoFitColumn,
      autoFitTable,
      hideColumn,
      showColumn,
      showAllColumns,
      startResize,
      resizeColumnBy,
      refreshLabels,
      syncHorizontal: syncH,
      prepare: () => {},
      onFloatActivated: () => {},
      update: () => updateFloat(),
      hide: () => {},
      syncContent: () => {},
      syncSelection: () => {},
      preserveFilterViewport: (mutate) => mutate?.(),
      revealCell: () => false
    }
    controllers.set(stateKey, controller)
    controllerByFrame.set(frame, controller)

    autoFitButton.addEventListener('click', autoFitTable)
    hiddenButton.addEventListener('click', () => openColumnPop(controller, hiddenButton))
    cleanups.push(() => autoFitButton.removeEventListener('click', autoFitTable))

    // The inner spacer is sized to the table width; the bar hides when the table
    // fits. Filtering, hiding, and resizing all re-measure through the same path.
    syncTopWidth = () => {
      const tableWidth = table.scrollWidth
      topInner.style.width = tableWidth + 'px'
      topBar.classList.toggle('km-hidden', tableWidth <= wrap.clientWidth + 1)
    }

    let preparedWidth = -1
    const prepare = (force = false) => {
      const width = wrap.clientWidth
      if (!force && width === preparedWidth) return
      preparedWidth = width
      syncTopWidth()
    }

    const syncContent = () => {
      if (activeController !== controller || !cloneThead) return
      const original = thead.querySelectorAll('th')
      const clone = cloneThead.querySelectorAll('th')
      original.forEach((th, i) => {
        if (!clone[i]) return
        clone[i].setAttribute('data-raw', th.getAttribute('data-raw') || '')
        const source = th.querySelector('.km-th-content')
        const target = clone[i].querySelector('.km-th-content')
        if (source && target) target.innerHTML = source.innerHTML
      })
      refreshLabels()
    }

    const readFloatWidths = () => ({
      tableWidth: table.offsetWidth,
      scrollWidth: table.scrollWidth,
      headerWidths: liveHeaders.map((th) => th.offsetWidth)
    })
    const applyFloatWidths = ({ tableWidth, scrollWidth, headerWidths }) => {
      if (activeController !== controller || !cloneThead) return
      floatTable.style.width = tableWidth + 'px'
      floatTopInner.style.width = scrollWidth + 'px'
      const clone = cloneThead.querySelectorAll('th')
      headerWidths.forEach((width, i) => {
        if (!clone[i]) return
        const px = width + 'px'
        clone[i].style.width = px
        clone[i].style.minWidth = px
        clone[i].style.maxWidth = px
      })
    }
    syncWidths = () => applyFloatWidths(readFloatWidths())
    const syncActive = () => {
      if (activeController !== controller || !cloneThead) return
      const original = thead.querySelectorAll('.km-filter-btn')
      const clone = cloneThead.querySelectorAll('.km-filter-btn')
      original.forEach((button, i) => {
        if (clone[i]) clone[i].classList.toggle('active', button.classList.contains('active'))
      })
    }
    syncSelection = () => {
      if (activeController !== controller || !cloneThead) return
      const original = thead.querySelectorAll('th')
      const clone = cloneThead.querySelectorAll('th')
      original.forEach((th, i) => {
        if (clone[i]) {
          clone[i].classList.toggle('km-cell-selected', th.classList.contains('km-cell-selected'))
        }
      })
    }

    const hideFloat = () => {
      if (activeController === controller) hideSharedFloat()
    }
    updateFloat = () => {
      const scrollerRect = scroller
        ? scroller.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight }
      const topOffset = scrollerRect.top
      const theadRect = thead.getBoundingClientRect()
      const tableRect = table.getBoundingClientRect()
      const show =
        theadRect.top < topOffset &&
        tableRect.bottom > topOffset + theadRect.height + 24 &&
        tableRect.top < scrollerRect.bottom
      if (!show) {
        hideFloat()
        return false
      }
      // Batch every geometry read before replacing the shared clone. Reading live
      // widths after that DOM write forced a full-document layout on each sticky
      // table transition in reports containing hundreds of tables.
      const widths = readFloatWidths()
      const zoom = parseFloat(getComputedStyle(host).getPropertyValue('--editor-zoom')) || 1
      const wrapRect = wrap.getBoundingClientRect()
      const wrapWidth = wrap.clientWidth
      const wrapLeft = wrap.clientLeft
      const wrapScrollLeft = wrap.scrollLeft
      preparedWidth = wrapWidth
      topInner.style.width = widths.scrollWidth + 'px'
      topBar.classList.toggle('km-hidden', widths.scrollWidth <= wrapWidth + 1)
      activateFloat(controller)
      applyFloatWidths(widths)
      syncActive()
      syncSelection()
      floatEl.style.top = topOffset / zoom + 'px'
      floatEl.style.left = wrapRect.left / zoom + wrapLeft + 'px'
      floatEl.style.width = wrapWidth + 'px'
      floatTop.classList.toggle('km-hidden', widths.scrollWidth <= wrapWidth + 1)
      const wasVisible = floatEl.classList.contains('km-visible')
      floatEl.classList.add('km-visible')
      if (!wasVisible) {
        floatScroll.scrollLeft = wrapScrollLeft
        floatTop.scrollLeft = wrapScrollLeft
      }
      return true
    }

    const onFloatActivated = () => {
      refreshLabels()
    }

    // `scrollIntoView({ block: 'nearest' })` only knows about the editor's
    // scrollport. The fixed cloned header is an overlay, so a body cell can be
    // geometrically inside the scrollport while still sitting underneath it.
    // Keep the native horizontal/vertical nearest behavior, then compensate for
    // the overlay when this table's floating header remains active.
    const revealCell = (cell) => {
      if (!cell || !table.contains(cell)) return false
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      updateFloat()
      if (!scroller || !floatEl.classList.contains('km-visible')) return true

      const cellRect = cell.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      const floatRect = floatEl.getBoundingClientRect()
      const visibleTop = Math.max(scrollerRect.top, floatRect.bottom) + 2
      if (cellRect.top < visibleTop && cellRect.bottom > scrollerRect.top) {
        scroller.scrollTop -= visibleTop - cellRect.top
        updateFloat()
      }
      return true
    }

    // A filter opened from the fixed header is applied while the live header is
    // already above the viewport. Hiding many rows can then shrink the table by
    // thousands of pixels without Chromium adjusting the editor scrollTop (the
    // focused dropdown lives outside the scroller). The unchanged scrollTop lands
    // on the next table and makes its header appear to replace the one just used.
    //
    // Keep the filtered table's trailing edge at the same viewport coordinate.
    // This mirrors the user's position near the visible end of the table and, when
    // the filtered result now fits, naturally brings the whole result back into
    // view. Temporarily disable native scroll anchoring so the compensation is
    // deterministic rather than being applied twice by different Chromium builds.
    const preserveFilterViewport = (mutate) => {
      if (typeof mutate !== 'function') return undefined
      if (!scroller) return mutate()

      const previousOverflowAnchor = scroller.style.overflowAnchor
      scroller.style.overflowAnchor = 'none'
      const bottomBefore = table.getBoundingClientRect().bottom
      try {
        const result = mutate()
        const bottomAfter = table.getBoundingClientRect().bottom
        const delta = bottomAfter - bottomBefore
        if (Number.isFinite(delta) && Math.abs(delta) > 0.5) scroller.scrollTop += delta
        return result
      } finally {
        scroller.style.overflowAnchor = previousOverflowAnchor
      }
    }

    controller.hide = hideFloat
    controller.update = updateFloat
    controller.prepare = prepare
    controller.onFloatActivated = onFloatActivated
    controller.syncContent = syncContent
    controller.syncSelection = syncSelection
    controller.preserveFilterViewport = preserveFilterViewport
    controller.revealCell = revealCell

    wireHeaderControls(thead)
    if (hasInitialColumnOverrides) {
      // Restored manual widths/hidden columns must be replayed onto the new DOM.
      applyColumnLayout()
    } else {
      // The parser already wrote the automatic <col> widths. Reapplying an empty
      // state used to toggle a class on every th/td before reading scrollWidth,
      // turning a no-op into a full-table style/layout pass on giant tables.
      refreshLabels()
    }
  })

  // Reports made of hundreds of short tables retain a large live DOM even after
  // progressive rendering finishes. Let Chromium skip layout/paint for offscreen
  // table interiors, but only after measuring every completed frame. Applying
  // containment to the outer Markdown block changes margin collapsing and shifts
  // the document; the table frame keeps those block-level metrics untouched.
  if (controllers.size >= TABLE_VIEWPORT_CONTAINMENT_THRESHOLD) {
    const frames = [...controllers.values()].map((controller) => controller.frame)
    const heights = frames.map((frame) => frame.getBoundingClientRect().height)
    frames.forEach((frame, index) => {
      const height = heights[index]
      if (!(height > 0)) return
      frame.style.containIntrinsicBlockSize = `auto ${height}px`
      frame.style.contentVisibility = 'auto'
    })
    host.dataset.kmTableViewportContainment = 'true'
    cleanups.push(() => {
      delete host.dataset.kmTableViewportContainment
    })
  }

  const prepareEventTable = (event) => {
    const frame = event.target.closest?.('.km-table-frame')
    if (frame) controllerByFrame.get(frame)?.prepare()
  }
  host.addEventListener('mouseover', prepareEventTable)
  host.addEventListener('focusin', prepareEventTable)
  cleanups.push(() => host.removeEventListener('mouseover', prepareEventTable))
  cleanups.push(() => host.removeEventListener('focusin', prepareEventTable))

  const onFloatHorizontalScroll = (event) => {
    activeController?.syncHorizontal(event.currentTarget)
  }
  floatTop.addEventListener('scroll', onFloatHorizontalScroll, { passive: true })
  floatScroll.addEventListener('scroll', onFloatHorizontalScroll, { passive: true })
  cleanups.push(() => floatTop.removeEventListener('scroll', onFloatHorizontalScroll))
  cleanups.push(() => floatScroll.removeEventListener('scroll', onFloatHorizontalScroll))

  const controllerAtViewportTop = () => {
    if (typeof document.elementsFromPoint !== 'function') return null
    const scrollerRect = scroller
      ? scroller.getBoundingClientRect()
      : { top: 0, right: window.innerWidth, bottom: window.innerHeight, left: 0 }
    const hostRect = host.getBoundingClientRect()
    const left = Math.max(scrollerRect.left + 1, hostRect.left + 1)
    const right = Math.min(scrollerRect.right - 1, hostRect.right - 1)
    const x =
      Number.isFinite(left + right) && right >= left
        ? (left + right) / 2
        : (scrollerRect.left + scrollerRect.right) / 2
    const y = Math.min(scrollerRect.bottom - 1, scrollerRect.top + 2)
    const elements = document.elementsFromPoint(x, y)
    for (const element of elements) {
      const frame = element.closest?.('.km-table-frame')
      const controller = frame && controllerByFrame.get(frame)
      if (controller) return controller
    }
    return null
  }

  const updateNow = () => {
    updateRaf = 0
    if (typeof document.elementsFromPoint !== 'function') {
      // DOM test environments do not implement hit testing. Keep the fallback
      // deterministic there; Chromium always takes the O(1) path above.
      for (const controller of controllers.values()) {
        if (controller.update()) return
      }
      hideSharedFloat()
      return
    }
    const controller = controllerAtViewportTop()
    if (!controller) {
      hideSharedFloat()
      return
    }
    if (!controller.update()) hideSharedFloat()
  }
  const scheduleUpdate = () => {
    if (updateRaf) return
    updateRaf = requestAnimationFrame(updateNow)
  }

  // A single observer follows the writing surface. Sidebar/split transitions may
  // emit many resize notifications, but each callback now touches only the active
  // table instead of remeasuring every table in the document.
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          updateNow()
        })
      : null
  resizeObserver?.observe(host)
  if (scroller && scroller !== host) resizeObserver?.observe(scroller)
  if (resizeObserver) cleanups.push(() => resizeObserver.disconnect())

  updateNow()

  return {
    update: scheduleUpdate,
    hide: () => {
      closeColumnPop()
      hideSharedFloat()
    },
    refreshContent: () => activeController?.syncContent(),
    refreshSelection: () => activeController?.syncSelection(),
    preserveFilterViewport: (tableIdx, mutate) => {
      const controller = controllers.get(String(tableIdx))
      return controller ? controller.preserveFilterViewport(mutate) : mutate?.()
    },
    refreshLabels: (nextT) => {
      if (typeof nextT === 'function') translate = nextT
      closeColumnPop()
      controllers.forEach((controller) => controller.refreshLabels())
    },
    autoFitColumn: (tableIdx, colIdx) => controllers.get(String(tableIdx))?.autoFitColumn(colIdx),
    autoFitTable: (tableIdx) => controllers.get(String(tableIdx))?.autoFitTable(),
    hideColumn: (tableIdx, colIdx) => controllers.get(String(tableIdx))?.hideColumn(colIdx),
    revealCell: (cell) => {
      const tableIdx = cell?.closest?.('table.km-table')?.getAttribute('data-ti')
      if (tableIdx == null) return false
      return controllers.get(String(tableIdx))?.revealCell(cell) || false
    },
    canHideColumn: (tableIdx, colIdx) =>
      controllers.get(String(tableIdx))?.canHideColumn(colIdx) || false,
    destroy: () => {
      closeColumnPop()
      activeResizeCleanup?.()
      if (updateRaf) cancelAnimationFrame(updateRaf)
      ;[...cleanups].reverse().forEach((fn) => fn())
      controllers.clear()
      controllerByFrame.clear()
      activeController = null
      cloneThead = null
    }
  }
}
