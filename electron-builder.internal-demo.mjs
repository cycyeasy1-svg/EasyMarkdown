import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const base = pkg.build || {}
const demoVersion = String(process.env.EASYMARKDOWN_BUILD_VERSION || '').trim()
const provider = String(process.env.EASYMARKDOWN_UPDATE_PROVIDER || 'generic').trim()

if (!/^\d+\.\d+\.\d+$/.test(demoVersion)) {
  throw new Error('EASYMARKDOWN_BUILD_VERSION must be a numeric X.Y.Z version.')
}

function updatePublishConfig() {
  if (provider === 'generic') {
    const url = String(process.env.EASYMARKDOWN_UPDATE_URL || '').trim().replace(/\/+$/, '')
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('EASYMARKDOWN_UPDATE_URL must be a valid HTTP(S) URL.')
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('EASYMARKDOWN_UPDATE_URL must be an HTTP(S) URL without embedded credentials.')
    }
    return [{ provider: 'generic', url }]
  }

  if (provider === 'gitlab') {
    const host = String(process.env.EASYMARKDOWN_GITLAB_HOST || '').trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
    const projectId = String(process.env.EASYMARKDOWN_GITLAB_PROJECT_ID || '').trim()
    if (!host || !projectId) {
      throw new Error('GitLab builds require EASYMARKDOWN_GITLAB_HOST and EASYMARKDOWN_GITLAB_PROJECT_ID.')
    }
    return [{
      provider: 'gitlab',
      host,
      projectId,
      uploadTarget: 'generic_package'
    }]
  }

  throw new Error(`Unsupported EASYMARKDOWN_UPDATE_PROVIDER: ${provider}`)
}

const { fileAssociations: _fileAssociations, ...demoWin } = base.win || {}
const { include: _installerInclude, ...demoNsis } = base.nsis || {}

export default {
  ...base,
  appId: 'com.easymarkdown.update-demo',
  productName: 'EasyMarkdown Update Demo',
  directories: {
    ...(base.directories || {}),
    output: 'dist-update-demo'
  },
  extraMetadata: {
    ...(base.extraMetadata || {}),
    name: 'easymarkdown-update-demo',
    productName: 'EasyMarkdown Update Demo',
    version: demoVersion
  },
  extraResources: [
    ...(base.extraResources || []),
    {
      from: 'build/internal-update-demo.json',
      to: 'distribution.json'
    }
  ],
  publish: updatePublishConfig(),
  win: {
    ...demoWin,
    target: ['nsis'],
    artifactName: '${productName}-${version}-win-${arch}.${ext}'
  },
  nsis: {
    ...demoNsis,
    shortcutName: 'EasyMarkdown Update Demo',
    uninstallDisplayName: 'EasyMarkdown Update Demo'
  }
}
