import { imageBlockSchema } from '@milkdown/kit/component/image-block'

const ratioPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/
const imageText = (value) => typeof value === 'string' ? value : ''

export function parseLegacyImageRatio(value) {
  if (typeof value !== 'string' || !ratioPattern.test(value)) return null
  const ratio = Number(value)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

export function imageBlockAttrsFromMarkdown({ url, alt, title } = {}) {
  const sourceAlt = imageText(alt)
  const sourceTitle = imageText(title)
  const legacyRatio = parseLegacyImageRatio(sourceAlt)
  const isLegacyImage = legacyRatio !== null && Boolean(sourceTitle)
  return {
    src: imageText(url),
    alt: isLegacyImage ? '' : sourceAlt,
    caption: isLegacyImage ? sourceTitle : sourceTitle || sourceAlt,
    ratio: legacyRatio ?? 1
  }
}

export function imageBlockAttrsToMarkdown({ src, alt, caption, ratio } = {}) {
  const sourceAlt = imageText(alt)
  const sourceCaption = imageText(caption)
  const numericRatio = Number(ratio)
  const resized =
    Number.isFinite(numericRatio) &&
    numericRatio > 0 &&
    Math.abs(numericRatio - 1) > 0.001
  return {
    url: imageText(src),
    alt: resized ? numericRatio.toFixed(2) : sourceAlt || sourceCaption,
    title: resized
      ? sourceCaption || undefined
      : sourceCaption && sourceCaption !== sourceAlt ? sourceCaption : undefined
  }
}

// Crepe historically stores its resize ratio in Markdown's image `alt` field.
// Keep an explicit alt attribute in the node so a normal
// `![description](image.png)` never becomes `![1.00](image.png)` after a rich
// edit, while still understanding old resized-image files.
export const imageBlockMarkdownSchema = imageBlockSchema.extendSchema((prev) => (ctx) => {
  const schema = prev(ctx)
  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      alt: { default: '', validate: 'string' }
    },
    parseMarkdown: {
      match: ({ type }) => type === 'image-block',
      runner: (state, node, type) => {
        state.addNode(type, imageBlockAttrsFromMarkdown({
          url: node.url,
          alt: node.alt,
          title: node.title
        }))
      }
    },
    toMarkdown: {
      match: (node) => node.type.name === 'image-block',
      runner: (state, node) => {
        state.openNode('paragraph')
        state.addNode('image', undefined, undefined, imageBlockAttrsToMarkdown(node.attrs))
        state.closeNode()
      }
    }
  }
})
