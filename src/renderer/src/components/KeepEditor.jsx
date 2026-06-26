import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n.jsx'
import {
  renderDoc,
  inline,
  replaceCellInLine,
  insertColumnInLine,
  removeColumnInLine,
  buildTableRow
} from '../keep-parser.js'

/**
 * Keep mode (source-backed editing) — the default editor for `.md`.
 *
 * The original file text is the single source of truth (`rawLines`, kept WITH
 * trailing \r). We render it read-only, and editing is location-scoped — a table
 * cell or a block's source — so only the touched lines are rewritten. Nothing
 * else is re-serialized, so saving produces a byte-for-byte diff of exactly the
 * change and nothing more (the "zero diff" requirement for Git-tracked specs).
 *
 * Unlike the Crepe editor this is plain DOM (innerHTML + event delegation) wrapped
 * in a thin React shell — there's no ProseMirror, no document model. After every
 * edit we re-parse rawLines and re-render; filters are re-applied on top.
 *
 * Contract with App:
 *   - initialContent → rawLines on mount. NO initial onChange (that would let the
 *     savedContent baseline be overwritten by a normalized form → spurious diff).
 *   - onChange(rawLines.join('\n'), false) fires ONLY when the user commits an edit.
 *   - onReady({ getMarkdown, getDocHTML, setBlock }) — save reads tab.content, but
 *     PDF export calls getDocHTML, and setBlock is a no-op (no block model here).
 *   - Remount (key includes reloadNonce) re-reads initialContent on external edits.
 */
export default function KeepEditor({ initialContent, onChange, onReady, onOutline, onFilterChange }) {
  const { t, lang } = useI18n()
  const tRef = useRef(t)
  tRef.current = t

  const hostRef = useRef(null)
  // Mutable doc state held in refs (this component drives the DOM directly).
  const rawLinesRef = useRef([]) // \r-inclusive source of truth
  const viewLinesRef = useRef([]) // \r-stripped view (parse/display)
  const blocksRef = useRef([]) // source map from the last render
  const filterStateRef = useRef({}) // tableIdx -> { colIdx: Set(excluded values) }
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onOutlineRef = useRef(onOutline)
  onOutlineRef.current = onOutline
  const onFilterChangeRef = useRef(onFilterChange)
  onFilterChangeRef.current = onFilterChange

  // Live edit handles so blur/outside-click can commit/close the right one.
  const activeEditRef = useRef(null) // { td, raw } during a cell edit
  const activePopRef = useRef(null) // the open filter dropdown element
  const activePopBtnRef = useRef(null) // the ▼ button that opened it (for toggle)
  const activeMenuRef = useRef(null) // the open table context menu element

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false

    rawLinesRef.current = (initialContent || '').split('\n')
    filterStateRef.current = {}

    const emitChange = () => {
      if (destroyed) return
      onChangeRef.current?.(rawLinesRef.current.join('\n'), false)
    }

    const pushOutline = () => {
      if (!onOutlineRef.current) return
      const heads = blocksRef.current
        .filter((b) => b.type === 'heading')
        .map((b) => ({ level: b.level, text: b.text, bi: b.bi ?? b.start }))
      onOutlineRef.current(heads)
    }

    // Full re-render from rawLines (re-parse → innerHTML → re-apply filters).
    const rerender = () => {
      if (destroyed) return
      const { html, blocks, viewLines } = renderDoc(rawLinesRef.current, filterStateRef.current, {
        srcEditLabel: tRef.current('keep.editSource')
      })
      // tag blocks with their index so the outline can reference them
      blocks.forEach((b, i) => {
        b.bi = i
      })
      host.innerHTML = html
      blocksRef.current = blocks
      viewLinesRef.current = viewLines
      // Tag multi-line blocks so the edit button pins to the top-right; single-line
      // blocks keep it vertically centered. Primary signal is the source line span;
      // a fontSize-based height check also catches a long single line that wraps.
      blocks.forEach((b, bi) => {
        if (b.type === 'table') return
        const bl = host.querySelector('.km-block[data-bi="' + bi + '"]')
        if (!bl) return
        let multi = b.end > b.start
        if (!multi) {
          const content = Array.from(bl.children).find((c) => !c.classList.contains('km-src-edit'))
          if (content) {
            const fs = parseFloat(getComputedStyle(content).fontSize) || 16
            multi = content.offsetHeight > fs * 2.2
          }
        }
        bl.classList.toggle('km-multiline', multi)
      })
      Object.keys(filterStateRef.current).forEach((ti) => applyFilter(parseInt(ti)))
      pushOutline()
      reportFilter()
    }

    // Tell the parent how many rows survive the active filters (status bar). Only
    // counts tables that actually have a filter applied; null = no filter active.
    const reportFilter = () => {
      if (!onFilterChangeRef.current) return
      let total = 0
      let shown = 0
      let anyActive = false
      host.querySelectorAll('table.km-table').forEach((table) => {
        const ti = table.getAttribute('data-ti')
        const cols = filterStateRef.current[ti]
        if (!cols || Object.keys(cols).length === 0) return
        anyActive = true
        table.querySelectorAll('tbody tr').forEach((tr) => {
          total++
          if (!tr.classList.contains('km-filtered')) shown++
        })
      })
      onFilterChangeRef.current(anyActive ? { shown, total } : null)
    }

    // ── table cell editing: rewrite only that one cell on that one raw line ──
    const startCellEdit = (td) => {
      if (activeEditRef.current) return
      const raw = td.getAttribute('data-raw') || ''
      const multi = raw.includes('<br>')
      const input = document.createElement(multi ? 'textarea' : 'input')
      input.className = 'km-cell-input'
      input.value = multi ? raw.replace(/<br\s*\/?>/gi, '\n') : raw
      td.innerHTML = ''
      td.appendChild(input)
      input.focus()
      input.select?.()
      activeEditRef.current = { td, raw }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !multi) {
          e.preventDefault()
          commitCellEdit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelCellEdit()
        }
      })
      input.addEventListener('blur', () =>
        setTimeout(() => {
          if (activeEditRef.current && activeEditRef.current.td === td) commitCellEdit()
        }, 120)
      )
    }
    const cancelCellEdit = () => {
      const cur = activeEditRef.current
      if (!cur) return
      activeEditRef.current = null
      cur.td.innerHTML = inline(cur.raw)
    }
    const commitCellEdit = () => {
      const cur = activeEditRef.current
      if (!cur) return
      const { td, raw } = cur
      const input = td.querySelector('.km-cell-input')
      activeEditRef.current = null
      if (!input) {
        td.innerHTML = inline(raw)
        return
      }
      let val = input.value
      if (input.tagName === 'TEXTAREA') val = val.replace(/\n/g, '<br>')
      if (val === raw) {
        td.innerHTML = inline(raw)
        return
      }
      const lineIdx = parseInt(td.getAttribute('data-line'))
      const colIdx = parseInt(td.getAttribute('data-ci'))
      rawLinesRef.current[lineIdx] = replaceCellInLine(rawLinesRef.current[lineIdx], colIdx, val)
      emitChange()
      rerender()
    }

    // ── block "edit source": swap a non-table block's raw lines via a textarea ──
    const startBlockEdit = (bi) => {
      const b = blocksRef.current[bi]
      if (!b) return
      const blockDiv = host.querySelector('.km-block[data-bi="' + bi + '"]')
      if (!blockDiv) return
      const raw = viewLinesRef.current.slice(b.start, b.end + 1).join('\n')
      const ta = document.createElement('textarea')
      ta.className = 'km-src-editor'
      ta.value = raw
      ta.rows = Math.min(20, raw.split('\n').length + 1)
      const act = document.createElement('div')
      act.className = 'km-src-actions'
      const ok = document.createElement('button')
      ok.type = 'button'
      ok.className = 'ok'
      ok.textContent = tRef.current('edit.confirm')
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = tRef.current('edit.cancel')
      act.appendChild(ok)
      act.appendChild(cancel)
      blockDiv.innerHTML = ''
      blockDiv.appendChild(ta)
      blockDiv.appendChild(act)
      ta.focus()
      cancel.onclick = () => rerender()
      ok.onclick = () => {
        // Inherit this block's original EOL style (\r presence) so untouched
        // bytes never shift; every replacement line follows the same convention.
        const eol = (rawLinesRef.current[b.start] || '').endsWith('\r') ? '\r' : ''
        const newLines = ta.value
          .split('\n')
          .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l) + eol)
        rawLinesRef.current.splice(b.start, b.end - b.start + 1, ...newLines)
        emitChange()
        rerender()
      }
    }

    // ── structural table edits: add / remove rows & columns ──
    // Each rewrites only lines within the table's range, then re-parses. The
    // ti → table-block lookup is resolved fresh at call time (line indices shift
    // after a structural edit, so we never cache a stale block).
    const getTable = (ti) => blocksRef.current.filter((b) => b.type === 'table')[ti]

    const doInsertRow = (ti, ri, where) => {
      const b = getTable(ti)
      if (!b) return
      let at
      if (where === 'first') at = b.sepLine + 1
      else if (where === 'above') at = b.dataRows[ri]?.lineIdx
      else at = (b.dataRows[ri]?.lineIdx ?? b.sepLine) + 1
      if (at == null) return
      const row = buildTableRow(b.headers.length, rawLinesRef.current[b.headerLine] || '')
      rawLinesRef.current.splice(at, 0, row)
      emitChange()
      rerender()
    }
    const doDeleteRow = (ti, ri) => {
      const b = getTable(ti)
      if (!b) return
      const dr = b.dataRows[ri]
      if (!dr) return
      rawLinesRef.current.splice(dr.lineIdx, 1)
      emitChange()
      rerender()
    }
    const doInsertColumn = (ti, colIdx) => {
      const b = getTable(ti)
      if (!b) return
      for (let ln = b.start; ln <= b.end; ln++) {
        const content = ln === b.sepLine ? '---' : ''
        rawLinesRef.current[ln] = insertColumnInLine(rawLinesRef.current[ln], colIdx, content)
      }
      delete filterStateRef.current[ti] // column indices shifted — drop stale filters
      emitChange()
      rerender()
    }
    const doDeleteColumn = (ti, colIdx) => {
      const b = getTable(ti)
      if (!b || b.headers.length <= 1) return // never delete the last column
      for (let ln = b.start; ln <= b.end; ln++) {
        rawLinesRef.current[ln] = removeColumnInLine(rawLinesRef.current[ln], colIdx)
      }
      delete filterStateRef.current[ti] // column indices shifted — drop stale filters
      emitChange()
      rerender()
    }

    const closeMenu = () => {
      if (activeMenuRef.current) {
        activeMenuRef.current.remove()
        activeMenuRef.current = null
      }
    }
    const openTableMenu = (x, y, ti, ri, ci, isHeader) => {
      closeMenu()
      const T = tRef.current
      const b = getTable(ti)
      const items = []
      if (isHeader) {
        items.push({ label: T('keep.rowInsertFirst'), fn: () => doInsertRow(ti, ri, 'first') })
      } else {
        items.push({ label: T('keep.rowInsertAbove'), fn: () => doInsertRow(ti, ri, 'above') })
        items.push({ label: T('keep.rowInsertBelow'), fn: () => doInsertRow(ti, ri, 'below') })
      }
      items.push('sep')
      items.push({ label: T('keep.colInsertLeft'), fn: () => doInsertColumn(ti, ci) })
      items.push({ label: T('keep.colInsertRight'), fn: () => doInsertColumn(ti, ci + 1) })
      items.push('sep')
      if (!isHeader) items.push({ label: T('keep.rowDelete'), fn: () => doDeleteRow(ti, ri) })
      items.push({
        label: T('keep.colDelete'),
        fn: () => doDeleteColumn(ti, ci),
        disabled: !b || b.headers.length <= 1
      })

      const menu = document.createElement('div')
      menu.className = 'km-table-menu'
      items.forEach((it) => {
        if (it === 'sep') {
          const hr = document.createElement('div')
          hr.className = 'km-tm-sep'
          menu.appendChild(hr)
          return
        }
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'km-tm-item' + (it.disabled ? ' disabled' : '')
        el.textContent = it.label
        if (!it.disabled)
          el.onclick = () => {
            closeMenu()
            it.fn()
          }
        menu.appendChild(el)
      })
      document.body.appendChild(menu)
      const mw = menu.offsetWidth || 180
      const mh = menu.offsetHeight || 0
      menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px'
      menu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px'
      activeMenuRef.current = menu
    }

    // ── Excel-style column filter (display only — never touches rawLines) ──
    const closePop = () => {
      if (activePopRef.current) {
        activePopRef.current.remove()
        activePopRef.current = null
      }
      activePopBtnRef.current = null
    }
    const openFilterPop = (btn) => {
      closePop()
      const ti = parseInt(btn.getAttribute('data-ti'))
      const ci = parseInt(btn.getAttribute('data-ci'))
      const table = host.querySelector('table[data-ti="' + ti + '"]')
      if (!table) return
      const values = new Set()
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const td = tr.children[ci]
        const v = (td?.getAttribute('data-raw') || '').trim()
        values.add(v === '' ? '(空白)' : v)
      })
      filterStateRef.current[ti] = filterStateRef.current[ti] || {}
      const excluded = filterStateRef.current[ti][ci] || new Set()

      const pop = document.createElement('div')
      pop.className = 'km-filter-pop'
      pop.innerHTML =
        '<input class="km-fp-search" placeholder="' +
        escapeAttrLocal(tRef.current('keep.filterSearch')) +
        '">' +
        '<div class="km-fp-tools"><a data-all="1">' +
        escapeHtmlLocal(tRef.current('keep.selectAll')) +
        '</a><a data-all="0">' +
        escapeHtmlLocal(tRef.current('keep.selectNone')) +
        '</a></div>' +
        '<div class="km-fp-list"></div>' +
        '<div class="km-fp-actions"><button type="button" class="cancel">' +
        escapeHtmlLocal(tRef.current('edit.cancel')) +
        '</button><button type="button" class="ok">' +
        escapeHtmlLocal(tRef.current('edit.confirm')) +
        '</button></div>'
      const list = pop.querySelector('.km-fp-list')
      const sorted = [...values].sort((a, b) => a.localeCompare(b, 'ja'))
      const buildList = (filter) => {
        list.innerHTML = ''
        sorted
          .filter((v) => !filter || v.replace(/<br>/g, ' ').includes(filter))
          .forEach((v) => {
            const lab = document.createElement('label')
            const cb = document.createElement('input')
            cb.type = 'checkbox'
            cb.checked = !excluded.has(v)
            cb.dataset.v = v
            const span = document.createElement('span')
            span.innerHTML = inline(v)
            lab.appendChild(cb)
            lab.appendChild(span)
            list.appendChild(lab)
          })
      }
      buildList('')
      pop.querySelector('.km-fp-search').addEventListener('input', (e) => buildList(e.target.value))
      pop.querySelectorAll('.km-fp-tools a').forEach((a) => {
        a.onclick = () => {
          const on = a.dataset.all === '1'
          list.querySelectorAll('input').forEach((cb) => (cb.checked = on))
        }
      })
      pop.querySelector('.cancel').onclick = closePop
      pop.querySelector('.ok').onclick = () => {
        const ex = new Set()
        // Values hidden by the search box keep their previous excluded state.
        const shown = new Set([...list.querySelectorAll('input')].map((cb) => cb.dataset.v))
        sorted.forEach((v) => {
          if (!shown.has(v) && excluded.has(v)) ex.add(v)
        })
        list.querySelectorAll('input').forEach((cb) => {
          if (!cb.checked) ex.add(cb.dataset.v)
        })
        if (ex.size > 0) filterStateRef.current[ti][ci] = ex
        else delete filterStateRef.current[ti][ci]
        closePop()
        rerender()
      }
      document.body.appendChild(pop)
      const r = btn.getBoundingClientRect()
      pop.style.left = Math.min(r.left, window.innerWidth - 260) + 'px'
      pop.style.top = r.bottom + 4 + 'px'
      activePopRef.current = pop
      activePopBtnRef.current = btn
    }
    const applyFilter = (ti) => {
      const table = host.querySelector('table[data-ti="' + ti + '"]')
      if (!table) return
      const cols = filterStateRef.current[ti] || {}
      table.querySelectorAll('tbody tr').forEach((tr) => {
        let hide = false
        Object.keys(cols).forEach((ci) => {
          const td = tr.children[ci]
          let v = (td?.getAttribute('data-raw') || '').trim()
          if (v === '') v = '(空白)'
          if (cols[ci].has(v)) hide = true
        })
        tr.classList.toggle('km-filtered', hide)
      })
    }

    // ── event delegation on the host container ──
    const onDblClick = (e) => {
      const td = e.target.closest('td')
      if (td && host.contains(td)) {
        startCellEdit(td)
        return
      }
      // Double-clicking the highlighted area of an editable (non-table) block
      // enters source edit — same affordance as the pencil button. The guard
      // (a direct `.km-src-edit` child) excludes tables and skips a block that's
      // already editing, where the button is replaced by the textarea.
      const block = e.target.closest('.km-block')
      if (block && host.contains(block) && block.querySelector(':scope > .km-src-edit')) {
        startBlockEdit(parseInt(block.getAttribute('data-bi')))
      }
    }
    const onClick = (e) => {
      const se = e.target.closest('.km-src-edit')
      if (se) {
        startBlockEdit(parseInt(se.getAttribute('data-bi')))
        return
      }
      const fb = e.target.closest('.km-filter-btn')
      if (fb) {
        e.stopPropagation()
        // Toggle: clicking the same ▼ that opened the dropdown closes it.
        if (activePopRef.current && activePopBtnRef.current === fb) closePop()
        else openFilterPop(fb)
      }
    }
    // Right-click on a table cell → row/column add-remove menu.
    const onContextMenu = (e) => {
      const cell = e.target.closest('td, th')
      if (!cell || !host.contains(cell)) return
      const table = cell.closest('table.km-table')
      if (!table) return
      e.preventDefault()
      const ti = parseInt(table.getAttribute('data-ti'))
      const ci = parseInt(cell.getAttribute('data-ci'))
      const isHeader = cell.tagName === 'TH'
      const tr = cell.closest('tr')
      const ri = isHeader ? -1 : parseInt(tr.getAttribute('data-ri'))
      openTableMenu(e.clientX, e.clientY, ti, ri, ci, isHeader)
    }
    // Close the filter dropdown / table menu on an outside click.
    const onDocDown = (e) => {
      if (
        activePopRef.current &&
        !activePopRef.current.contains(e.target) &&
        !e.target.classList.contains('km-filter-btn')
      ) {
        closePop()
      }
      if (activeMenuRef.current && !activeMenuRef.current.contains(e.target)) closeMenu()
    }
    const onEsc = (e) => {
      if (e.key === 'Escape' && activeMenuRef.current) closeMenu()
    }

    host.addEventListener('dblclick', onDblClick)
    host.addEventListener('click', onClick)
    host.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('click', onDocDown)
    document.addEventListener('keydown', onEsc)

    rerender()

    onReady?.({
      getMarkdown: () => rawLinesRef.current.join('\n'),
      // PDF export: a clean snapshot without the edit affordances / filter ▼.
      getDocHTML: () =>
        renderDoc(rawLinesRef.current, {}, { forExport: true }).html,
      setBlock: () => {} // no block model in keep mode
    })

    return () => {
      destroyed = true
      closePop()
      closeMenu()
      onFilterChangeRef.current?.(null) // drop this tab's filter badge on unmount
      host.removeEventListener('dblclick', onDblClick)
      host.removeEventListener('click', onClick)
      host.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('click', onDocDown)
      document.removeEventListener('keydown', onEsc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hot-swap the static "edit source" labels when the UI language changes. The
  // doc HTML is rendered once on mount (rerender lives in a []-deps effect), so
  // the baked-in labels would otherwise stay in the original language. Patch them
  // in place instead of re-rendering, to preserve any active edit/filter state.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const label = tRef.current('keep.editSource')
    host.querySelectorAll('.km-src-edit').forEach((btn) => {
      btn.title = label
      const span = btn.querySelector('span')
      if (span) span.textContent = label
    })
  }, [lang])

  return <div className="km-doc" ref={hostRef} />
}

// Tiny local escapers (avoid importing if tree-shaking matters; mirror parser).
function escapeHtmlLocal(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttrLocal(s) {
  return escapeHtmlLocal(s).replace(/"/g, '&quot;')
}
