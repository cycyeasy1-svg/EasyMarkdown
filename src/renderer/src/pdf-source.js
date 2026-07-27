export function preparePdfSource(html, title, typography = {}) {
  const template = document.createElement('template')
  template.innerHTML = String(html || '')

  template.content.querySelectorAll('.katex').forEach((katex) => {
    const math = katex.querySelector('.katex-mathml math')
    if (!math) return
    const printable = math.cloneNode(true)
    if (katex.closest('.katex-display, .km-math, .milkdown-code-block .preview')) {
      printable.setAttribute('display', 'block')
    }
    katex.replaceWith(printable)
  })

  const headings = [...template.content.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .map((heading, index) => {
      const id = `hm-pdf-heading-${index + 1}`
      heading.id = id
      return {
        id,
        level: Number(heading.tagName.slice(1)),
        text: (heading.textContent || '').trim()
      }
    })
    .filter((heading) => heading.text)

  return {
    html: template.innerHTML,
    headings,
    title: String(title || ''),
    typography
  }
}
