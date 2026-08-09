# EasyMarkdown 路线图 / Roadmap

最后确认：2026-08-09

本文件只提供面向使用者的方向摘要，不重复维护设计、支持范围和工程任务的详细状态。

## 正式信息来源

- 当前可支持的平台、兼容基线与发布资格：[Product Support Matrix](./docs/product-support-matrix.md)
- 工程成熟度 P1〜P3、受入条件与验证证据：[工程成熟度路线图](./docs/engineering-maturity-roadmap.md)
- 当前功能及实现入口：[功能文档](./docs/features.md)
- 已结束的 UX 路线图与实施计划：[Archive index](./docs/archive/README.md)

发生冲突时，以上正式文档优先于 README、Website 文案、版本号或本地构建结果。

## 当前优先方向

1. 为 Desktop Windows 建立第一份签名安装、升级、回滚和 checksum evidence。
2. 完成 macOS x64／arm64 的签名、公证与原生 smoke。
3. 建立 VS Code VSIX／Marketplace 的安装、升级与回滚流程。
4. 将 Android 原生构建、签名与设备矩阵变成可重复的发布流程。
5. iOS TestFlight 与 Website deployment 在具备明确 owner 和自动 gate 后再升级支持等级。

EasyMarkdown 当前没有已发布的官方安装包。正式下载出现后，只会通过本仓库的 [GitHub Releases](https://github.com/cycyeasy1-svg/EasyMarkdown/releases) 以及 Product Support Matrix 中批准的渠道提供。

## 参与

需求与问题请提交到 [GitHub Issues](https://github.com/cycyeasy1-svg/EasyMarkdown/issues)。Document 的职责、metadata 和 archive 规则见 [Docs as Code 运用规约](./docs/documentation-governance.md)。
