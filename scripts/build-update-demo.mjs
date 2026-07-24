import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

function readOption(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return ''
  return String(process.argv[index + 1] || '').trim()
}

function runNode(script, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolveRun()
      else reject(new Error(`Command failed (${signal || code}): ${script}`))
    })
  })
}

const version = readOption('--version')
const provider = readOption('--provider') || 'generic'
const updateUrl = readOption('--url')
const gitlabHost = readOption('--host')
const gitlabProjectId = readOption('--project-id')
const shouldPublish = process.argv.includes('--publish')

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('Usage: npm run dist:update-demo -- --version 90.0.1 --provider generic --url https://updates.example.local/easymarkdown')
}
if (provider === 'generic' && !updateUrl) {
  throw new Error('A generic build requires --url <update-directory-url>.')
}
if (provider === 'generic' && shouldPublish) {
  throw new Error('Generic providers are uploaded manually; omit --publish.')
}
if (provider === 'gitlab' && (!gitlabHost || !gitlabProjectId)) {
  throw new Error('A GitLab build requires --host <gitlab-host> and --project-id <id-or-path>.')
}
if (!['generic', 'gitlab'].includes(provider)) {
  throw new Error('--provider must be either generic or gitlab.')
}

const env = {
  ...process.env,
  EASYMARKDOWN_BUILD_VERSION: version,
  EASYMARKDOWN_INTERNAL_UPDATE_DEMO: '1',
  EASYMARKDOWN_UPDATE_PROVIDER: provider,
  EASYMARKDOWN_UPDATE_URL: updateUrl,
  EASYMARKDOWN_GITLAB_HOST: gitlabHost,
  EASYMARKDOWN_GITLAB_PROJECT_ID: gitlabProjectId
}

const electronVite = resolve('node_modules/electron-vite/bin/electron-vite.js')
const electronBuilder = resolve('node_modules/electron-builder/out/cli/cli.js')

console.log(`[update-demo] Building ${version} for ${provider}; public distribution settings are untouched.`)
await runNode(electronVite, ['build'], env)
await runNode(
  electronBuilder,
  [
    '--config',
    'electron-builder.internal-demo.mjs',
    '--win',
    'nsis',
    '--x64',
    '--publish',
    shouldPublish ? 'always' : 'never'
  ],
  env
)
console.log('[update-demo] Output: dist-update-demo/')
