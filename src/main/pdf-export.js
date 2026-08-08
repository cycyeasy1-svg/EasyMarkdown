import { BrowserWindow, app, dialog, shell, net } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  buildPdfDocument,
  buildPdfHeaderFooter,
  resolvePdfPage
} from '../shared/pdf-document.js'
import { exportTypographyCss } from '../shared/fonts.js'
import { docLangAttr } from './helpers.js'
import { createLatestTaskRunner } from './latest-task-runner.js'
import { stagePdfImages } from './pdf-images.js'
import { getSaveDirFor, recordSaveDir } from './export-prefs.js'

const RESOURCE_WAIT_MS = 12000
const FONT_WAIT_MS = 1500
const MAX_SOURCE_HTML = 50 * 1024 * 1024

const printableResourcesScript = `
  (() => {
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), ${RESOURCE_WAIT_MS}))
    const images = [...document.images].map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })
    })

    const presentationRow = (math) =>
      math.querySelector(':scope > semantics > mrow') || math.querySelector(':scope > mrow')
    const breakOperator = (node) =>
      node?.nodeType === Node.ELEMENT_NODE && node.localName === 'mo' &&
      /^[+=\\-\\u00b1,;]$/.test((node.textContent || '').trim())
    const lineMath = (math, row, children, start, end) => {
      const line = math.cloneNode(false)
      line.setAttribute('display', 'block')
      const lineRow = row.cloneNode(false)
      children.slice(start, end).forEach((child) => lineRow.appendChild(child.cloneNode(true)))
      const semantics = math.querySelector(':scope > semantics')
      if (semantics) {
        const lineSemantics = semantics.cloneNode(false)
        lineSemantics.appendChild(lineRow)
        line.appendChild(lineSemantics)
      } else {
        line.appendChild(lineRow)
      }
      return line
    }
    const wrapDisplayMath = () => [...document.querySelectorAll('.doc math[display="block"]')]
      .reduce((wrapped, math) => {
        const parent = math.parentElement
        const available = parent?.getBoundingClientRect().width || document.documentElement.clientWidth
        if (!available || math.getBoundingClientRect().width <= available + 0.5) return wrapped
        const row = presentationRow(math)
        const children = row ? [...row.children] : []
        if (children.length < 3 || !children.some(breakOperator)) return wrapped

        const measure = document.createElement('span')
        measure.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;left:-10000px;top:0'
        parent.appendChild(measure)
        const lines = []
        let start = 0
        try {
          while (start < children.length) {
            let lastFit = start
            let lastBreak = -1
            let finished = false
            for (let end = start + 1; end <= children.length; end += 1) {
              measure.replaceChildren(lineMath(math, row, children, start, end))
              if (measure.getBoundingClientRect().width <= available + 0.5 || end === start + 1) {
                lastFit = end
                if (breakOperator(children[end - 1])) lastBreak = end
                if (end === children.length) {
                  lines.push([start, end])
                  finished = true
                  break
                }
                continue
              }
              const next = lastBreak > start ? lastBreak : lastFit
              if (next <= start) return wrapped
              lines.push([start, next])
              start = next
              finished = true
              break
            }
            if (!finished) return wrapped
            if (lines.at(-1)?.[1] === children.length) break
          }
        } finally {
          measure.remove()
        }
        if (lines.length < 2) return wrapped
        const wrapper = document.createElement('div')
        wrapper.className = 'hm-pdf-math-wrap'
        lines.forEach(([from, to]) => wrapper.appendChild(lineMath(math, row, children, from, to)))
        math.replaceWith(wrapper)
        return wrapped + 1
      }, 0)

    const fonts = document.fonts?.ready
      ? Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, ${FONT_WAIT_MS}))])
      : Promise.resolve()
    return Promise.race([
      Promise.all(images).then(() => 'ready'),
      timeout
    ]).then(async (imageStatus) => {
      await fonts
      return {
        imageStatus,
        failedImages: [...document.images].filter((image) => image.complete && !image.naturalWidth).length,
        wrappedMath: wrapDisplayMath()
      }
    })
  })()
`

function validateSource(source) {
  const html = typeof source === 'string' ? source : source?.html
  if (typeof html !== 'string' || !html.trim()) throw new Error('PDF source is empty')
  if (html.length > MAX_SOURCE_HTML) throw new Error('PDF source is too large')
}

export function createPdfExportService({ getMainWindow }) {
  const previews = new Map()
  const trackedSenders = new WeakSet()

  const render = async ({ source, options }, signal) => {
    validateSource(source)
    const page = resolvePdfPage(options)
    const tempDir = join(app.getPath('temp'), `easymarkdown-pdf-preview-${randomUUID()}`)
    const tempHtml = join(tempDir, 'index.html')
    await fs.mkdir(tempDir, { recursive: true })
    let previewWindow = null
    let printing = false
    const abort = () => {
      // printToPDF can reject before Chromium's native backend is ready again.
      // Once printing starts, let it settle and discard the stale result.
      if (!printing && previewWindow && !previewWindow.isDestroyed()) previewWindow.destroy()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      const prepared = await stagePdfImages(source, {
        assetsDir: tempDir,
        fetchImpl: (url, init) => net.fetch(url, init),
        signal
      })
      await fs.writeFile(
        tempHtml,
        buildPdfDocument(prepared.source, page, {
          typographyCss: exportTypographyCss(source?.typography),
          langAttr: docLangAttr(source?.html)
        }),
        'utf8'
      )
      if (signal.aborted) throw new Error('PDF preview canceled')
      previewWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      })
      previewWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      await previewWindow.loadFile(tempHtml)
      const resources = await previewWindow.webContents.executeJavaScript(printableResourcesScript, true)
      printing = true
      let pdf
      try {
        pdf = await previewWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: page.printPageSize,
          scale: page.scale / 100,
          pageRanges: page.pageRanges,
          preferCSSPageSize: true,
          generateTaggedPDF: page.generateOutline,
          generateDocumentOutline: page.generateOutline,
          ...buildPdfHeaderFooter(page)
        })
      } finally {
        printing = false
      }
      return {
        pdf,
        warnings: {
          resourceTimeout: resources?.imageStatus === 'timeout',
          failedImages: Number(resources?.failedImages || 0),
          wrappedMath: Number(resources?.wrappedMath || 0),
          stagedImages: Number(prepared.stagedImages || 0),
          unresolvedImages: Number(prepared.unresolvedImages || 0)
        }
      }
    } finally {
      signal.removeEventListener('abort', abort)
      if (previewWindow && !previewWindow.isDestroyed()) previewWindow.destroy()
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  const previewTasks = createLatestTaskRunner(render)

  const trackSender = (sender) => {
    if (trackedSenders.has(sender)) return
    trackedSenders.add(sender)
    const senderId = sender.id
    sender.once('destroyed', () => {
      previews.delete(senderId)
      previewTasks.cancel(senderId)
    })
  }

  const createPreview = async (event, { source, options, defaultName, sourcePath } = {}) => {
    trackSender(event.sender)
    const senderId = event.sender.id
    const result = await previewTasks.run(senderId, { source, options })
    if (result.stale) return { ok: false, stale: true }
    const { pdf, warnings } = result.value
    const token = randomUUID()
    previews.set(senderId, {
      token,
      pdf,
      defaultName: String(defaultName || 'Untitled.pdf'),
      sourcePath: typeof sourcePath === 'string' && sourcePath ? sourcePath : null
    })
    return { ok: true, token, data: pdf, warnings }
  }

  const savePreview = async (event, { token, defaultName } = {}) => {
    const preview = previews.get(event.sender.id)
    if (!preview || preview.token !== token) return { ok: false, error: 'PDF preview expired' }
    const saveDir = await getSaveDirFor(preview.sourcePath)
    const fileName = defaultName || preview.defaultName
    const result = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: saveDir ? join(saveDir, fileName) : fileName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    await fs.writeFile(result.filePath, preview.pdf)
    await recordSaveDir(preview.sourcePath, dirname(result.filePath))
    shell.openPath(result.filePath)
    return { path: result.filePath }
  }

  const disposePreview = (event, token) => {
    const preview = previews.get(event.sender.id)
    if (!preview || (token && preview.token !== token)) return false
    previews.delete(event.sender.id)
    return true
  }

  return { createPreview, savePreview, disposePreview }
}
