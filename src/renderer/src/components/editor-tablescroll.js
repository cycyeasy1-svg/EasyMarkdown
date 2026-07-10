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

function fallbackT(key, vars) {
  let text = FALLBACK_LABELS[key] || key
  if (vars) for (const name in vars) text = text.replace('{' + name + '}', vars[name])
  return text
}

export function enhanceKeepTables(
  host,
  scroller,
  { onFilterClick, onHeaderEdit, columnState = {}, t: initialT } = {}
) {
  const noop = {
    update() {},
    hide() {},
    destroy() {},
    refreshContent() {},
    refreshLabels() {},
    autoFitColumn() {},
    autoFitTable() {},
    hideColumn() {},
    canHideColumn() {
      return false
    }
  }
  if (!host) return noop

  let translate = typeof initialT === 'function' ? initialT : fallbackT
  const tr = (key, vars) => translate(key, vars)
  const cleanups = []
  const controllers = new Map()
  let activeColumnPop = null
  let activeResizeCleanup = null

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
    if (activeColumnPop.pop.contains(event.target) || activeColumnPop.anchor.contains(event.target)) return
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

    const autoWidths = liveCols.map((col) => col.style.width || '')
    let headerNames = []
    let cloneTable = null
    let cloneThead = null
    let syncTopWidth = () => {}
    let syncWidths = () => {}
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
    topBar.className = 'km-table-scrolltop'
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

      const roots = [thead, cloneThead].filter(Boolean)
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
        cell.classList.toggle('km-col-hidden', state.hidden.has(Number(cell.getAttribute('data-ci'))))
      })
      if (cloneThead) {
        cloneThead.querySelectorAll('th[data-ci]').forEach((cell) => {
          cell.classList.toggle('km-col-hidden', state.hidden.has(Number(cell.getAttribute('data-ci'))))
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
          freezeVisibleWidths()
          const step = event.shiftKey ? 32 : 12
          const direction = event.key === 'ArrowRight' ? 1 : -1
          state.widths[ci] = Math.max(
            MIN_COLUMN_PX,
            Math.min(MAX_COLUMN_PX, Number(state.widths[ci] || MIN_COLUMN_PX) + direction * step)
          )
          applyColumnLayout()
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
      columnName,
      hiddenColumns: () => [...state.hidden].sort((a, b) => a - b),
      canHideColumn,
      autoFitColumn,
      autoFitTable,
      hideColumn,
      showColumn,
      showAllColumns,
      refreshLabels,
      update: () => updateFloat(),
      hide: () => {},
      syncContent: () => {}
    }
    controllers.set(stateKey, controller)

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
    const ro =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            syncTopWidth()
            syncWidths()
          })
        : { observe() {}, disconnect() {} }
    ro.observe(table)
    ro.observe(wrap)
    cleanups.push(() => ro.disconnect())

    // Floating header: own top scrollbar + cloned thead. It is appended outside
    // the document flow, so explicitly copy lang and editor text context in CSS.
    const floatEl = document.createElement('div')
    floatEl.className = 'km-float-header'
    floatEl.setAttribute('aria-hidden', 'true')
    const hostLang = host.getAttribute('lang')
    if (hostLang) floatEl.setAttribute('lang', hostLang)

    const fTop = document.createElement('div')
    fTop.className = 'km-float-scrolltop'
    const fTopInner = document.createElement('div')
    fTopInner.className = 'km-table-scrolltop-inner'
    fTop.appendChild(fTopInner)

    const fscroll = document.createElement('div')
    fscroll.className = 'km-float-header-scroll'
    cloneTable = document.createElement('table')
    cloneTable.className = table.className
    cloneThead = thead.cloneNode(true)
    cloneTable.appendChild(cloneThead)
    fscroll.appendChild(cloneTable)
    floatEl.append(fTop, fscroll)
    ;(host.closest('.pane-center') || document.body).appendChild(floatEl)
    addH(fTop, true)
    addH(fscroll, false)
    cleanups.push(() => floatEl.remove())

    cloneThead.querySelectorAll('.km-filter-btn').forEach((button) => {
      const onClick = (event) => {
        event.stopPropagation()
        onFilterClick?.(button)
      }
      button.addEventListener('click', onClick)
      cleanups.push(() => button.removeEventListener('click', onClick))
    })
    const onCloneDoubleClick = (event) => {
      if (event.target.closest('.km-filter-btn, .km-col-hide-btn, .km-col-resize')) return
      const th = event.target.closest('th')
      if (th) onHeaderEdit?.(th)
    }
    cloneThead.addEventListener('dblclick', onCloneDoubleClick)
    cleanups.push(() => cloneThead.removeEventListener('dblclick', onCloneDoubleClick))

    const syncContent = () => {
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

    syncWidths = () => {
      cloneTable.style.width = table.offsetWidth + 'px'
      fTopInner.style.width = table.scrollWidth + 'px'
      const original = thead.querySelectorAll('th')
      const clone = cloneThead.querySelectorAll('th')
      original.forEach((th, i) => {
        if (!clone[i]) return
        const px = th.offsetWidth + 'px'
        clone[i].style.width = px
        clone[i].style.minWidth = px
        clone[i].style.maxWidth = px
      })
    }
    const syncActive = () => {
      const original = thead.querySelectorAll('.km-filter-btn')
      const clone = cloneThead.querySelectorAll('.km-filter-btn')
      original.forEach((button, i) => {
        if (clone[i]) clone[i].classList.toggle('active', button.classList.contains('active'))
      })
    }

    const hideFloat = () => floatEl.classList.remove('km-visible')
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
        return
      }
      syncWidths()
      syncActive()
      const zoom = parseFloat(getComputedStyle(host).getPropertyValue('--editor-zoom')) || 1
      const wrapRect = wrap.getBoundingClientRect()
      floatEl.style.top = topOffset / zoom + 'px'
      floatEl.style.left = wrapRect.left / zoom + wrap.clientLeft + 'px'
      floatEl.style.width = wrap.clientWidth + 'px'
      fTop.classList.toggle('km-hidden', table.scrollWidth <= wrap.clientWidth + 1)
      const wasVisible = floatEl.classList.contains('km-visible')
      floatEl.classList.add('km-visible')
      if (!wasVisible) {
        fscroll.scrollLeft = wrap.scrollLeft
        fTop.scrollLeft = wrap.scrollLeft
      }
    }

    controller.hide = hideFloat
    controller.update = updateFloat
    controller.syncContent = syncContent

    wireHeaderControls(thead)
    wireHeaderControls(cloneThead)
    applyColumnLayout()
  })

  return {
    update: () => controllers.forEach((controller) => controller.update()),
    hide: () => {
      closeColumnPop()
      controllers.forEach((controller) => controller.hide())
    },
    refreshContent: () => controllers.forEach((controller) => controller.syncContent()),
    refreshLabels: (nextT) => {
      if (typeof nextT === 'function') translate = nextT
      closeColumnPop()
      controllers.forEach((controller) => controller.refreshLabels())
    },
    autoFitColumn: (tableIdx, colIdx) => controllers.get(String(tableIdx))?.autoFitColumn(colIdx),
    autoFitTable: (tableIdx) => controllers.get(String(tableIdx))?.autoFitTable(),
    hideColumn: (tableIdx, colIdx) => controllers.get(String(tableIdx))?.hideColumn(colIdx),
    canHideColumn: (tableIdx, colIdx) =>
      controllers.get(String(tableIdx))?.canHideColumn(colIdx) || false,
    destroy: () => {
      closeColumnPop()
      activeResizeCleanup?.()
      ;[...cleanups].reverse().forEach((fn) => fn())
      controllers.clear()
    }
  }
}
