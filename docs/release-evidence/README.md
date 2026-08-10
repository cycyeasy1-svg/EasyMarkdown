---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# Release Evidence 運用規約

Beta／Stable product を外部公開する release ごとに、[_template.md](./_template.md) を複製して evidence を作成する。File 名は desktop の例では `v1.5.0.md`、VS Code の例では `vscode-v1.7.0.md` とする。

Evidence は release tag／artifact を作る前に `Draft` として開始し、manual smoke と artifact verification 完了後に `Approved` または `Rejected` とする。GitHub Actions log や Store record への link を保持し、secret、certificate、token、user document は保存しない。

Current tier と必須 gate は [Product Support Matrix](../product-support-matrix.md) を source of truth とする。Gate が不足した evidence を `Approved` にしてはならない。
