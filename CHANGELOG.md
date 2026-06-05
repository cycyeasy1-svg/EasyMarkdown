# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- MIT `LICENSE` file.
- GitHub Actions: CI build check (`ci.yml`) and tag-triggered release packaging (`release.yml`).
- `CONTRIBUTING.md`, `SECURITY.md`, and issue templates.
- Explicit Electron security flags (`contextIsolation`, `nodeIntegration`) and a navigation guard.

## [0.1.0] - 2026-06-05

### Added
- Initial release: tabbed, Typora-style WYSIWYG Markdown editor.
- Folder workspace with file-tree sidebar, command palette, outline panel.
- Dark/light themes, session restore, single-instance file association.
- Windows NSIS installer and macOS dmg/zip packaging.

[Unreleased]: https://github.com/BND-1/horse/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/BND-1/horse/releases/tag/v0.1.0
