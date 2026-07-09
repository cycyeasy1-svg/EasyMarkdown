# Release Checklist

This checklist is for publishing EasyMarkdown as the official product.

## Before Tagging

1. Bump the version. The product version is spelled out in 11 places
   (`package.json`, both `package-lock.json` entries, the top section of
   `RELEASE_NOTES.md`, and six spots across `website/`), so do not hand-edit
   them:

   ```bash
   npm run version:check              # assert every site agrees; safe to run anytime
   npm run version:bump -- 1.2.0      # rewrite them all, refresh the lock, self-verify
   ```

   `scripts/bump-version.mjs` holds the only list of those sites. The VSCode
   extension (`packages/vscode-extension/package.json`) keeps its own cadence and
   is read, never written, by the script.

2. Update `RELEASE_NOTES.md` (user-facing, ships inside the zip — the
   `release-pack` skill writes it) and, if the release adds shortcuts or
   settings, `src/renderer/src/onboarding.js` (first-run guide + the bundled
   `README.md`, three languages). `CHANGELOG.md` is the old English history and
   is no longer maintained.
3. Run:

   ```bash
   npm test
   npm run build
   npm run lint
   ```

4. Build a local package when the touched area affects packaging:

   ```bash
   npm run dist:dir
   ```

## Publishing

1. Create and push a version tag, for example `v1.1.0`.
2. GitHub Actions builds Windows and macOS installers from `release.yml`.
3. Review the draft GitHub Release, add release notes, then publish it.
4. Upload any manually built mobile artifacts when needed.

## Product Metadata

- Repository: `https://github.com/cycyeasy1-svg/EasyMarkdown`
- Update API: `https://api.github.com/repos/cycyeasy1-svg/EasyMarkdown/releases/latest`
- App ID: `com.easymarkdown.app`
- License: MIT, with original `BND-1/horseMD` attribution retained in
  `NOTICE.md` and `LICENSE`.
