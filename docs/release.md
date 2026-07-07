# Release Checklist

This checklist is for publishing EasyMarkdown as the official product.

## Before Tagging

1. Update versions in `package.json`, `package-lock.json`, and package-specific
   manifests such as `packages/vscode-extension/package.json`.
2. Update `CHANGELOG.md` and release-facing documentation.
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

1. Create and push a version tag, for example `v1.0.13`.
2. GitHub Actions builds Windows and macOS installers from `release.yml`.
3. Review the draft GitHub Release, add release notes, then publish it.
4. Upload any manually built mobile artifacts when needed.

## Product Metadata

- Repository: `https://github.com/cycyeasy1-svg/EasyMarkdown`
- Update API: `https://api.github.com/repos/cycyeasy1-svg/EasyMarkdown/releases/latest`
- App ID: `com.easymarkdown.app`
- License: MIT, with original `BND-1/horseMD` attribution retained in
  `NOTICE.md` and `LICENSE`.
