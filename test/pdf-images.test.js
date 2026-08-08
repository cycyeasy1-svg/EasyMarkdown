import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stagePdfImages } from '../src/main/pdf-images.js'

const dirs = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('stagePdfImages', () => {
  it('stages local images with spaces and non-ASCII paths', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'easymarkdown-pdf-'))
    dirs.push(root)
    const sourcePath = join(root, '中文 image.png')
    const assetsDir = join(root, 'assets')
    await fs.writeFile(sourcePath, Buffer.from([1, 2, 3]))
    const placeholder = 'horsemd-pdf-resource-0001'
    const result = await stagePdfImages({
      html: `<img src="${placeholder}">`,
      images: [{ placeholder, src: pathToFileURL(sourcePath).href }]
    }, { assetsDir })
    expect(result.stagedImages).toBe(1)
    expect(result.unresolvedImages).toBe(0)
    expect(result.source.html).toContain('./image-0001.png')
    await expect(fs.readFile(join(assetsDir, 'image-0001.png'))).resolves.toEqual(Buffer.from([1, 2, 3]))
  })

  it('does not collide when more than nine placeholders are replaced', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'easymarkdown-pdf-'))
    dirs.push(root)
    const images = []
    const tags = []
    for (let index = 1; index <= 12; index += 1) {
      const placeholder = `horsemd-pdf-resource-${String(index).padStart(4, '0')}`
      images.push({ placeholder, src: `https://example.invalid/${index}.png` })
      tags.push(`<img src="${placeholder}">`)
    }
    const result = await stagePdfImages(
      { html: tags.join(''), images },
      { assetsDir: join(root, 'assets') }
    )
    expect(result.source.html).not.toContain('horsemd-pdf-resource-')
    expect(result.unresolvedImages).toBe(12)
  })
})
