import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n.jsx'
import { renderDoc, inline, replaceCellInLine } from '../keep-parser.js'

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
  const { t } = useI18n()
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
      if (td && host.contains(td)) startCellEdit(td)
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
    // Close the filter dropdown on an outside click.
    const onDocDown = (e) => {
      if (
        activePopRef.current &&
        !activePopRef.current.contains(e.target) &&
        !e.target.classList.contains('km-filter-btn')
      ) {
        closePop()
      }
    }

    host.addEventListener('dblclick', onDblClick)
    host.addEventListener('click', onClick)
    document.addEventListener('click', onDocDown)

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
      onFilterChangeRef.current?.(null) // drop this tab's filter badge on unmount
      host.removeEventListener('dblclick', onDblClick)
      host.removeEventListener('click', onClick)
      document.removeEventListener('click', onDocDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="km-doc" ref={hostRef} />
}

// Tiny local escapers (avoid importing if tree-shaking matters; mirror parser).
function escapeHtmlLocal(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttrLocal(s) {
  return escapeHtmlLocal(s).replace(/"/g, '&quot;')
}
