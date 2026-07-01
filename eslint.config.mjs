// Flat ESLint config (ESLint 9). The project has three runtime contexts with
// different globals — renderer (browser + React/JSX), main/preload/scripts/config
// (Node), and tests (Node + happy-dom) — so each gets its own block.
//
// Philosophy: this is the FIRST lint pass over a hand-written codebase, so it
// targets high-signal, low-noise rules (undefined globals, unused vars, real React
// bugs like a missing list key) and deliberately skips the opinionated React
// Compiler ruleset that ships with eslint-plugin-react-hooks v7. Only the two
// classic load-bearing hook rules are on. Tighten later if desired.
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// Vite injects this at build time (electron.vite.config.mjs `define`); vitest
// mirrors it. Declare it so renderer/source modules don't trip no-undef.
const buildGlobals = { __APP_VERSION__: 'readonly' }

// Shared tweaks to the recommended baseline (applied everywhere).
const baseRules = {
  // Unused vars are worth surfacing, but as a warning (not a build-blocking error)
  // and ignoring intentional throwaways: unused function args, and names prefixed
  // with `_` or caught errors.
  'no-unused-vars': [
    'warn',
    { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }
  ],
  // `catch {}` to swallow a failure is an intentional, common pattern here.
  'no-empty': ['error', { allowEmptyCatch: true }],
  // keep-parser uses NUL (\x00) sentinels in a regex on purpose (inline-code
  // placeholders); the control-char warning is a false positive for this codebase.
  'no-control-regex': 'off',
  // Harmless redundant escapes (e.g. `\-` inside a character class) — surface them
  // but don't fail the lint; run `npm run lint:fix` to clean them up.
  'no-useless-escape': 'warn'
}

export default [
  // Never lint build output, deps, native mobile projects, or the standalone
  // VSCode-extension sub-package (it has its own toolchain/globals — out of scope
  // for this app-focused config). `**/` so nested dist/out (e.g. under packages/)
  // are caught too, not just the repo-root ones.
  {
    ignores: [
      '**/out/**',
      '**/dist/**',
      '**/node_modules/**',
      'android/**',
      'ios/**',
      'build/**',
      'packages/**'
    ]
  },

  // Baseline for every JS/JSX file.
  js.configs.recommended,
  { rules: baseRules },

  // ── Renderer: browser globals + React / JSX ──
  {
    files: ['src/renderer/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...buildGlobals },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      // React 17+ automatic JSX runtime — no `import React` needed in scope.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // This project doesn't use prop-types or displayName conventions.
      'react/prop-types': 'off',
      'react/display-name': 'off',
      // Plenty of literal apostrophes/quotes in JSX copy — not a real bug.
      'react/no-unescaped-entities': 'off',
      // The two classic, high-value hook rules (NOT the full v7 compiler set).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  // ── Main process / preload / Node scripts / build configs ──
  {
    files: [
      'src/main/**/*.js',
      'src/preload/**/*.js',
      'scripts/**/*.{js,mjs}',
      '*.config.mjs',
      '*.mjs'
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Preload bridges Node and the page, so allow both global sets there.
      globals: { ...globals.node, ...globals.browser, ...buildGlobals }
    }
  },

  // ── Unit tests (vitest, env defaults to node; some opt into happy-dom) ──
  {
    files: ['test/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, ...buildGlobals }
    }
  },

  // ── Marketing site: a plain browser script (no bundler, no modules) ──
  {
    files: ['website/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser }
    }
  }
]
