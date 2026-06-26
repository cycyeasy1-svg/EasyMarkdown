// Generate build/README.dist.md from the in-app user guide (onboarding.js), so
// the README shipped in the program directory and the first-run guide share one
// source of truth. Run before electron-builder (see package.json "dist").
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readmeDoc } from '../src/renderer/src/onboarding.js'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../build/README.dist.md')
writeFileSync(out, readmeDoc(), 'utf8')
console.log('[gen-readme] wrote ' + out)
